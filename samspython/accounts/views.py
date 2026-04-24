from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, Sum
from django.db.models.functions import Coalesce, TruncMonth
from django.utils.timezone import now
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from accounts.models import Account
from accounts.dimensions import get_active_dimension_codes, seed_default_coa_for_dimension
from accounts.reporting import build_ledger_report
from inventory.models import (
    Category,
    Customer,
    OpeningStock,
    Product,
    ProductStock,
    Production,
    RawMaterial,
    Stock,
    Supplier,
    Warehouse,
)
from purchase.models import PurchaseBankPayment, PurchaseInvoice, PurchaseInvoiceLine, PurchaseReturn, PurchaseReturnLine
from purchase.services import get_purchase_invoice_financials
from sales.models import SalesBankReceipt, SalesInvoice, SalesInvoiceLine, SalesReturn, SalesReturnLine
from sales.services import get_sales_invoice_financials

from .serializers import AccountSerializer, DimensionSerializer, ExpenseSerializer, LoginSerializer
from .services import login_service
from .models import Dimension, Expense, JournalEntry, JournalLine, User
from .journal import delete_journal_entry, sync_expense_journal
from inventory.pagination import StandardResultsSetPagination


class LoginView(APIView):
    def post(self, request):
        try:
            serializer = LoginSerializer(data=request.data)

            if not serializer.is_valid():
                raise ValidationError(serializer.errors)

            response = login_service(serializer.validated_data)

            return Response(response, status=status.HTTP_200_OK)

        except ValidationError as e:
            return Response(
                {
                    "error": True,
                    "message": "Validation failed",
                    "details": e.detail,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        except Exception as e:
            return Response(
                {
                    "error": True,
                    "message": str(e),
                    "details": {},
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )


class AccountViewSet(ModelViewSet):
    serializer_class = AccountSerializer
    permission_classes = [IsAuthenticated]
    OPENING_BANK_ROOT_CODE = "1110"

    def get_queryset(self):
        queryset = (
            Account.objects.filter(
                tenant_id=self.request.tenant_id,
                deleted_at__isnull=True,
            )
            .select_related("parent")
            .prefetch_related("children")
            .order_by("code")   
        )

        if self.action == "list":
            queryset = queryset.filter(parent__isnull=True)

        return queryset

    def perform_create(self, serializer):
        serializer.save(tenant_id=self.request.tenant_id)

    def perform_update(self, serializer):
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        try:
            instance.delete()
        except DjangoValidationError as exc:
            return Response(
                {"detail": exc.messages[0]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)

    def _get_descendant_account_codes(self, account):
        codes = {account.code}
        for child in account.children.filter(deleted_at__isnull=True):
            codes.update(self._get_descendant_account_codes(child))
        return codes

    def _resolve_tenant_ids(self, tenant_scope):
        valid_tenants = get_active_dimension_codes()
        if tenant_scope == "BOTH":
            return valid_tenants
        if tenant_scope in valid_tenants:
            return [tenant_scope]
        raise ValidationError({"tenant_scope": "Valid dimension scope is required."})

    def _money(self, value):
        return Decimal(value or 0).quantize(Decimal("0.01"))

    def _get_opening_bank_root(self, tenant_id):
        try:
            bank_root = Account.objects.get(
                tenant_id=tenant_id,
                code=self.OPENING_BANK_ROOT_CODE,
                deleted_at__isnull=True,
            )
        except Account.DoesNotExist:
            raise ValidationError(
                {"detail": "Bank root account 1110 was not found in the chart of accounts."}
            )

        # Older seeded data may still have 1110 marked as postable.
        # Opening banks must sit under 1110, so normalize it to a header account.
        if bank_root.is_postable:
            bank_root.is_postable = False
            bank_root.save(update_fields=["is_postable", "updated_at"])

        return bank_root

    def _get_next_opening_bank_code(self, bank_root):
        existing_codes = (
            Account.objects.filter(
                tenant_id=bank_root.tenant_id,
                parent=bank_root,
                deleted_at__isnull=True,
            )
            .values_list("code", flat=True)
        )
        suffixes = [
            int(code[-1])
            for code in existing_codes
            if len(code) == 4 and code[:-1] == bank_root.code[:-1] and code[-1].isdigit()
        ]
        next_suffix = (max(suffixes) if suffixes else 0) + 1
        if next_suffix > 9:
            raise ValidationError(
                {"detail": "Only 9 opening banks can be created under 1110 with the current code format."}
            )
        return f"{bank_root.code[:-1]}{next_suffix}"

    def _get_next_opening_account_code(self, bank_account):
        existing_codes = (
            Account.objects.filter(
                tenant_id=bank_account.tenant_id,
                parent=bank_account,
                deleted_at__isnull=True,
            )
            .values_list("code", flat=True)
        )
        suffixes = [
            int(code[-1])
            for code in existing_codes
            if len(code) == 5 and code.startswith(bank_account.code) and code[-1].isdigit()
        ]
        next_suffix = (max(suffixes) if suffixes else 0) + 1
        if next_suffix > 9:
            raise ValidationError(
                {
                    "detail": (
                        f"Only 9 opening accounts can be created under bank {bank_account.code} "
                        "with the current code format."
                    )
                }
            )
        return f"{bank_account.code}{next_suffix}"

    def _serialize_opening_banks(self, tenant_id):
        bank_root = self._get_opening_bank_root(tenant_id)
        queryset = (
            Account.objects.filter(
                tenant_id=tenant_id,
                parent=bank_root,
                deleted_at__isnull=True,
            )
            .prefetch_related("children")
            .order_by("code")
        )
        return {
            "root": {
                "id": str(bank_root.id),
                "code": bank_root.code,
                "name": bank_root.name,
            },
            "banks": AccountSerializer(queryset, many=True, context=self.get_serializer_context()).data,
        }

    @action(detail=False, methods=["get"], url_path="opening-accounts")
    def opening_accounts(self, request):
        return Response({"data": self._serialize_opening_banks(request.tenant_id)})

    @action(detail=False, methods=["post"], url_path="opening-banks")
    def create_opening_bank(self, request):
        tenant_id = request.tenant_id
        bank_name = (request.data.get("name") or "").strip()

        if not bank_name:
            raise ValidationError({"name": "Bank name is required."})

        bank_root = self._get_opening_bank_root(tenant_id)
        code = self._get_next_opening_bank_code(bank_root)

        account = Account.objects.create(
            tenant_id=tenant_id,
            code=code,
            name=bank_name,
            parent=bank_root,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.BANK,
            account_nature=Account.AccountNature.DEBIT,
            is_postable=False,
            is_active=bool(request.data.get("is_active", True)),
            sort_order=int(request.data.get("sort_order", 0) or 0),
        )

        return Response(
            {
                "data": AccountSerializer(account, context=self.get_serializer_context()).data,
                "message": "Opening bank created successfully.",
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], url_path="opening-account-items")
    def create_opening_account_item(self, request):
        tenant_id = request.tenant_id
        bank_id = request.data.get("bank_id")
        account_name = (request.data.get("name") or "").strip()

        if not bank_id:
            raise ValidationError({"bank_id": "Bank selection is required."})
        if not account_name:
            raise ValidationError({"name": "Opening account name is required."})

        bank_root = self._get_opening_bank_root(tenant_id)
        try:
            bank_account = Account.objects.get(
                id=bank_id,
                tenant_id=tenant_id,
                parent=bank_root,
                deleted_at__isnull=True,
            )
        except Account.DoesNotExist:
            raise ValidationError({"bank_id": "Selected bank was not found under 1110."})

        code = self._get_next_opening_account_code(bank_account)

        account = Account.objects.create(
            tenant_id=tenant_id,
            code=code,
            name=account_name,
            parent=bank_account,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.BANK,
            account_nature=Account.AccountNature.DEBIT,
            is_postable=True,
            is_active=bool(request.data.get("is_active", True)),
            sort_order=int(request.data.get("sort_order", 0) or 0),
        )

        return Response(
            {
                "data": AccountSerializer(account, context=self.get_serializer_context()).data,
                "message": "Opening account created successfully.",
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"], url_path="ledger-report")
    def ledger_report(self, request):
        tenant_scope = request.query_params.get("tenant_scope") or request.user.tenant_id
        tenant_id = request.user.tenant_id
        head_account_id = request.query_params.get("head_account_id")
        ledger_type = request.query_params.get("ledger_type")
        ledger_id = request.query_params.get("ledger_id")
        from_date_raw = request.query_params.get("from_date")
        to_date_raw = request.query_params.get("to_date")

        if not head_account_id:
            raise ValidationError({"head_account_id": "Account head is required."})
        if ledger_type not in {"account", "supplier", "customer"}:
            raise ValidationError({"ledger_type": "Valid ledger type is required."})
        if not ledger_id:
            raise ValidationError({"ledger_id": "COA selection is required."})
        if not from_date_raw or not to_date_raw:
            raise ValidationError({"date": "From date and to date are required."})

        try:
            from_date = date.fromisoformat(from_date_raw)
            to_date = date.fromisoformat(to_date_raw)
        except ValueError:
            raise ValidationError({"date": "Dates must be in YYYY-MM-DD format."})

        if from_date > to_date:
            raise ValidationError({"date": "From date cannot be greater than to date."})

        try:
            head_account = Account.objects.get(
                id=head_account_id,
                tenant_id=tenant_id,
                deleted_at__isnull=True,
            )
        except Account.DoesNotExist:
            raise ValidationError({"head_account_id": "Account head not found for this tenant."})

        descendant_codes = self._get_descendant_account_codes(head_account)

        tenant_ids = self._resolve_tenant_ids(tenant_scope)

        if ledger_type == "account":
            try:
                account = Account.objects.get(
                    id=ledger_id,
                    tenant_id=tenant_id,
                    deleted_at__isnull=True,
                )
            except Account.DoesNotExist:
                raise ValidationError({"ledger_id": "COA account not found for this tenant."})
            if account.code not in descendant_codes:
                raise ValidationError({"ledger_id": "Selected COA does not belong to the chosen head."})
            ledger_key = {"code": account.code}
            title = f"{account.code} - {account.name}"
        elif ledger_type == "supplier":
            try:
                supplier = Supplier.objects.get(
                    id=ledger_id,
                    tenant_id=tenant_id,
                    deleted_at__isnull=True,
                )
            except Supplier.DoesNotExist:
                raise ValidationError({"ledger_id": "Supplier not found for this tenant."})
            if not supplier.account_id or supplier.account.code not in descendant_codes:
                raise ValidationError({"ledger_id": "Selected supplier does not belong to the chosen head."})
            ledger_key = {"business_name": supplier.business_name}
            title = supplier.business_name
        else:
            try:
                customer = Customer.objects.get(
                    id=ledger_id,
                    tenant_id=tenant_id,
                    deleted_at__isnull=True,
                )
            except Customer.DoesNotExist:
                raise ValidationError({"ledger_id": "Customer not found for this tenant."})
            if not customer.account_id or customer.account.code not in descendant_codes:
                raise ValidationError({"ledger_id": "Selected customer does not belong to the chosen head."})
            ledger_key = {"business_name": customer.business_name}
            title = customer.business_name

        payload = build_ledger_report(
            tenant_ids=tenant_ids,
            ledger_type=ledger_type,
            ledger_key=ledger_key,
            from_date=from_date,
            to_date=to_date,
            title=title,
        )

        return Response(
            {
                "data": {
                    "tenant_scope": tenant_scope,
                    "head_account_id": head_account_id,
                    "ledger_type": ledger_type,
                    "ledger_id": ledger_id,
                    "from_date": from_date.isoformat(),
                    "to_date": to_date.isoformat(),
                    **payload,
                }
            }
        )

    @action(detail=False, methods=["get"], url_path="coa-completeness-report")
    def coa_completeness_report(self, request):
        tenant_scope = request.query_params.get("tenant_scope") or request.user.tenant_id
        tenant_ids = self._resolve_tenant_ids(tenant_scope)

        categories = []
        raw_materials = []
        products_missing = []
        product_mismatches = []

        category_queryset = Category.objects.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
        ).select_related("inventory_account", "cogs_account", "revenue_account")
        raw_material_queryset = RawMaterial.objects.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
        ).select_related("category", "inventory_account")
        product_queryset = Product.objects.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
        ).select_related(
            "category",
            "inventory_account",
            "cogs_account",
            "revenue_account",
            "category__inventory_account",
            "category__cogs_account",
            "category__revenue_account",
        )

        def account_label(account):
            if not account:
                return None
            return f"{account.code} - {account.name}"

        for category in category_queryset:
            missing_fields = []
            if not category.inventory_account_id:
                missing_fields.append("inventory_account")
            if not category.cogs_account_id:
                missing_fields.append("cogs_account")
            if not category.revenue_account_id:
                missing_fields.append("revenue_account")

            if missing_fields:
                categories.append(
                    {
                        "id": str(category.id),
                        "tenant": category.tenant_id,
                        "name": category.name,
                        "missing_fields": missing_fields,
                    }
                )

        for raw_material in raw_material_queryset:
            if not raw_material.inventory_account_id:
                raw_materials.append(
                    {
                        "id": str(raw_material.id),
                        "tenant": raw_material.tenant_id,
                        "name": raw_material.name,
                        "category_name": raw_material.category.name if raw_material.category else None,
                        "category_inventory_account": account_label(
                            raw_material.category.inventory_account if raw_material.category else None
                        ),
                    }
                )

        for product in product_queryset:
            missing_fields = []
            if not product.inventory_account_id:
                missing_fields.append("inventory_account")
            if not product.cogs_account_id:
                missing_fields.append("cogs_account")
            if not product.revenue_account_id:
                missing_fields.append("revenue_account")

            if missing_fields:
                products_missing.append(
                    {
                        "id": str(product.id),
                        "tenant": product.tenant_id,
                        "name": product.name,
                        "category_name": product.category.name if product.category else None,
                        "missing_fields": missing_fields,
                    }
                )

            if product.category_id:
                comparisons = [
                    ("inventory_account", "Inventory"),
                    ("cogs_account", "COGS"),
                    ("revenue_account", "Revenue"),
                ]
                for field_name, label in comparisons:
                    category_value = getattr(product.category, field_name)
                    product_value = getattr(product, field_name)
                    category_value_id = getattr(product.category, f"{field_name}_id")
                    if category_value and product_value and category_value_id:
                        if product_value.id != category_value_id:
                            product_mismatches.append(
                                {
                                    "id": str(product.id),
                                    "tenant": product.tenant_id,
                                    "name": product.name,
                                    "category_name": product.category.name,
                                    "field": field_name,
                                    "field_label": label,
                                    "category_account": account_label(category_value),
                                    "product_account": account_label(product_value),
                                }
                            )

        payload = {
            "tenant_scope": tenant_scope,
            "summary": {
                "categories_missing_count": len(categories),
                "raw_materials_missing_count": len(raw_materials),
                "products_missing_count": len(products_missing),
                "product_mismatch_count": len(product_mismatches),
            },
            "categories_missing": categories,
            "raw_materials_missing": raw_materials,
            "products_missing": products_missing,
            "product_mismatches": product_mismatches,
        }

        return Response({"data": payload})

    @action(detail=False, methods=["get"], url_path="dashboard-overview")
    def dashboard_overview(self, request):
        tenant_id = request.user.tenant_id
        today = date.today()
        month_start = today.replace(day=1)

        total_sales = (
            SalesInvoice.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
            ).aggregate(total=Coalesce(Sum("net_amount"), Decimal("0.00")))["total"]
            or Decimal("0.00")
        )
        total_purchases = (
            PurchaseInvoice.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
            ).aggregate(total=Coalesce(Sum("net_amount"), Decimal("0.00")))["total"]
            or Decimal("0.00")
        )

        products_count = Product.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ).count()
        raw_materials_count = RawMaterial.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ).count()
        customers_count = Customer.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ).count()
        suppliers_count = Supplier.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ).count()
        warehouses_count = Warehouse.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ).count()
        opening_stock_count = OpeningStock.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ).count()

        month_sales = (
            SalesInvoice.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
                date__gte=month_start,
                date__lte=today,
            ).aggregate(total=Coalesce(Sum("net_amount"), Decimal("0.00")))["total"]
            or Decimal("0.00")
        )
        month_purchases = (
            PurchaseInvoice.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
                date__gte=month_start,
                date__lte=today,
            ).aggregate(total=Coalesce(Sum("net_amount"), Decimal("0.00")))["total"]
            or Decimal("0.00")
        )
        month_receipts = (
            SalesBankReceipt.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
                date__gte=month_start,
                date__lte=today,
            ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
            or Decimal("0.00")
        )
        month_payments = (
            PurchaseBankPayment.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
                date__gte=month_start,
                date__lte=today,
            ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
            or Decimal("0.00")
        )
        month_profit = (
            JournalLine.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
                journal_entry__deleted_at__isnull=True,
                journal_entry__date__gte=month_start,
                journal_entry__date__lte=today,
                account__account_type=Account.AccountType.REVENUE,
            ).aggregate(total=Coalesce(Sum("credit"), Decimal("0.00")))["total"]
            or Decimal("0.00")
        ) - (
            JournalLine.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
                journal_entry__deleted_at__isnull=True,
                journal_entry__date__gte=month_start,
                journal_entry__date__lte=today,
                account__account_type=Account.AccountType.COGS,
            ).aggregate(total=Coalesce(Sum("debit"), Decimal("0.00")))["total"]
            or Decimal("0.00")
        )
        total_profit = (
            JournalLine.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
                journal_entry__deleted_at__isnull=True,
                account__account_type=Account.AccountType.REVENUE,
            ).aggregate(total=Coalesce(Sum("credit"), Decimal("0.00")))["total"]
            or Decimal("0.00")
        ) - (
            JournalLine.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
                journal_entry__deleted_at__isnull=True,
                account__account_type=Account.AccountType.COGS,
            ).aggregate(total=Coalesce(Sum("debit"), Decimal("0.00")))["total"]
            or Decimal("0.00")
        )

        receivables_outstanding = Decimal("0.00")
        for invoice in SalesInvoice.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ):
            receivables_outstanding += get_sales_invoice_financials(invoice)["balance_amount"]

        payables_outstanding = Decimal("0.00")
        for invoice in PurchaseInvoice.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ):
            payables_outstanding += get_purchase_invoice_financials(invoice)["balance_amount"]

        raw_material_stock_value = Decimal("0.00")
        for stock in Stock.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
            raw_material__deleted_at__isnull=True,
        ).select_related("raw_material"):
            raw_material_stock_value += self._money(stock.quantity) * self._money(
                stock.raw_material.purchase_price
            )

        product_stock_value = Decimal("0.00")
        for stock in ProductStock.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
            product__deleted_at__isnull=True,
        ).select_related("product"):
            product_stock_value += self._money(stock.quantity) * self._money(
                stock.product.net_amount
            )

        monthly_purchase_map = {
            item["month"]: self._money(item["total"])
            for item in PurchaseInvoice.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
            )
            .annotate(month=TruncMonth("date"))
            .values("month")
            .annotate(total=Coalesce(Sum("net_amount"), Decimal("0.00")))
        }
        monthly_sales_map = {
            item["month"]: self._money(item["total"])
            for item in SalesInvoice.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
            )
            .annotate(month=TruncMonth("date"))
            .values("month")
            .annotate(total=Coalesce(Sum("net_amount"), Decimal("0.00")))
        }
        monthly_receipt_map = {
            item["month"]: self._money(item["total"])
            for item in SalesBankReceipt.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
            )
            .annotate(month=TruncMonth("date"))
            .values("month")
            .annotate(total=Coalesce(Sum("amount"), Decimal("0.00")))
        }
        monthly_payment_map = {
            item["month"]: self._money(item["total"])
            for item in PurchaseBankPayment.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
            )
            .annotate(month=TruncMonth("date"))
            .values("month")
            .annotate(total=Coalesce(Sum("amount"), Decimal("0.00")))
        }
        monthly_revenue_map = {
            item["month"]: self._money(item["total"])
            for item in JournalLine.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
                journal_entry__deleted_at__isnull=True,
                account__account_type=Account.AccountType.REVENUE,
            )
            .annotate(month=TruncMonth("journal_entry__date"))
            .values("month")
            .annotate(total=Coalesce(Sum("credit"), Decimal("0.00")))
        }
        monthly_cogs_map = {
            item["month"]: self._money(item["total"])
            for item in JournalLine.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
                journal_entry__deleted_at__isnull=True,
                account__account_type=Account.AccountType.COGS,
            )
            .annotate(month=TruncMonth("journal_entry__date"))
            .values("month")
            .annotate(total=Coalesce(Sum("debit"), Decimal("0.00")))
        }

        month_cursor = today.replace(day=1)
        monthly_trends = []
        for _ in range(6):
            sales_total = monthly_sales_map.get(month_cursor, Decimal("0.00"))
            purchase_total = monthly_purchase_map.get(month_cursor, Decimal("0.00"))
            receipt_total = monthly_receipt_map.get(month_cursor, Decimal("0.00"))
            payment_total = monthly_payment_map.get(month_cursor, Decimal("0.00"))
            profit_total = self._money(
                monthly_revenue_map.get(month_cursor, Decimal("0.00"))
                - monthly_cogs_map.get(month_cursor, Decimal("0.00"))
            )
            monthly_trends.append(
                {
                    "month": month_cursor.strftime("%b %Y"),
                    "sales": str(self._money(sales_total)),
                    "purchases": str(self._money(purchase_total)),
                    "receipts": str(self._money(receipt_total)),
                    "payments": str(self._money(payment_total)),
                    "profit": str(profit_total),
                }
            )
            if month_cursor.month == 1:
                month_cursor = month_cursor.replace(year=month_cursor.year - 1, month=12)
            else:
                month_cursor = month_cursor.replace(month=month_cursor.month - 1)
        monthly_trends.reverse()

        journal_summary = JournalLine.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
            journal_entry__deleted_at__isnull=True,
        ).aggregate(
            debit=Coalesce(Sum("debit"), Decimal("0.00")),
            credit=Coalesce(Sum("credit"), Decimal("0.00")),
            count=Count("id"),
        )

        recent_activity = []
        recent_entries = JournalEntry.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ).order_by("-date", "-created_at")[:8]
        for entry in recent_entries:
            entry_totals = entry.lines.filter(deleted_at__isnull=True).aggregate(
                debit=Coalesce(Sum("debit"), Decimal("0.00")),
                credit=Coalesce(Sum("credit"), Decimal("0.00")),
            )
            recent_activity.append(
                {
                    "id": str(entry.id),
                    "reference": entry.reference,
                    "date": entry.date.isoformat(),
                    "document_type": entry.document_type,
                    "people_type": entry.people_type,
                    "people_name": entry.people_name,
                    "description": entry.description,
                    "debit": str(self._money(entry_totals["debit"])),
                    "credit": str(self._money(entry_totals["credit"])),
                }
            )

        top_customers = []
        for customer in Customer.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ):
            customer_total = (
                SalesInvoice.objects.filter(
                    tenant_id=tenant_id,
                    customer=customer,
                    deleted_at__isnull=True,
                ).aggregate(total=Coalesce(Sum("net_amount"), Decimal("0.00")))["total"]
                or Decimal("0.00")
            )
            if customer_total > 0:
                top_customers.append(
                    {
                        "name": customer.business_name,
                        "amount": self._money(customer_total),
                    }
                )
        top_customers = sorted(top_customers, key=lambda item: item["amount"], reverse=True)[:5]

        top_suppliers = []
        for supplier in Supplier.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ):
            supplier_total = (
                PurchaseInvoice.objects.filter(
                    tenant_id=tenant_id,
                    supplier=supplier,
                    deleted_at__isnull=True,
                ).aggregate(total=Coalesce(Sum("net_amount"), Decimal("0.00")))["total"]
                or Decimal("0.00")
            )
            if supplier_total > 0:
                top_suppliers.append(
                    {
                        "name": supplier.business_name,
                        "amount": self._money(supplier_total),
                    }
                )
        top_suppliers = sorted(top_suppliers, key=lambda item: item["amount"], reverse=True)[:5]

        stock_mix_total = self._money(raw_material_stock_value + product_stock_value)
        payload = {
            "tenant_id": tenant_id,
            "today": today.isoformat(),
            "hero": {
                "title": f"{tenant_id.replace('_', ' ').title()} Command Center",
                "subtitle": "Track commercial flow, stock position, and accounting movement from one dashboard.",
            },
            "counts": {
                "products": products_count,
                "raw_materials": raw_materials_count,
                "customers": customers_count,
                "suppliers": suppliers_count,
                "warehouses": warehouses_count,
                "opening_stock": opening_stock_count,
            },
            "kpis": {
                "total_sales": str(self._money(total_sales)),
                "total_purchases": str(self._money(total_purchases)),
                "total_profit": str(self._money(total_profit)),
                "sales_this_month": str(self._money(month_sales)),
                "purchases_this_month": str(self._money(month_purchases)),
                "profit_this_month": str(self._money(month_profit)),
                "receipts_this_month": str(self._money(month_receipts)),
                "payments_this_month": str(self._money(month_payments)),
                "receivables_outstanding": str(self._money(receivables_outstanding)),
                "payables_outstanding": str(self._money(payables_outstanding)),
                "raw_material_stock_value": str(self._money(raw_material_stock_value)),
                "product_stock_value": str(self._money(product_stock_value)),
            },
            "monthly_trends": monthly_trends,
            "stock_mix": {
                "raw_materials": str(self._money(raw_material_stock_value)),
                "products": str(self._money(product_stock_value)),
                "total": str(stock_mix_total),
            },
            "journal_health": {
                "lines_posted": journal_summary["count"] or 0,
                "debit_total": str(self._money(journal_summary["debit"])),
                "credit_total": str(self._money(journal_summary["credit"])),
            },
            "top_customers": [
                {"name": item["name"], "amount": str(item["amount"])} for item in top_customers
            ],
            "top_suppliers": [
                {"name": item["name"], "amount": str(item["amount"])} for item in top_suppliers
            ],
            "recent_activity": recent_activity,
        }
        return Response({"data": payload})

    @action(detail=False, methods=["get"], url_path="party-ledger-report")
    def party_ledger_report(self, request):
        tenant_id = request.user.tenant_id
        partner_type = request.query_params.get("partner_type")
        partner_id = request.query_params.get("partner_id")
        from_date_raw = request.query_params.get("from_date")
        to_date_raw = request.query_params.get("to_date")

        if partner_type not in {"customer", "supplier"}:
            raise ValidationError({"partner_type": "Partner type must be customer or supplier."})
        if not partner_id:
            raise ValidationError({"partner_id": "Partner selection is required."})

        if partner_type == "customer":
            try:
                partner = Customer.objects.get(
                    id=partner_id,
                    tenant_id=tenant_id,
                    deleted_at__isnull=True,
                )
            except Customer.DoesNotExist:
                raise ValidationError({"partner_id": "Customer not found for this tenant."})
            people_type = "Customer"
            summary_labels = [
                "Sales Invoice",
                "Sales Return",
                "Bank Receipt",
                "Journal Voucher",
            ]
        else:
            try:
                partner = Supplier.objects.get(
                    id=partner_id,
                    tenant_id=tenant_id,
                    deleted_at__isnull=True,
                )
            except Supplier.DoesNotExist:
                raise ValidationError({"partner_id": "Supplier not found for this tenant."})
            people_type = "Supplier"
            summary_labels = [
                "Purchase Invoice",
                "Purchase Return",
                "Bank Payment",
                "Journal Voucher",
            ]

        from_date = None
        to_date = None
        if from_date_raw:
            try:
                from_date = date.fromisoformat(from_date_raw)
            except ValueError:
                raise ValidationError({"from_date": "From date must be in YYYY-MM-DD format."})
        if to_date_raw:
            try:
                to_date = date.fromisoformat(to_date_raw)
            except ValueError:
                raise ValidationError({"to_date": "To date must be in YYYY-MM-DD format."})
        if from_date and to_date and from_date > to_date:
            raise ValidationError({"date": "From date cannot be greater than to date."})

        queryset = JournalLine.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
            journal_entry__deleted_at__isnull=True,
            people_type=people_type,
            people_name=partner.business_name,
        ).select_related("journal_entry", "account")

        if from_date:
            queryset = queryset.filter(journal_entry__date__gte=from_date)
        if to_date:
            queryset = queryset.filter(journal_entry__date__lte=to_date)

        rows = []
        document_totals = {label: Decimal("0.00") for label in summary_labels}
        total_debit = Decimal("0.00")
        total_credit = Decimal("0.00")

        for line in queryset.order_by("journal_entry__date", "journal_entry__reference", "created_at"):
            entry = line.journal_entry

            # Party ledger is shown from the party statement perspective,
            # so we invert the control-account journal direction.
            display_debit = self._money(line.credit)
            display_credit = self._money(line.debit)
            document_type = entry.document_type or "Journal Voucher"

            rows.append(
                {
                    "id": entry.reference,
                    "document_type": document_type,
                    "date": entry.date.isoformat(),
                    "remarks": line.line_description or entry.description or "",
                    "debit": str(display_debit),
                    "credit": str(display_credit),
                }
            )

            if document_type in document_totals:
                document_totals[document_type] += display_debit + display_credit

            total_debit += display_debit
            total_credit += display_credit

        if partner_type == "customer":
            grand_total = self._money(
                document_totals.get("Sales Invoice", Decimal("0.00"))
                - document_totals.get("Sales Return", Decimal("0.00"))
                - document_totals.get("Bank Receipt", Decimal("0.00"))
            )
        else:
            grand_total = self._money(
                document_totals.get("Purchase Invoice", Decimal("0.00"))
                - document_totals.get("Purchase Return", Decimal("0.00"))
                - document_totals.get("Bank Payment", Decimal("0.00"))
            )

        summary = {
            "document_totals": [
                {"label": label, "amount": str(self._money(document_totals.get(label, Decimal("0.00"))))}
                for label in summary_labels
            ],
            "grand_total": str(grand_total),
            "total_debit": str(self._money(total_debit)),
            "total_credit": str(self._money(total_credit)),
        }

        return Response(
            {
                "data": {
                    "partner_type": partner_type,
                    "partner_id": str(partner.id),
                    "partner_name": partner.business_name,
                    "from_date": from_date.isoformat() if from_date else "",
                    "to_date": to_date.isoformat() if to_date else "",
                    "rows": rows,
                    "summary": summary,
                }
            }
        )


