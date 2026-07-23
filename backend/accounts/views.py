from collections import defaultdict
from datetime import date
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, Min, Prefetch, Q, Sum
from django.db.models.functions import Coalesce, TruncMonth
from django.utils.timezone import now
from rest_framework import filters, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from accounts.models import Account
from accounts.dimensions import get_user_active_dimension_codes, seed_default_coa_for_dimension
from accounts.reporting import (
    build_account_statement_report,
    build_balance_sheet_report,
    build_cash_flow_summary_report,
    build_comparative_profit_and_loss_report,
    build_day_book_report,
    build_expense_analysis_report,
    build_general_ledger_report,
    build_ledger_report,
    build_party_ledger_report,
    build_payable_aging_report,
    build_profit_and_loss_report,
    build_inventory_stock_report,
    build_receivable_aging_report,
    build_sales_report,
    build_salesman_performance_report,
    build_trial_balance_report,
    get_account_balance,
)
from inventory.models import (
    Category,
    Customer,
    OpeningStock,
    Product,
    ProductStock,
    Production,
    RawMaterial,
    Salesman,
    Stock,
    Supplier,
    Warehouse,
)
from purchase.models import (
    PurchaseBankPayment,
    PurchaseBankPaymentLine,
    PurchaseInvoice,
    PurchaseInvoiceLine,
    PurchaseReturn,
    PurchaseReturnLine,
)
from purchase.services import get_purchase_invoice_financials
from sales.models import (
    SalesBankReceipt,
    SalesBankReceiptLine,
    SalesInvoice,
    SalesInvoiceLine,
    SalesReturn,
    SalesReturnLine,
)
from sales.services import get_sales_invoice_financials

from common.tenancy import get_request_tenant_filter, get_request_tenant_ids, get_shared_tenant_ids
from .serializers import (
    AccountSerializer,
    AuditLogSerializer,
    BankTransferSerializer,
    DimensionSerializer,
    ExpenseSerializer,
    LoginSerializer,
)
from .serializers import (
    AdminInquirySerializer,
    AdminLoginSerializer,
    AdminUserSerializer,
    InquirySerializer,
    TenantStaffSerializer,
)
from .services import admin_login_service, login_service
from .models import (
    AuditLog,
    BankTransfer,
    Dimension,
    Expense,
    ExpenseLine,
    Inquiry,
    JournalEntry,
    JournalLine,
    User,
)
from .audit import log_action
from .audit_mixin import AuditedModelMixin
from .journal import (
    delete_bank_transfer_journals,
    delete_journal_entry,
    sync_bank_transfer_journal,
    sync_expense_journal,
)
from inventory.pagination import StandardResultsSetPagination
from accounts.authentication import AdminJWTAuthentication
from accounts.access_control import (
    filter_queryset_by_allowed_salesmen,
    get_user_allowed_salesman_ids,
    user_can_access_salesman,
)


class LoginView(APIView):
    def post(self, request):
        try:
            serializer = LoginSerializer(data=request.data)

            if not serializer.is_valid():
                raise ValidationError(serializer.errors)

            response = login_service(serializer.validated_data)
            email = serializer.validated_data.get("email")
            actor = User.objects.filter(email=email).first()
            log_action(
                request,
                action=AuditLog.Action.LOGIN,
                entity_type="session",
                entity_id=str(getattr(actor, "pk", "") or ""),
                summary=f"User logged in ({getattr(actor, 'username', email) or email})",
                metadata={"email": email},
                user=actor,
                tenant_id=getattr(actor, "tenant_id", None) or "",
            )

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


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        log_action(
            request,
            action=AuditLog.Action.LOGOUT,
            entity_type="session",
            entity_id=str(getattr(user, "pk", "") or ""),
            summary=f"User logged out ({getattr(user, 'username', '') or getattr(user, 'email', '')})",
            user=user,
            tenant_id=getattr(request, "tenant_id", None)
            or getattr(user, "tenant_id", None)
            or "",
        )
        return Response(
            {"data": None, "message": "Logged out successfully"},
            status=status.HTTP_200_OK,
        )


class AdminLoginView(APIView):
    def post(self, request):
        try:
            serializer = AdminLoginSerializer(data=request.data)

            if not serializer.is_valid():
                raise ValidationError(serializer.errors)

            response = admin_login_service(serializer.validated_data)

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


class AdminUserViewSet(ModelViewSet):
    serializer_class = AdminUserSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [AdminJWTAuthentication]
    queryset = User.objects.filter(is_staff=False).select_related("parent_user").order_by(
        "-date_joined"
    )


class IsTenantOrgAdmin(BasePermission):
    """Tenant owner: not staff, not a child user, has at least one active dimension."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_staff:
            return False
        if user.parent_user_id:
            return False
        return bool(get_user_active_dimension_codes(user))


class TenantStaffViewSet(AuditedModelMixin, ModelViewSet):
    """Org admin creates child users with UI module permissions (same tenant)."""

    audit_entity_type = "tenant_staff"
    serializer_class = TenantStaffSerializer
    permission_classes = [IsAuthenticated, IsTenantOrgAdmin]
    http_method_names = ["get", "post", "put", "patch", "delete"]

    def get_queryset(self):
        return (
            User.objects.filter(
                parent_user=self.request.user,
                tenant_id=self.request.tenant_id,
            )
            .order_by("-date_joined")
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["parent_user"] = self.request.user
        return ctx


class AuditLogViewSet(ModelViewSet):
    """Tenant org admin read-only activity log."""

    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, IsTenantOrgAdmin]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ["actor_username", "summary", "entity_type", "entity_id", "action"]
    http_method_names = ["get"]

    def get_queryset(self):
        tenant_ids = get_user_active_dimension_codes(self.request.user)
        current = getattr(self.request, "tenant_id", None) or self.request.user.tenant_id
        if current and current not in tenant_ids:
            tenant_ids = list(tenant_ids) + [current]

        queryset = AuditLog.objects.filter(
            deleted_at__isnull=True,
        ).filter(
            Q(tenant_id__in=tenant_ids) | Q(actor=self.request.user)
        )

        action = (self.request.query_params.get("action") or "").strip().upper()
        if action:
            queryset = queryset.filter(action=action)

        entity_type = (self.request.query_params.get("entity_type") or "").strip()
        if entity_type:
            queryset = queryset.filter(entity_type=entity_type)

        date_from = (self.request.query_params.get("date_from") or "").strip()
        date_to = (self.request.query_params.get("date_to") or "").strip()
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)

        return queryset.select_related("actor").order_by("-created_at")


class AdminDimensionViewSet(ModelViewSet):
    serializer_class = DimensionSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [AdminJWTAuthentication]
    queryset = Dimension.objects.filter(is_active=True).order_by("name")
    http_method_names = ["get"]


class InquiryViewSet(ModelViewSet):
    serializer_class = InquirySerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    http_method_names = ["get", "post"]

    def get_queryset(self):
        return Inquiry.objects.filter(
            tenant_id=self.request.tenant_id,
            deleted_at__isnull=True,
        ).order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(
            user_name=self.request.user.username or self.request.user.email or "User",
        )


class AdminInquiryViewSet(ModelViewSet):
    serializer_class = AdminInquirySerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [AdminJWTAuthentication]
    http_method_names = ["get", "patch"]
    queryset = Inquiry.objects.filter(deleted_at__isnull=True).order_by("-created_at")


class AccountViewSet(ModelViewSet):
    serializer_class = AccountSerializer
    permission_classes = [IsAuthenticated]
    OPENING_BANK_ROOT_CODE = "1110"
    SHARED_DISPLAY_LEVEL = 3

    def _get_shared_tenant_ids(self):
        """Chart of Accounts is shared across every dimension the user owns,
        so account queries always span the user's allowed dimensions instead
        of being scoped to the currently selected one."""

        tenant_ids = get_user_active_dimension_codes(self.request.user)
        requested_tenant_ids = get_request_tenant_ids(self.request)
        for tenant_id in requested_tenant_ids:
            if tenant_id and tenant_id not in tenant_ids:
                tenant_ids.append(tenant_id)
        if not tenant_ids:
            current = getattr(self.request, "tenant_id", "") or getattr(
                self.request.user, "tenant_id", ""
            )
            if current:
                tenant_ids = [current]
        return tenant_ids

    def _get_detail_tenant_ids(self):
        return self._get_shared_tenant_ids()

    def get_queryset(self):
        tenant_filter = {"tenant_id__in": self._get_shared_tenant_ids()}

        queryset = (
            Account.objects.filter(
                **tenant_filter,
                deleted_at__isnull=True,
            )
            .select_related("parent")
            .prefetch_related("children")
            .order_by("code", "tenant_id", "created_at")
        )

        if self.action == "list":
            queryset = queryset.filter(parent__isnull=True)

        return queryset

    @staticmethod
    def _is_opening_bank_header(account):
        return (
            account.level == 4
            and account.parent is not None
            and account.parent.code == "1110"
        )

    def _dedupe_shared_display_accounts(self, accounts):
        deduped = []
        seen_codes = set()

        for account in accounts:
            if account.code in seen_codes:
                continue
            seen_codes.add(account.code)
            deduped.append(account)

        return deduped

    def list(self, request, *args, **kwargs):
        queryset = list(self.filter_queryset(self.get_queryset()))
        serializer = self.get_serializer(
            self._dedupe_shared_display_accounts(queryset),
            many=True,
        )
        return Response(serializer.data)

    def perform_create(self, serializer):
        serializer.save()

    def perform_update(self, serializer):
        serializer.save()

    def _is_dimension_specific_opening_account(self, account):
        return (
            account.is_postable
            and account.parent is not None
            and self._is_opening_bank_header(account.parent)
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        try:
            if self._is_dimension_specific_opening_account(instance):
                instance.delete()
            else:
                tenant_ids = self._get_shared_tenant_ids()
                copies = Account.objects.filter(
                    tenant_id__in=tenant_ids,
                    code=instance.code,
                    deleted_at__isnull=True,
                )
                for copy in copies:
                    copy.delete()
        except DjangoValidationError as exc:
            return Response(
                {"detail": exc.messages[0]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)

    def _get_descendant_account_codes(self, account, tenant_ids=None):
        codes = {account.code}
        if tenant_ids:
            # Walk the descendants by code across every dimension so the
            # tree reflects the unified COA the user actually sees.
            parents = Account.objects.filter(
                tenant_id__in=tenant_ids,
                code=account.code,
                level=account.level,
                deleted_at__isnull=True,
            )
            children = Account.objects.filter(
                tenant_id__in=tenant_ids,
                parent__in=parents,
                deleted_at__isnull=True,
            )
        else:
            children = account.children.filter(deleted_at__isnull=True)
        for child in children:
            codes.update(self._get_descendant_account_codes(child, tenant_ids))
        return codes

    def _resolve_tenant_ids(self, tenant_scope):
        valid_tenants = get_user_active_dimension_codes(self.request.user)
        if self.request.user.tenant_id and self.request.user.tenant_id not in valid_tenants:
            valid_tenants.append(self.request.user.tenant_id)
        if tenant_scope == "BOTH":
            return valid_tenants
        if tenant_scope in valid_tenants:
            return [tenant_scope]
        raise ValidationError({"tenant_scope": "Valid dimension scope is required."})

    def _parse_report_date_range(self):
        from_raw = self.request.query_params.get("from_date")
        to_raw = self.request.query_params.get("to_date")
        if not from_raw or not to_raw:
            raise ValidationError({"date": "From date and to date are required."})
        try:
            from_date = date.fromisoformat(from_raw)
            to_date = date.fromisoformat(to_raw)
        except ValueError:
            raise ValidationError({"date": "Dates must be in YYYY-MM-DD format."})
        if from_date > to_date:
            raise ValidationError({"date": "From date cannot be after to date."})
        return from_date, to_date

    def _parse_as_of_date(self, param_name="as_of_date"):
        as_of_date_raw = self.request.query_params.get(param_name)
        if as_of_date_raw:
            try:
                return date.fromisoformat(as_of_date_raw)
            except ValueError:
                raise ValidationError({param_name: "Date must be in YYYY-MM-DD format."})
        return date.today()

    def _financial_report_response(self, tenant_scope, payload):
        return Response({"data": {"tenant_scope": tenant_scope, **payload}})

    def _money(self, value):
        return Decimal(value or 0).quantize(Decimal("0.01"))

    def _monthly_line_totals(self, line_queryset):
        totals = {}
        for line in line_queryset.select_related("invoice"):
            invoice = line.invoice
            if not invoice.gross_amount:
                continue
            month = invoice.date.replace(day=1)
            totals[month] = totals.get(month, Decimal("0.00")) + self._money(
                (invoice.net_amount * line.total_amount) / invoice.gross_amount
            )
        return totals.items()

    def _line_invoice_share(self, invoice, line_amount):
        if not invoice.gross_amount:
            return Decimal("0.00")
        return self._money((self._money(invoice.net_amount) * line_amount) / invoice.gross_amount)

    def _sales_line_total_by_invoice(self, line_queryset):
        totals = {}
        for line in line_queryset.select_related("invoice"):
            totals[line.invoice_id] = totals.get(line.invoice_id, Decimal("0.00")) + self._money(
                line.total_amount
            )
        return totals

    def _purchase_line_total_by_invoice(self, line_queryset):
        totals = {}
        for line in line_queryset.select_related("invoice"):
            totals[line.invoice_id] = totals.get(line.invoice_id, Decimal("0.00")) + self._money(
                line.total_amount
            )
        return totals

    def _allocated_invoice_amount(self, invoice, amount, scoped_line_total):
        if not invoice.gross_amount:
            return Decimal("0.00")
        return self._money((self._money(amount) * scoped_line_total) / invoice.gross_amount)

    def _allocated_sales_receipt_total(self, receipt_queryset, scoped_sales_totals):
        total = Decimal("0.00")
        receipts = receipt_queryset.prefetch_related(
            Prefetch(
                "lines",
                queryset=SalesBankReceiptLine.objects.filter(
                    deleted_at__isnull=True
                ).select_related("sales_invoice"),
            )
        )
        for receipt in receipts:
            for line in receipt.lines.all():
                if not line.sales_invoice_id:
                    total += self._money(line.amount)
                    continue
                scoped_total = scoped_sales_totals.get(
                    line.sales_invoice_id, Decimal("0.00")
                )
                total += self._allocated_invoice_amount(
                    line.sales_invoice,
                    line.amount,
                    scoped_total,
                )
        return self._money(total)

    def _allocated_purchase_payment_total(self, payment_queryset, scoped_purchase_totals):
        total = Decimal("0.00")
        payments = payment_queryset.prefetch_related(
            Prefetch(
                "lines",
                queryset=PurchaseBankPaymentLine.objects.filter(
                    deleted_at__isnull=True
                ).select_related("purchase_invoice"),
            )
        )
        for payment in payments:
            for line in payment.lines.all():
                scoped_total = scoped_purchase_totals.get(
                    line.purchase_invoice_id, Decimal("0.00")
                )
                total += self._allocated_invoice_amount(
                    line.purchase_invoice,
                    line.amount,
                    scoped_total,
                )
        return self._money(total)

    def _monthly_allocated_receipt_totals(self, receipt_queryset, scoped_sales_totals):
        totals = {}
        receipts = receipt_queryset.prefetch_related(
            Prefetch(
                "lines",
                queryset=SalesBankReceiptLine.objects.filter(
                    deleted_at__isnull=True
                ).select_related("sales_invoice"),
            )
        )
        for receipt in receipts:
            month = receipt.date.replace(day=1)
            for line in receipt.lines.all():
                if not line.sales_invoice_id:
                    totals[month] = totals.get(month, Decimal("0.00")) + self._money(
                        line.amount
                    )
                    continue
                scoped_total = scoped_sales_totals.get(
                    line.sales_invoice_id, Decimal("0.00")
                )
                totals[month] = totals.get(month, Decimal("0.00")) + self._allocated_invoice_amount(
                    line.sales_invoice,
                    line.amount,
                    scoped_total,
                )
        return totals.items()

    def _monthly_allocated_payment_totals(self, payment_queryset, scoped_purchase_totals):
        totals = {}
        payments = payment_queryset.prefetch_related(
            Prefetch(
                "lines",
                queryset=PurchaseBankPaymentLine.objects.filter(
                    deleted_at__isnull=True
                ).select_related("purchase_invoice"),
            )
        )
        for payment in payments:
            month = payment.date.replace(day=1)
            for line in payment.lines.all():
                scoped_total = scoped_purchase_totals.get(
                    line.purchase_invoice_id, Decimal("0.00")
                )
                totals[month] = totals.get(month, Decimal("0.00")) + self._allocated_invoice_amount(
                    line.purchase_invoice,
                    line.amount,
                    scoped_total,
                )
        return totals.items()

    def _allocated_sales_outstanding(self, invoice_queryset, scoped_sales_totals):
        total = Decimal("0.00")
        for invoice in invoice_queryset:
            scoped_total = scoped_sales_totals.get(invoice.id, Decimal("0.00"))
            if scoped_total <= 0:
                continue
            financials = get_sales_invoice_financials(invoice)
            net_amount = self._allocated_invoice_amount(invoice, invoice.net_amount, scoped_total)
            returned = self._allocated_invoice_amount(invoice, financials["returned_amount"], scoped_total)
            received = self._allocated_invoice_amount(invoice, financials["received_amount"], scoped_total)
            total += max(self._money(net_amount - returned - received), Decimal("0.00"))
        return self._money(total)

    def _allocated_purchase_outstanding(self, invoice_queryset, scoped_purchase_totals):
        total = Decimal("0.00")
        for invoice in invoice_queryset:
            scoped_total = scoped_purchase_totals.get(invoice.id, Decimal("0.00"))
            if scoped_total <= 0:
                continue
            financials = get_purchase_invoice_financials(invoice)
            net_amount = self._allocated_invoice_amount(invoice, invoice.net_amount, scoped_total)
            returned = self._allocated_invoice_amount(invoice, financials["returned_amount"], scoped_total)
            paid = self._allocated_invoice_amount(invoice, financials["paid_amount"], scoped_total)
            total += max(self._money(net_amount - returned - paid), Decimal("0.00"))
        return self._money(total)

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
        tenant_ids = self._get_shared_tenant_ids() or [bank_root.tenant_id]
        existing_codes = (
            Account.objects.filter(
                tenant_id__in=tenant_ids,
                parent__code=bank_root.code,
                parent__level=bank_root.level,
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

    def _get_next_opening_account_code(self, bank_account, tenant_id):
        bank_code = bank_account.code
        code_length = len(bank_code) + 1

        used_suffixes = set()
        for code in Account.objects.filter(
            tenant_id=tenant_id,
            code__startswith=bank_code,
            deleted_at__isnull=True,
        ).values_list("code", flat=True):
            suffix_part = code[len(bank_code) :]
            if len(code) == code_length and suffix_part.isdigit() and len(suffix_part) == 1:
                used_suffixes.add(int(suffix_part))

        next_suffix = (max(used_suffixes) if used_suffixes else 0) + 1
        while next_suffix <= 9:
            candidate = f"{bank_code}{next_suffix}"
            if not Account.objects.filter(
                tenant_id=tenant_id,
                code=candidate,
                deleted_at__isnull=True,
            ).exists():
                return candidate
            next_suffix += 1

        raise ValidationError(
            {
                "detail": (
                    f"Only 9 opening accounts can be created under bank {bank_code} "
                    "in this dimension with the current code format."
                )
            }
        )

    def _serialize_opening_banks(self, account_tenant_id):
        tenant_ids = self._get_shared_tenant_ids() or [account_tenant_id]
        bank_root = self._get_opening_bank_root(account_tenant_id)
        context = self.get_serializer_context()

        all_banks = (
            Account.objects.filter(
                tenant_id__in=tenant_ids,
                parent__code=bank_root.code,
                parent__level=bank_root.level,
                deleted_at__isnull=True,
            )
            .order_by("code", "tenant_id", "created_at")
        )

        banks_by_code = {}
        dimension_banks = {}
        for bank in all_banks:
            banks_by_code.setdefault(bank.code, bank)
            if bank.tenant_id == account_tenant_id:
                dimension_banks[bank.code] = bank

        parent_ids = [bank.id for bank in dimension_banks.values()]
        children_by_parent_id = defaultdict(list)
        if parent_ids:
            for child in Account.objects.filter(
                tenant_id=account_tenant_id,
                parent_id__in=parent_ids,
                deleted_at__isnull=True,
            ).order_by("code", "created_at"):
                children_by_parent_id[str(child.parent_id)].append(child)

        banks_payload = []
        for code in sorted(banks_by_code.keys()):
            display_bank = dimension_banks.get(code) or banks_by_code[code]
            bank_data = AccountSerializer(display_bank, context=context).data
            bank_data["children"] = AccountSerializer(
                children_by_parent_id.get(str(display_bank.id), []),
                many=True,
                context=context,
            ).data
            banks_payload.append(bank_data)

        return {
            "root": {
                "id": str(bank_root.id),
                "code": bank_root.code,
                "name": bank_root.name,
            },
            "banks": banks_payload,
            "account_dimension": account_tenant_id,
        }

    @action(detail=False, methods=["get"], url_path="opening-accounts")
    def opening_accounts(self, request):
        return Response({"data": self._serialize_opening_banks(request.tenant_id)})

    def _resolve_opening_bank_code(self, bank_root, tenant_id, requested_code=""):
        requested_code = (requested_code or "").strip()
        if requested_code:
            if len(requested_code) != 4 or not requested_code.startswith("111"):
                raise ValidationError({"code": "Bank code must be a 4-digit code under 1110."})
            if Account.objects.filter(
                tenant_id=tenant_id,
                code=requested_code,
                deleted_at__isnull=True,
            ).exists():
                raise ValidationError(
                    {"code": f"Code {requested_code} already exists in this dimension."}
                )
            return requested_code
        return self._get_next_opening_bank_code(bank_root)

    def _resolve_opening_account_code(self, bank_account, requested_code=""):
        requested_code = (requested_code or "").strip()
        if requested_code:
            if len(requested_code) != 5 or not requested_code.startswith(bank_account.code):
                raise ValidationError(
                    {"code": "Account code must be a 5-digit code under the selected bank."}
                )
            if Account.objects.filter(
                tenant_id=bank_account.tenant_id,
                code=requested_code,
                deleted_at__isnull=True,
            ).exists():
                raise ValidationError(
                    {"code": f"Code {requested_code} already exists in this dimension."}
                )
            return requested_code
        return self._get_next_opening_account_code(
            bank_account,
            bank_account.tenant_id,
        )

    def _opening_bank_headers(self, bank_code):
        tenant_ids = self._get_shared_tenant_ids()
        return Account.objects.filter(
            tenant_id__in=tenant_ids,
            code=bank_code,
            parent__code=self.OPENING_BANK_ROOT_CODE,
            deleted_at__isnull=True,
        )

    @action(detail=False, methods=["post"], url_path="opening-banks")
    def create_opening_bank(self, request):
        tenant_ids = self._get_shared_tenant_ids() or [request.tenant_id]
        bank_name = (request.data.get("name") or "").strip()

        if not bank_name:
            raise ValidationError({"name": "Bank name is required."})

        reference_tenant = tenant_ids[0]
        bank_root = self._get_opening_bank_root(reference_tenant)
        code = self._resolve_opening_bank_code(
            bank_root,
            reference_tenant,
            request.data.get("code"),
        )

        is_active = bool(request.data.get("is_active", True))
        sort_order = int(request.data.get("sort_order", 0) or 0)
        primary_account = None

        for dim_tenant in tenant_ids:
            dim_root = self._get_opening_bank_root(dim_tenant)
            existing_bank = Account.objects.filter(
                tenant_id=dim_tenant,
                code=code,
                parent__code=self.OPENING_BANK_ROOT_CODE,
                deleted_at__isnull=True,
            ).first()
            if existing_bank:
                continue

            orphan_bank = Account.objects.filter(
                tenant_id=dim_tenant,
                code=code,
                parent__isnull=True,
                deleted_at__isnull=True,
            ).first()
            if orphan_bank:
                orphan_bank.parent = dim_root
                orphan_bank.name = bank_name
                orphan_bank.account_group = Account.AccountGroup.ASSET
                orphan_bank.account_type = Account.AccountType.BANK
                orphan_bank.account_nature = Account.AccountNature.DEBIT
                orphan_bank.is_postable = False
                orphan_bank.is_active = is_active
                orphan_bank.sort_order = sort_order
                orphan_bank.save()
                if primary_account is None:
                    primary_account = orphan_bank
                continue

            account = Account.objects.create(
                tenant_id=dim_tenant,
                code=code,
                name=bank_name,
                parent=dim_root,
                account_group=Account.AccountGroup.ASSET,
                account_type=Account.AccountType.BANK,
                account_nature=Account.AccountNature.DEBIT,
                is_postable=False,
                is_active=is_active,
                sort_order=sort_order,
            )
            if primary_account is None:
                primary_account = account

        if primary_account is None:
            raise ValidationError(
                {"code": f"Bank {code} already exists in all dimensions."}
            )

        return Response(
            {
                "data": AccountSerializer(
                    primary_account, context=self.get_serializer_context()
                ).data,
                "message": "Opening bank created across all dimensions.",
            },
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=False,
        methods=["put"],
        url_path=r"opening-banks/(?P<bank_code>[^/.]+)",
    )
    def update_opening_bank(self, request, bank_code=None):
        bank_name = (request.data.get("name") or "").strip()
        if not bank_name:
            raise ValidationError({"name": "Bank name is required."})

        banks = self._opening_bank_headers(bank_code)
        if not banks.exists():
            raise ValidationError({"code": "Opening bank was not found."})

        is_active = bool(request.data.get("is_active", True))
        sort_order = int(request.data.get("sort_order", 0) or 0)
        banks.update(
            name=bank_name,
            is_active=is_active,
            sort_order=sort_order,
            updated_at=now(),
        )

        display_bank = banks.order_by("tenant_id").first()
        return Response(
            {
                "data": AccountSerializer(
                    display_bank, context=self.get_serializer_context()
                ).data,
                "message": "Opening bank updated across all dimensions.",
            }
        )

    @action(
        detail=False,
        methods=["delete"],
        url_path=r"opening-banks/(?P<bank_code>[^/.]+)",
    )
    def delete_opening_bank(self, request, bank_code=None):
        banks = self._opening_bank_headers(bank_code)
        if not banks.exists():
            raise ValidationError({"code": "Opening bank was not found."})

        bank_ids = list(banks.values_list("id", flat=True))
        if Account.objects.filter(
            parent_id__in=bank_ids,
            deleted_at__isnull=True,
        ).exists():
            raise ValidationError(
                {"detail": "Cannot delete a bank that still has opening accounts."}
            )

        for bank in banks:
            try:
                bank.delete()
            except DjangoValidationError as exc:
                return Response(
                    {"detail": exc.messages[0]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        return Response(status=status.HTTP_204_NO_CONTENT)

    def _resolve_opening_bank_account(self, request, bank_id, bank_code):
        tenant_id = request.tenant_id
        bank_code = (bank_code or "").strip()

        if bank_code:
            bank_account = Account.objects.filter(
                tenant_id=tenant_id,
                code=bank_code,
                parent__code=self.OPENING_BANK_ROOT_CODE,
                deleted_at__isnull=True,
            ).first()
            if not bank_account:
                tenant_ids = self._get_shared_tenant_ids() or [tenant_id]
                source_bank = (
                    Account.objects.filter(
                        tenant_id__in=tenant_ids,
                        code=bank_code,
                        parent__code=self.OPENING_BANK_ROOT_CODE,
                        deleted_at__isnull=True,
                    )
                    .exclude(tenant_id=tenant_id)
                    .order_by("tenant_id")
                    .first()
                )
                if source_bank:
                    dim_root = self._get_opening_bank_root(tenant_id)
                    existing_same_code = Account.objects.filter(
                        tenant_id=tenant_id,
                        code=bank_code,
                        deleted_at__isnull=True,
                    ).first()
                    if existing_same_code:
                        if (
                            existing_same_code.parent_id == dim_root.id
                            and not existing_same_code.is_postable
                        ):
                            bank_account = existing_same_code
                        elif existing_same_code.parent_id is None:
                            existing_same_code.parent = dim_root
                            existing_same_code.name = source_bank.name
                            existing_same_code.account_group = source_bank.account_group
                            existing_same_code.account_type = source_bank.account_type
                            existing_same_code.account_nature = source_bank.account_nature
                            existing_same_code.is_postable = False
                            existing_same_code.is_active = source_bank.is_active
                            existing_same_code.sort_order = source_bank.sort_order
                            existing_same_code.save()
                            bank_account = existing_same_code
                        else:
                            raise ValidationError(
                                {
                                    "bank_code": (
                                        f"Code {bank_code} is already used by another "
                                        "account in this dimension."
                                    )
                                }
                            )
                    else:
                        bank_account = Account.objects.create(
                            tenant_id=tenant_id,
                            code=source_bank.code,
                            name=source_bank.name,
                            parent=dim_root,
                            account_group=source_bank.account_group,
                            account_type=source_bank.account_type,
                            account_nature=source_bank.account_nature,
                            is_postable=False,
                            is_active=source_bank.is_active,
                            sort_order=source_bank.sort_order,
                        )
                else:
                    raise ValidationError(
                        {
                            "bank_code": (
                                f"Bank {bank_code} was not found. "
                                "Create the bank first."
                            )
                        }
                    )
            return bank_account

        if bank_id:
            try:
                shared_bank = Account.objects.get(
                    id=bank_id,
                    parent__code=self.OPENING_BANK_ROOT_CODE,
                    deleted_at__isnull=True,
                )
            except Account.DoesNotExist:
                raise ValidationError({"bank_id": "Selected bank was not found under 1110."})
            return self._resolve_opening_bank_account(
                request,
                None,
                shared_bank.code,
            )

        raise ValidationError({"bank_code": "Bank selection is required."})

    @action(detail=False, methods=["post"], url_path="opening-account-items")
    def create_opening_account_item(self, request):
        account_name = (request.data.get("name") or "").strip()

        if not account_name:
            raise ValidationError({"name": "Opening account name is required."})

        bank_account = self._resolve_opening_bank_account(
            request,
            request.data.get("bank_id"),
            request.data.get("bank_code"),
        )

        code = self._resolve_opening_account_code(
            bank_account,
            request.data.get("code"),
        )

        account = Account.objects.create(
            tenant_id=bank_account.tenant_id,
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

        user_tenant_ids = self._get_shared_tenant_ids() or [tenant_id]

        try:
            head_account = Account.objects.get(
                id=head_account_id,
                tenant_id__in=user_tenant_ids,
                deleted_at__isnull=True,
            )
        except Account.DoesNotExist:
            raise ValidationError({"head_account_id": "Account head not found."})

        descendant_codes = self._get_descendant_account_codes(
            head_account, tenant_ids=user_tenant_ids
        )

        tenant_ids = self._resolve_tenant_ids(tenant_scope)

        if ledger_type == "account":
            try:
                account = Account.objects.get(
                    id=ledger_id,
                    tenant_id__in=user_tenant_ids,
                    deleted_at__isnull=True,
                )
            except Account.DoesNotExist:
                raise ValidationError({"ledger_id": "COA account not found."})
            if account.code not in descendant_codes:
                raise ValidationError({"ledger_id": "Selected COA does not belong to the chosen head."})
            ledger_key = {"code": account.code}
            title = f"{account.code} - {account.name}"
        elif ledger_type == "supplier":
            try:
                supplier = Supplier.objects.get(
                    id=ledger_id,
                    tenant_id__in=user_tenant_ids,
                    deleted_at__isnull=True,
                )
            except Supplier.DoesNotExist:
                raise ValidationError({"ledger_id": "Supplier not found."})
            if not supplier.account_id or supplier.account.code not in descendant_codes:
                raise ValidationError({"ledger_id": "Selected supplier does not belong to the chosen head."})
            ledger_key = {"business_name": supplier.business_name}
            title = supplier.business_name
        else:
            try:
                customer = Customer.objects.get(
                    id=ledger_id,
                    tenant_id__in=user_tenant_ids,
                    deleted_at__isnull=True,
                )
            except Customer.DoesNotExist:
                raise ValidationError({"ledger_id": "Customer not found."})
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

    @action(detail=False, methods=["get"], url_path="balance-sheet-report")
    def balance_sheet_report(self, request):
        tenant_scope = request.query_params.get("tenant_scope") or request.user.tenant_id
        as_of_date_raw = request.query_params.get("as_of_date")

        if as_of_date_raw:
            try:
                as_of_date = date.fromisoformat(as_of_date_raw)
            except ValueError:
                raise ValidationError({"as_of_date": "As of date must be in YYYY-MM-DD format."})
        else:
            as_of_date = date.today()

        tenant_ids = self._resolve_tenant_ids(tenant_scope)
        payload = build_balance_sheet_report(
            tenant_ids=tenant_ids,
            as_of_date=as_of_date,
        )

        return Response(
            {
                "data": {
                    "tenant_scope": tenant_scope,
                    **payload,
                }
            }
        )

    @action(detail=False, methods=["get"], url_path="profit-loss-report")
    def profit_loss_report(self, request):
        tenant_scope = request.query_params.get("tenant_scope") or request.user.tenant_id
        from_raw = request.query_params.get("from_date")
        to_raw = request.query_params.get("to_date")

        if not from_raw or not to_raw:
            raise ValidationError({"date": "From date and to date are required."})

        try:
            from_date = date.fromisoformat(from_raw)
            to_date = date.fromisoformat(to_raw)
        except ValueError:
            raise ValidationError({"date": "Dates must be in YYYY-MM-DD format."})

        if from_date > to_date:
            raise ValidationError({"date": "From date cannot be after to date."})

        tenant_ids = self._resolve_tenant_ids(tenant_scope)
        payload = build_profit_and_loss_report(
            tenant_ids=tenant_ids,
            from_date=from_date,
            to_date=to_date,
        )

        return Response(
            {
                "data": {
                    "tenant_scope": tenant_scope,
                    **payload,
                }
            }
        )

    @action(detail=False, methods=["get"], url_path="trial-balance-report")
    def trial_balance_report(self, request):
        tenant_scope = request.query_params.get("tenant_scope") or request.user.tenant_id
        as_of_date = self._parse_as_of_date()
        tenant_ids = self._resolve_tenant_ids(tenant_scope)
        payload = build_trial_balance_report(tenant_ids=tenant_ids, as_of_date=as_of_date)
        return self._financial_report_response(tenant_scope, payload)

    @action(detail=False, methods=["get"], url_path="general-ledger-report")
    def general_ledger_report(self, request):
        tenant_scope = request.query_params.get("tenant_scope") or request.user.tenant_id
        from_date, to_date = self._parse_report_date_range()
        tenant_ids = self._resolve_tenant_ids(tenant_scope)
        payload = build_general_ledger_report(
            tenant_ids=tenant_ids,
            from_date=from_date,
            to_date=to_date,
        )
        return self._financial_report_response(tenant_scope, payload)

    @action(detail=False, methods=["get"], url_path="day-book-report")
    def day_book_report(self, request):
        tenant_scope = request.query_params.get("tenant_scope") or request.user.tenant_id
        from_date, to_date = self._parse_report_date_range()
        tenant_ids = self._resolve_tenant_ids(tenant_scope)
        payload = build_day_book_report(
            tenant_ids=tenant_ids,
            from_date=from_date,
            to_date=to_date,
        )
        return self._financial_report_response(tenant_scope, payload)

    @action(detail=False, methods=["get"], url_path="cash-flow-summary-report")
    def cash_flow_summary_report(self, request):
        tenant_scope = request.query_params.get("tenant_scope") or request.user.tenant_id
        from_date, to_date = self._parse_report_date_range()
        tenant_ids = self._resolve_tenant_ids(tenant_scope)
        payload = build_cash_flow_summary_report(
            tenant_ids=tenant_ids,
            from_date=from_date,
            to_date=to_date,
        )
        return self._financial_report_response(tenant_scope, payload)

    @action(detail=False, methods=["get"], url_path="account-statement-report")
    def account_statement_report(self, request):
        tenant_scope = request.query_params.get("tenant_scope") or request.user.tenant_id
        account_id = request.query_params.get("account_id")
        if not account_id:
            raise ValidationError({"account_id": "Account is required."})
        from_date, to_date = self._parse_report_date_range()
        tenant_ids = self._resolve_tenant_ids(tenant_scope)
        try:
            payload = build_account_statement_report(
                tenant_ids=tenant_ids,
                account_id=account_id,
                from_date=from_date,
                to_date=to_date,
            )
        except Account.DoesNotExist:
            raise ValidationError({"account_id": "Account not found."})
        return self._financial_report_response(tenant_scope, payload)

    @action(detail=False, methods=["get"], url_path="comparative-profit-loss-report")
    def comparative_profit_loss_report(self, request):
        tenant_scope = request.query_params.get("tenant_scope") or request.user.tenant_id
        from_date, to_date = self._parse_report_date_range()
        tenant_ids = self._resolve_tenant_ids(tenant_scope)
        payload = build_comparative_profit_and_loss_report(
            tenant_ids=tenant_ids,
            from_date=from_date,
            to_date=to_date,
        )
        return self._financial_report_response(tenant_scope, payload)

    @action(detail=False, methods=["get"], url_path="expense-analysis-report")
    def expense_analysis_report(self, request):
        tenant_scope = request.query_params.get("tenant_scope") or request.user.tenant_id
        from_date, to_date = self._parse_report_date_range()
        tenant_ids = self._resolve_tenant_ids(tenant_scope)
        payload = build_expense_analysis_report(
            tenant_ids=tenant_ids,
            from_date=from_date,
            to_date=to_date,
        )
        return self._financial_report_response(tenant_scope, payload)

    @action(detail=False, methods=["get"], url_path="receivable-aging-report")
    def receivable_aging_report(self, request):
        tenant_scope = request.query_params.get("tenant_scope") or request.user.tenant_id
        as_of_date_raw = request.query_params.get("as_of_date")
        salesman_id = request.query_params.get("salesman_id") or None

        if as_of_date_raw:
            try:
                as_of_date = date.fromisoformat(as_of_date_raw)
            except ValueError:
                raise ValidationError({"as_of_date": "As of date must be in YYYY-MM-DD format."})
        else:
            as_of_date = date.today()

        if salesman_id and not user_can_access_salesman(request.user, salesman_id):
            raise ValidationError({"salesman_id": "You do not have access to this salesman."})

        tenant_ids = self._resolve_tenant_ids(tenant_scope)
        payload = build_receivable_aging_report(
            tenant_ids=tenant_ids,
            as_of_date=as_of_date,
            salesman_id=salesman_id,
            salesman_ids=get_user_allowed_salesman_ids(request.user),
        )

        return Response(
            {
                "data": {
                    "tenant_scope": tenant_scope,
                    "salesman_id": salesman_id or "",
                    **payload,
                }
            }
        )

    @action(detail=False, methods=["get"], url_path="payable-aging-report")
    def payable_aging_report(self, request):
        tenant_scope = request.query_params.get("tenant_scope") or request.user.tenant_id
        as_of_date_raw = request.query_params.get("as_of_date")

        if as_of_date_raw:
            try:
                as_of_date = date.fromisoformat(as_of_date_raw)
            except ValueError:
                raise ValidationError({"as_of_date": "As of date must be in YYYY-MM-DD format."})
        else:
            as_of_date = date.today()

        tenant_ids = self._resolve_tenant_ids(tenant_scope)
        payload = build_payable_aging_report(
            tenant_ids=tenant_ids,
            as_of_date=as_of_date,
        )

        return Response(
            {
                "data": {
                    "tenant_scope": tenant_scope,
                    **payload,
                }
            }
        )

    @action(detail=False, methods=["get"], url_path="salesman-performance-report")
    def salesman_performance_report(self, request):
        tenant_scope = request.query_params.get("tenant_scope") or request.user.tenant_id
        from_raw = request.query_params.get("from_date")
        to_raw = request.query_params.get("to_date")
        salesman_id = request.query_params.get("salesman_id") or None

        if not from_raw or not to_raw:
            raise ValidationError({"date": "From date and to date are required."})

        try:
            from_date = date.fromisoformat(from_raw)
            to_date = date.fromisoformat(to_raw)
        except ValueError:
            raise ValidationError({"date": "Dates must be in YYYY-MM-DD format."})

        if from_date > to_date:
            raise ValidationError({"date": "From date cannot be after to date."})

        allowed_salesman_ids = get_user_allowed_salesman_ids(request.user)
        if salesman_id and not user_can_access_salesman(request.user, salesman_id):
            raise ValidationError({"salesman_id": "You do not have access to this salesman."})

        tenant_ids = self._resolve_tenant_ids(tenant_scope)
        payload = build_salesman_performance_report(
            tenant_ids=tenant_ids,
            from_date=from_date,
            to_date=to_date,
            salesman_id=salesman_id,
            salesman_ids=allowed_salesman_ids,
        )

        return Response(
            {
                "data": {
                    "tenant_scope": tenant_scope,
                    **payload,
                }
            }
        )

    @action(detail=False, methods=["get"], url_path="sales-report")
    def sales_report(self, request):
        tenant_scope = request.query_params.get("tenant_scope") or request.user.tenant_id
        from_raw = request.query_params.get("from_date")
        to_raw = request.query_params.get("to_date")
        customer_id = request.query_params.get("customer_id") or None
        product_id = request.query_params.get("product_id") or None
        salesman_id = request.query_params.get("salesman_id") or None
        warehouse_id = request.query_params.get("warehouse_id") or None

        if not from_raw or not to_raw:
            raise ValidationError({"date": "From date and to date are required."})

        try:
            from_date = date.fromisoformat(from_raw)
            to_date = date.fromisoformat(to_raw)
        except ValueError:
            raise ValidationError({"date": "Dates must be in YYYY-MM-DD format."})

        if from_date > to_date:
            raise ValidationError({"date": "From date cannot be after to date."})

        tenant_ids = self._resolve_tenant_ids(tenant_scope)
        if customer_id and not Customer.objects.filter(
            id=customer_id,
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
        ).exists():
            raise ValidationError({"customer_id": "Customer not found."})
        if product_id and not Product.objects.filter(
            id=product_id,
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
        ).exists():
            raise ValidationError({"product_id": "Product not found."})
        if warehouse_id and not Warehouse.objects.filter(
            id=warehouse_id,
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
        ).exists():
            raise ValidationError({"warehouse_id": "Warehouse not found."})
        if salesman_id:
            if not Salesman.objects.filter(
                id=salesman_id,
                tenant_id__in=tenant_ids,
                deleted_at__isnull=True,
            ).exists():
                raise ValidationError({"salesman_id": "Salesman not found."})
            if not user_can_access_salesman(request.user, salesman_id):
                raise ValidationError({"salesman_id": "You do not have access to this salesman."})

        payload = build_sales_report(
            tenant_ids=tenant_ids,
            from_date=from_date,
            to_date=to_date,
            customer_id=customer_id,
            product_id=product_id,
            salesman_id=salesman_id,
            salesman_ids=get_user_allowed_salesman_ids(request.user),
            warehouse_id=warehouse_id,
        )

        return Response(
            {
                "data": {
                    "tenant_scope": tenant_scope,
                    **payload,
                }
            }
        )

    @action(detail=False, methods=["get"], url_path="inventory-stock-report")
    def inventory_stock_report(self, request):
        tenant_scope = request.query_params.get("tenant_scope") or request.user.tenant_id
        item_category = request.query_params.get("item_category") or "both"
        report_mode = request.query_params.get("report_mode") or "quantity"
        warehouse_id = request.query_params.get("warehouse_id") or None

        if item_category not in {"raw_materials", "finished_goods", "both"}:
            raise ValidationError(
                {
                    "item_category": "Valid values are raw_materials, finished_goods, both."
                }
            )
        if report_mode not in {"quantity", "valuation"}:
            raise ValidationError(
                {"report_mode": "Valid values are quantity, valuation."}
            )

        tenant_ids = self._resolve_tenant_ids(tenant_scope)
        payload = build_inventory_stock_report(
            tenant_ids=tenant_ids,
            item_category=item_category,
            report_mode=report_mode,
            warehouse_id=warehouse_id,
        )

        return Response(
            {
                "data": {
                    "tenant_scope": tenant_scope,
                    **payload,
                }
            }
        )

    @action(detail=False, methods=["get"], url_path="dashboard-overview")
    def dashboard_overview(self, request):
        # Respect the active tenant from request headers so dashboard values
        # match the currently selected dimension in the UI.
        tenant_id = getattr(request, "tenant_id", None) or request.user.tenant_id
        today = date.today()
        month_start = today.replace(day=1)
        period = (request.query_params.get("period") or "all").lower()

        if period not in {"today", "week", "month", "all"}:
            raise ValidationError({"period": "Valid values are today, week, month, all."})

        start_date = None
        if period == "today":
            start_date = today
        elif period == "week":
            start_date = today - timedelta(days=today.weekday())
        elif period == "month":
            start_date = month_start

        def with_date_range(queryset, field_name):
            if field_name == "created_at":
                if start_date:
                    queryset = queryset.filter(created_at__date__gte=start_date)
                return queryset.filter(created_at__date__lte=today)
            if start_date:
                queryset = queryset.filter(**{f"{field_name}__gte": start_date})
            return queryset.filter(**{f"{field_name}__lte": today})

        sales_queryset = (
            SalesInvoice.objects.filter(deleted_at__isnull=True)
            .filter(Q(tenant_id=tenant_id) | Q(lines__tenant_id=tenant_id))
            .distinct()
        )
        purchase_queryset = (
            PurchaseInvoice.objects.filter(deleted_at__isnull=True)
            .filter(Q(tenant_id=tenant_id) | Q(lines__tenant_id=tenant_id))
            .distinct()
        )
        receipt_queryset = (
            SalesBankReceipt.objects.filter(deleted_at__isnull=True)
            .filter(
                Q(tenant_id=tenant_id)
                | Q(lines__tenant_id=tenant_id)
                | Q(lines__sales_invoice__lines__tenant_id=tenant_id)
            )
            .distinct()
        )
        has_salesman_scope = bool(get_user_allowed_salesman_ids(request.user))
        sales_queryset = filter_queryset_by_allowed_salesmen(sales_queryset, request.user)
        receipt_queryset = filter_queryset_by_allowed_salesmen(
            receipt_queryset,
            request.user,
            field_name="lines__sales_invoice__salesman_id",
        )
        payment_queryset = (
            PurchaseBankPayment.objects.filter(deleted_at__isnull=True)
            .filter(
                Q(tenant_id=tenant_id)
                | Q(lines__purchase_invoice__lines__tenant_id=tenant_id)
            )
            .distinct()
        )
        journal_queryset = JournalLine.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
            journal_entry__deleted_at__isnull=True,
        )
        product_queryset = Product.objects.filter(tenant_id=tenant_id, deleted_at__isnull=True)
        raw_material_queryset = RawMaterial.objects.filter(tenant_id=tenant_id, deleted_at__isnull=True)
        customer_queryset = Customer.objects.filter(tenant_id=tenant_id, deleted_at__isnull=True)
        supplier_queryset = Supplier.objects.filter(tenant_id=tenant_id, deleted_at__isnull=True)
        warehouse_queryset = Warehouse.objects.filter(tenant_id=tenant_id, deleted_at__isnull=True)
        opening_stock_queryset = OpeningStock.objects.filter(tenant_id=tenant_id, deleted_at__isnull=True)
        stock_queryset = Stock.objects.filter(
            tenant_id=tenant_id, deleted_at__isnull=True, raw_material__deleted_at__isnull=True
        ).select_related("raw_material")
        product_stock_queryset = ProductStock.objects.filter(
            tenant_id=tenant_id, deleted_at__isnull=True, product__deleted_at__isnull=True
        ).select_related("product")
        entry_queryset = JournalEntry.objects.filter(tenant_id=tenant_id, deleted_at__isnull=True)

        sales_filtered = with_date_range(sales_queryset, "date")
        purchases_filtered = with_date_range(purchase_queryset, "date")
        receipts_filtered = with_date_range(receipt_queryset, "date")
        payments_filtered = with_date_range(payment_queryset, "date")
        journal_filtered = with_date_range(journal_queryset, "journal_entry__date")
        products_filtered = with_date_range(product_queryset, "created_at")
        raw_materials_filtered = with_date_range(raw_material_queryset, "created_at")
        customers_filtered = with_date_range(customer_queryset, "created_at")
        suppliers_filtered = with_date_range(supplier_queryset, "created_at")
        warehouses_filtered = with_date_range(warehouse_queryset, "created_at")
        opening_stock_filtered = with_date_range(opening_stock_queryset, "created_at")
        stock_filtered = with_date_range(stock_queryset, "created_at")
        product_stock_filtered = with_date_range(product_stock_queryset, "created_at")
        entries_filtered = with_date_range(entry_queryset, "date")

        sales_line_filtered = SalesInvoiceLine.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
            invoice__deleted_at__isnull=True,
        )
        purchase_line_filtered = PurchaseInvoiceLine.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
            invoice__deleted_at__isnull=True,
        )
        sales_line_filtered = with_date_range(sales_line_filtered, "invoice__date")
        purchase_line_filtered = with_date_range(purchase_line_filtered, "invoice__date")
        scoped_sales_totals = self._sales_line_total_by_invoice(sales_line_filtered)
        scoped_purchase_totals = self._purchase_line_total_by_invoice(purchase_line_filtered)

        total_sales = Decimal("0.00")
        for line in sales_line_filtered.select_related("invoice"):
            total_sales += self._line_invoice_share(line.invoice, self._money(line.total_amount))
        total_purchases = Decimal("0.00")
        for line in purchase_line_filtered.select_related("invoice"):
            total_purchases += self._line_invoice_share(line.invoice, self._money(line.total_amount))

        products_count = products_filtered.count()
        raw_materials_count = raw_materials_filtered.count()
        customers_count = customers_filtered.count()
        suppliers_count = suppliers_filtered.count()
        warehouses_count = warehouses_filtered.count()
        opening_stock_count = opening_stock_filtered.count()

        month_sales = total_sales
        month_purchases = total_purchases
        month_receipts = self._allocated_sales_receipt_total(
            receipts_filtered,
            scoped_sales_totals,
        )
        month_payments = self._allocated_purchase_payment_total(
            payments_filtered,
            scoped_purchase_totals,
        )
        if has_salesman_scope:
            month_profit = (
                sales_filtered.aggregate(
                    total=Coalesce(
                        Sum("lines__profit", filter=Q(lines__deleted_at__isnull=True)),
                        Decimal("0.00"),
                    )
                )["total"]
                or Decimal("0.00")
            )
            total_profit = month_profit
        else:
            month_profit = (
                journal_filtered.filter(
                    account__account_type=Account.AccountType.REVENUE,
                ).aggregate(total=Coalesce(Sum("credit"), Decimal("0.00")))["total"]
                or Decimal("0.00")
            ) - (
                journal_filtered.filter(
                    account__account_type=Account.AccountType.COGS,
                ).aggregate(total=Coalesce(Sum("debit"), Decimal("0.00")))["total"]
                or Decimal("0.00")
            )
            total_profit = (
                journal_filtered.filter(
                    account__account_type=Account.AccountType.REVENUE,
                ).aggregate(total=Coalesce(Sum("credit"), Decimal("0.00")))["total"]
                or Decimal("0.00")
            ) - (
                journal_filtered.filter(
                    account__account_type=Account.AccountType.COGS,
                ).aggregate(total=Coalesce(Sum("debit"), Decimal("0.00")))["total"]
                or Decimal("0.00")
            )

        receivables_outstanding = self._allocated_sales_outstanding(
            sales_filtered,
            scoped_sales_totals,
        )

        payables_outstanding = self._allocated_purchase_outstanding(
            purchases_filtered,
            scoped_purchase_totals,
        )

        raw_material_stock_value = Decimal("0.00")
        for stock in stock_filtered:
            raw_material_stock_value += self._money(stock.quantity) * self._money(
                stock.raw_material.purchase_price
            )

        product_stock_value = Decimal("0.00")
        for stock in product_stock_filtered:
            product_stock_value += self._money(stock.quantity) * self._money(
                stock.product.net_amount
            )

        monthly_purchase_map = {
            month: self._money(total)
            for month, total in self._monthly_line_totals(purchase_line_filtered)
        }
        monthly_sales_map = {
            month: self._money(total)
            for month, total in self._monthly_line_totals(sales_line_filtered)
        }
        monthly_receipt_map = {
            month: self._money(total)
            for month, total in self._monthly_allocated_receipt_totals(
                receipts_filtered,
                scoped_sales_totals,
            )
        }
        monthly_payment_map = {
            month: self._money(total)
            for month, total in self._monthly_allocated_payment_totals(
                payments_filtered,
                scoped_purchase_totals,
            )
        }
        if has_salesman_scope:
            monthly_profit_map = {
                item["month"]: self._money(item["total"])
                for item in sales_filtered
                .annotate(month=TruncMonth("date"))
                .values("month")
                .annotate(
                    total=Coalesce(
                        Sum("lines__profit", filter=Q(lines__deleted_at__isnull=True)),
                        Decimal("0.00"),
                    )
                )
            }
        else:
            monthly_revenue_map = {
                item["month"]: self._money(item["total"])
                for item in journal_filtered.filter(
                    account__account_type=Account.AccountType.REVENUE,
                )
                .annotate(month=TruncMonth("journal_entry__date"))
                .values("month")
                .annotate(total=Coalesce(Sum("credit"), Decimal("0.00")))
            }
            monthly_cogs_map = {
                item["month"]: self._money(item["total"])
                for item in journal_filtered.filter(
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
            if has_salesman_scope:
                profit_total = self._money(monthly_profit_map.get(month_cursor, Decimal("0.00")))
            else:
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

        journal_summary = journal_filtered.aggregate(
            debit=Coalesce(Sum("debit"), Decimal("0.00")),
            credit=Coalesce(Sum("credit"), Decimal("0.00")),
            count=Count("id"),
        )

        recent_activity = []
        recent_entries = entries_filtered.order_by("-date", "-created_at")[:8]
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

        top_customer_map = {}
        for invoice in sales_filtered.select_related("customer"):
            customer_total = self._allocated_invoice_amount(
                invoice,
                invoice.net_amount,
                scoped_sales_totals.get(invoice.id, Decimal("0.00")),
            )
            if customer_total > 0:
                customer_name = invoice.customer.business_name
                top_customer_map[customer_name] = top_customer_map.get(
                    customer_name,
                    Decimal("0.00"),
                ) + customer_total
        top_customers = [
            {"name": name, "amount": self._money(amount)}
            for name, amount in top_customer_map.items()
        ]
        top_customers = sorted(top_customers, key=lambda item: item["amount"], reverse=True)[:5]

        top_supplier_map = {}
        for invoice in purchases_filtered.select_related("supplier"):
            supplier_total = self._allocated_invoice_amount(
                invoice,
                invoice.net_amount,
                scoped_purchase_totals.get(invoice.id, Decimal("0.00")),
            )
            if supplier_total > 0:
                supplier_name = invoice.supplier.business_name
                top_supplier_map[supplier_name] = top_supplier_map.get(
                    supplier_name,
                    Decimal("0.00"),
                ) + supplier_total
        top_suppliers = [
            {"name": name, "amount": self._money(amount)}
            for name, amount in top_supplier_map.items()
        ]
        top_suppliers = sorted(top_suppliers, key=lambda item: item["amount"], reverse=True)[:5]

        stock_mix_total = self._money(raw_material_stock_value + product_stock_value)
        payload = {
            "tenant_id": tenant_id,
            "period": period,
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

    def _get_party_ledger_tenant_ids(self, request):
        """Party ledger spans every dimension the user owns (not the view filter)."""
        return get_shared_tenant_ids(request)

    @action(detail=False, methods=["get"], url_path="party-ledger-report")
    def party_ledger_report(self, request):
        company_tenant_ids = self._get_party_ledger_tenant_ids(request)
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
                    tenant_id__in=company_tenant_ids,
                    deleted_at__isnull=True,
                )
            except Customer.DoesNotExist:
                raise ValidationError({"partner_id": "Customer not found."})
        else:
            try:
                partner = Supplier.objects.get(
                    id=partner_id,
                    tenant_id__in=company_tenant_ids,
                    deleted_at__isnull=True,
                )
            except Supplier.DoesNotExist:
                raise ValidationError({"partner_id": "Supplier not found."})

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

        payload = build_party_ledger_report(
            tenant_ids=company_tenant_ids,
            partner_type=partner_type,
            partner_name=partner.business_name,
            from_date=from_date,
            to_date=to_date,
        )

        return Response(
            {
                "data": {
                    "partner_type": partner_type,
                    "partner_id": str(partner.id),
                    "partner_name": partner.business_name,
                    "from_date": from_date.isoformat() if from_date else "",
                    "to_date": to_date.isoformat() if to_date else "",
                    **payload,
                }
            }
        )


class ExpenseViewSet(AuditedModelMixin, ModelViewSet):
    audit_entity_type = "expense"
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    ordering_fields = [
        "expense_number",
        "date",
        "tenant_id",
        "_line_tenant_id",
        "_bank_name",
        "_expense_name",
        "_description",
        "amount",
        "remarks",
    ]
    ordering = ["-date", "-created_at"]
    search_fields = [
        "expense_number",
        "lines__bank_account__name",
        "lines__bank_account__code",
        "lines__expense_account__name",
        "lines__expense_account__code",
        "lines__description",
        "remarks",
    ]

    def get_queryset(self):
        tenant_ids = get_request_tenant_filter(self.request)["tenant_id__in"]
        return (
            Expense.objects.filter(deleted_at__isnull=True)
            .filter(Q(tenant_id__in=tenant_ids) | Q(lines__tenant_id__in=tenant_ids))
            .prefetch_related(
                "lines__bank_account",
                "lines__expense_account",
            )
            .annotate(
                _line_tenant_id=Min(
                    "lines__tenant_id",
                    filter=Q(lines__deleted_at__isnull=True),
                ),
                _bank_name=Min(
                    "lines__bank_account__name",
                    filter=Q(lines__deleted_at__isnull=True),
                ),
                _expense_name=Min(
                    "lines__expense_account__name",
                    filter=Q(lines__deleted_at__isnull=True),
                ),
                _description=Min(
                    "lines__description",
                    filter=Q(lines__deleted_at__isnull=True),
                ),
            )
            .distinct()
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
        stamp = now()
        instance.deleted_at = stamp
        instance.save(update_fields=["deleted_at", "updated_at"])
        instance.lines.filter(deleted_at__isnull=True).update(deleted_at=stamp)

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


class BankTransferViewSet(AuditedModelMixin, ModelViewSet):
    audit_entity_type = "bank_transfer"
    serializer_class = BankTransferSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter]
    search_fields = [
        "transfer_number",
        "from_bank_account__name",
        "from_bank_account__code",
        "to_bank_account__name",
        "to_bank_account__code",
        "remarks",
    ]

    def get_queryset(self):
        tenant_ids = get_shared_tenant_ids(self.request) or [self.request.user.tenant_id]
        return (
            BankTransfer.objects.filter(deleted_at__isnull=True)
            .filter(
                Q(from_bank_account__tenant_id__in=tenant_ids)
                | Q(to_bank_account__tenant_id__in=tenant_ids)
            )
            .select_related("from_bank_account__parent", "to_bank_account__parent")
            .distinct()
            .order_by("-date", "-created_at")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        tenant_ids = get_shared_tenant_ids(self.request) or [self.request.user.tenant_id]
        context["dimension_names"] = {
            row.code: row.name for row in Dimension.objects.filter(code__in=tenant_ids)
        }
        return context

    def _get_serializable_transfer(self, transfer_id):
        return self.get_queryset().get(id=transfer_id)

    @action(detail=False, methods=["get"], url_path="bank-accounts")
    def bank_accounts(self, request):
        tenant_ids = get_shared_tenant_ids(request) or [request.user.tenant_id]
        dimension_names = {
            row.code: row.name for row in Dimension.objects.filter(code__in=tenant_ids)
        }
        accounts = (
            Account.objects.filter(
                tenant_id__in=tenant_ids,
                deleted_at__isnull=True,
                is_active=True,
                is_postable=True,
                account_type=Account.AccountType.BANK,
            )
            .select_related("parent")
            .order_by("tenant_id", "code", "name")
        )

        payload = []
        for account in accounts:
            balance = get_account_balance(account)
            parent_name = account.parent.name if account.parent_id else ""
            dimension_name = dimension_names.get(account.tenant_id, account.tenant_id)
            payload.append(
                {
                    "id": str(account.id),
                    "code": account.code,
                    "name": account.name,
                    "tenant_id": account.tenant_id,
                    "dimension_name": dimension_name,
                    "bank_name": parent_name,
                    "label": (
                        f"{dimension_name} - {account.code} - {parent_name} - {account.name}"
                    ),
                    "balance": str(balance),
                }
            )

        return Response({"data": payload})

    def create(self, request, *args, **kwargs):
        with transaction.atomic():
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            transfer = serializer.save()
            sync_bank_transfer_journal(self._get_serializable_transfer(transfer.id))
        response_serializer = self.get_serializer(self._get_serializable_transfer(transfer.id))
        return Response(
            {
                "data": response_serializer.data,
                "message": "Bank transfer created successfully",
            },
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        with transaction.atomic():
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            transfer = serializer.save()
            sync_bank_transfer_journal(self._get_serializable_transfer(transfer.id))
        response_serializer = self.get_serializer(self._get_serializable_transfer(transfer.id))
        return Response(response_serializer.data)

    def perform_destroy(self, instance):
        instance.deleted_at = now()
        instance.save(update_fields=["deleted_at", "updated_at"])

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        with transaction.atomic():
            self.perform_destroy(instance)
            delete_bank_transfer_journals(instance)
        return Response(
            {"data": None, "message": "Bank transfer deleted successfully"},
            status=status.HTTP_200_OK,
        )


class DimensionViewSet(ModelViewSet):
    serializer_class = DimensionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        allowed_codes = list(self.request.user.allowed_dimensions.values_list("code", flat=True))
        if not allowed_codes and self.request.user.tenant_id:
            allowed_codes = [self.request.user.tenant_id]
        return Dimension.objects.filter(code__in=allowed_codes).order_by("name")

    def _has_dimension_dependencies(self, dimension_code, current_user=None):
        user_dependency_queryset = User.objects.filter(tenant_id=dimension_code)
        user_allowed_dependency_queryset = User.objects.filter(allowed_dimensions__code=dimension_code)
        if current_user:
            user_dependency_queryset = user_dependency_queryset.exclude(id=current_user.id)
            user_allowed_dependency_queryset = user_allowed_dependency_queryset.exclude(id=current_user.id)

        dependency_checks = [
            user_dependency_queryset,
            user_allowed_dependency_queryset,
            Category.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            RawMaterial.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            Product.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            Customer.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            Supplier.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            Salesman.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
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
            SalesBankReceiptLine.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            JournalEntry.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            JournalLine.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            Expense.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
            ExpenseLine.objects.filter(tenant_id=dimension_code, deleted_at__isnull=True),
        ]
        return any(queryset.exists() for queryset in dependency_checks)

    def create(self, request, *args, **kwargs):
        if not request.user.can_create_more_tenants():
            return Response(
                {"detail": "Your tenant creation limit has been reached."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        dimension = serializer.save()
        seed_default_coa_for_dimension(dimension.code)
        request.user.allowed_dimensions.add(dimension)
        if not request.user.tenant_id:
            request.user.tenant_id = dimension.code
            request.user.save(update_fields=["tenant_id"])
        return Response(
            {
                "data": self.get_serializer(dimension).data,
                "message": "Dimension created successfully",
            },
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        fallback_dimension = (
            request.user.allowed_dimensions.filter(is_active=True).exclude(code=instance.code).order_by("name").first()
        )

        if self._has_dimension_dependencies(instance.code, current_user=request.user):
            return Response(
                {"detail": "Cannot delete dimension because active users or business records exist."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if request.user.tenant_id == instance.code:
            if not fallback_dimension:
                return Response(
                    {"detail": "Cannot delete the last active dimension."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            request.user.tenant_id = fallback_dimension.code
            request.user.save(update_fields=["tenant_id"])

        with transaction.atomic():
            request.user.allowed_dimensions.remove(instance)
            for account in Account.objects.filter(tenant_id=instance.code).order_by("-level", "-code"):
                Account.objects.filter(pk=account.pk).delete()
            instance.delete()

        return Response(
            {"data": None, "message": "Dimension deleted successfully"},
            status=status.HTTP_200_OK,
        )