class ExpenseViewSet(ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        return (
            Expense.objects.filter(
                tenant_id=self.request.user.tenant_id,
                deleted_at__isnull=True,
            )
            .select_related("bank_account", "expense_account")
            .order_by("-date", "-created_at")
        )

    def _get_serializable_expense(self, expense_id):
        return self.get_queryset().get(id=expense_id)

    def create(self, request, *args, **kwargs):
        with transaction.atomic():
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            expense = serializer.save()
            sync_expense_journal(self._get_serializable_expense(expense.id))
        response_serializer = self.get_serializer(self._get_serializable_expense(expense.id))
        return Response(
            {
                "data": response_serializer.data,
                "message": "Expense created successfully",
            },
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        with transaction.atomic():
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            expense = serializer.save()
            sync_expense_journal(self._get_serializable_expense(expense.id))
        response_serializer = self.get_serializer(self._get_serializable_expense(expense.id))
        return Response(response_serializer.data)

    def perform_destroy(self, instance):
        instance.deleted_at = now()
        instance.save(update_fields=["deleted_at", "updated_at"])

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        with transaction.atomic():
            self.perform_destroy(instance)
            delete_journal_entry(
                JournalEntry.SourceType.EXPENSE,
                instance.id,
                instance.tenant_id,
            )
        return Response(
            {"data": None, "message": "Expense deleted successfully"},
            status=status.HTTP_200_OK,
        )


class DimensionViewSet(ModelViewSet):
    serializer_class = DimensionSerializer
    permission_classes = [IsAuthenticated]
    queryset = Dimension.objects.all().order_by("name")

    def _has_dimension_dependencies(self, dimension_code):
        dependency_checks = [
            User.objects.filter(tenant_id=dimension_code),
            Category.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            RawMaterial.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            Product.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            Customer.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            Supplier.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            Warehouse.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            OpeningStock.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            Stock.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            ProductStock.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            Production.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            PurchaseInvoice.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            PurchaseInvoiceLine.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            PurchaseReturn.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            PurchaseReturnLine.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            PurchaseBankPayment.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            SalesInvoice.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            SalesInvoiceLine.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            SalesReturn.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            SalesReturnLine.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            SalesBankReceipt.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            JournalEntry.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            JournalLine.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            Expense.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
        ]
        return any(queryset.exists() for queryset in dependency_checks)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        dimension = serializer.save()
        seed_default_coa_for_dimension(dimension.code)
        return Response(
            {
                "data": self.get_serializer(dimension).data,
                "message": "Dimension created successfully",
            },
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        if request.user.tenant_id == instance.code:
            return Response(
                {"detail": "You cannot delete the currently active dimension."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if self._has_dimension_dependencies(instance.code):
            return Response(
                {"detail": "Cannot delete dimension because active users or business records exist."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            for account in Account.objects.filter(tenant_id=instance.code).order_by("-level", "-code"):
                Account.objects.filter(pk=account.pk).delete()
            instance.delete()

        return Response(
            {"data": None, "message": "Dimension deleted successfully"},
            status=status.HTTP_200_OK,
        )
