from decimal import Decimal

from django.db import transaction
from django.db.models import DecimalField, Exists, ExpressionWrapper, F, OuterRef, Prefetch, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils.timezone import now
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.journal import (
    delete_journal_entry,
    sync_sales_bank_receipt_journal,
    sync_sales_invoice_journal,
    sync_sales_return_journal,
    sync_salesman_commission_payment_journal,
)
from accounts.access_control import filter_queryset_by_allowed_salesmen, user_can_access_salesman
from accounts.models import JournalEntry
from inventory.models import Product, ProductStock
from inventory.models import PartyOpeningBalance
from inventory.pagination import StandardResultsSetPagination
from inventory.services import (
    get_current_product_average_cost,
    rebuild_product_costing,
    sync_product_stock_quantity,
)
from sales.models import (
    SalesBankReceipt,
    SalesBankReceiptLine,
    SalesInvoice,
    SalesInvoiceLine,
    SalesOrder,
    SalesOrderLine,
    SalesReturn,
    SalesReturnLine,
    SalesmanCommissionPayment,
)
from sales.serializers import (
    SalesBankReceiptSerializer,
    SalesInvoiceSerializer,
    SalesOrderSerializer,
    SalesReturnInvoiceLinePreviewSerializer,
    SalesReturnSerializer,
    SalesmanCommissionPaymentSerializer,
)
from sales.services import (
    get_customer_opening_balance_financials,
    get_sales_invoice_financials,
    get_salesman_commission_financials,
    get_sales_return_line_metrics,
    quantize_money,
)
from accounts.models import Dimension
from common.tenancy import get_shared_tenant_filter, get_shared_tenant_ids


class SalesInvoiceViewSet(viewsets.ModelViewSet):
    serializer_class = SalesInvoiceSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    ordering_fields = [
        "invoice_number",
        "order_reference",
        "date",
        "customer__business_name",
        "warehouse__name",
        "gross_amount",
        "net_amount",
        "_cost_total",
        "_profit",
        "_balance_amount",
    ]
    ordering = ["-date", "-created_at"]
    search_fields = [
        "invoice_number",
        "dc_number",
        "due_date",
        "order_reference",
        "customer__business_name",
        "remarks",
        "warehouse__name",
    ]

    def get_queryset(self):
        returned_amount_subquery = (
            SalesReturn.objects.filter(
                tenant_id=OuterRef("tenant_id"),
                sales_invoice_id=OuterRef("pk"),
                deleted_at__isnull=True,
            )
            .values("sales_invoice_id")
            .annotate(total=Sum("gross_amount"))
            .values("total")[:1]
        )
        received_amount_subquery = (
            SalesBankReceipt.objects.filter(
                tenant_id=OuterRef("tenant_id"),
                sales_invoice_id=OuterRef("pk"),
                deleted_at__isnull=True,
            )
            .values("sales_invoice_id")
            .annotate(total=Sum("amount"))
            .values("total")[:1]
        )
        queryset = (
            SalesInvoice.objects.filter(
                **get_shared_tenant_filter(self.request),
                deleted_at__isnull=True,
            )
            .select_related("customer", "warehouse", "salesman", "sales_order")
            .prefetch_related(
                Prefetch(
                    "lines",
                    queryset=SalesInvoiceLine.objects.filter(
                        deleted_at__isnull=True,
                    ).select_related("product"),
                )
            )
            .annotate(
                _cost_total=Coalesce(
                    Sum(
                        "lines__cost_total",
                        filter=Q(lines__deleted_at__isnull=True),
                    ),
                    Value(0),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                ),
                _profit=Coalesce(
                    Sum(
                        "lines__profit",
                        filter=Q(lines__deleted_at__isnull=True),
                    ),
                    Value(0),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                ),
                _returned_amount=Coalesce(
                    Subquery(returned_amount_subquery),
                    Value(0),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
                _received_amount=Coalesce(
                    Subquery(received_amount_subquery),
                    Value(0),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
            )
            .annotate(
                _balance_amount=ExpressionWrapper(
                    F("net_amount") - F("_returned_amount") - F("_received_amount"),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                )
            )
        )
        return filter_queryset_by_allowed_salesmen(queryset, self.request.user)

    def _get_serializable_invoice(self, invoice_id):
        return self.get_queryset().get(id=invoice_id)

    def _sync_invoice_product_stock(self, invoice):
        line_pairs = list(
            invoice.lines.filter(deleted_at__isnull=True)
            .values_list("tenant_id", "product_id")
            .distinct()
        )
        product_ids_by_tenant = {}
        for line_tenant_id, product_id in line_pairs:
            product_ids_by_tenant.setdefault(line_tenant_id, set()).add(product_id)
            sync_product_stock_quantity(line_tenant_id, invoice.warehouse_id, product_id)
        for line_tenant_id, product_ids in product_ids_by_tenant.items():
            rebuild_product_costing(line_tenant_id, product_ids)

    def _sync_product_stock_pairs(self, tenant_id, warehouse_id, product_ids, line_pairs=None):
        if line_pairs is None:
            line_pairs = [(tenant_id, product_id) for product_id in product_ids]
        product_ids_by_tenant = {}
        for line_tenant_id, product_id in line_pairs:
            if product_id:
                product_ids_by_tenant.setdefault(line_tenant_id, set()).add(product_id)
        for line_tenant_id, product_ids in product_ids_by_tenant.items():
            for product_id in product_ids:
                sync_product_stock_quantity(line_tenant_id, warehouse_id, product_id)
            rebuild_product_costing(line_tenant_id, product_ids)

    def create(self, request, *args, **kwargs):
        with transaction.atomic():
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            invoice = serializer.save()
            self._sync_invoice_product_stock(invoice)
            sync_sales_invoice_journal(self._get_serializable_invoice(invoice.id))
        response_serializer = self.get_serializer(self._get_serializable_invoice(invoice.id))
        return Response(
            {
                "data": response_serializer.data,
                "message": "Sales invoice created successfully",
            },
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        old_warehouse_id = instance.warehouse_id
        old_line_pairs = list(
            instance.lines.filter(deleted_at__isnull=True).values_list("tenant_id", "product_id")
        )
        with transaction.atomic():
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            invoice = serializer.save()
            self._sync_invoice_product_stock(invoice)
            self._sync_product_stock_pairs(instance.tenant_id, old_warehouse_id, [], old_line_pairs)
            sync_sales_invoice_journal(self._get_serializable_invoice(invoice.id))
        response_serializer = self.get_serializer(self._get_serializable_invoice(invoice.id))
        return Response(response_serializer.data)

    def perform_destroy(self, instance):
        instance.deleted_at = now()
        instance.save(update_fields=["deleted_at", "updated_at"])
        instance.lines.filter(deleted_at__isnull=True).update(deleted_at=now())

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        tenant_id = instance.tenant_id
        warehouse_id = instance.warehouse_id
        old_line_pairs = list(
            instance.lines.filter(deleted_at__isnull=True).values_list("tenant_id", "product_id")
        )
        with transaction.atomic():
            self.perform_destroy(instance)
            self._sync_product_stock_pairs(tenant_id, warehouse_id, [], old_line_pairs)
            delete_journal_entry(
                JournalEntry.SourceType.SALES_INVOICE,
                instance.id,
                tenant_id,
            )
        return Response(
            {"data": None, "message": "Sales invoice deleted successfully"},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="product-options")
    def product_options(self, request):
        tenant_ids = get_shared_tenant_ids(request)
        warehouse_id = request.query_params.get("warehouse_id")
        search = request.query_params.get("search", "").strip()

        dimension_names = {
            row["code"]: row["name"]
            for row in Dimension.objects.filter(code__in=tenant_ids).values("code", "name")
        }

        queryset = Product.objects.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
        ).select_related("unit").order_by("tenant_id", "name")

        if search:
            queryset = queryset.filter(name__icontains=search)

        products = []
        for product in queryset[:500]:
            quantity = Decimal("0.00")
            if warehouse_id:
                stock = ProductStock.objects.filter(
                    tenant_id=product.tenant_id,
                    warehouse_id=warehouse_id,
                    product_id=product.id,
                    deleted_at__isnull=True,
                ).first()
                quantity = stock.quantity if stock else Decimal("0.00")
            dimension_name = dimension_names.get(product.tenant_id, product.tenant_id)
            products.append(
                {
                    "id": str(product.id),
                    "name": product.name,
                    "dimension_code": product.tenant_id,
                    "dimension_name": dimension_name,
                    "quantity": str(quantity),
                    "unit": product.unit.name if product.unit else None,
                    "product_type": product.product_type,
                    "net_amount": str(product.net_amount),
                    "average_cost": str(
                        get_current_product_average_cost(product.tenant_id, product.id)
                    ),
                }
            )

        return Response({"data": products})


class SalesOrderViewSet(viewsets.ModelViewSet):
    serializer_class = SalesOrderSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    ordering_fields = [
        "order_number",
        "date",
        "customer__business_name",
        "warehouse__name",
        "gross_amount",
        "net_amount",
        "_is_invoiced",
    ]
    ordering = ["-date", "-created_at"]
    search_fields = [
        "order_number",
        "dc_number",
        "due_date",
        "customer__business_name",
        "remarks",
        "warehouse__name",
    ]

    def get_queryset(self):
        invoiced_subquery = SalesInvoice.objects.filter(
            sales_order_id=OuterRef("pk"),
            deleted_at__isnull=True,
        )
        queryset = (
            SalesOrder.objects.filter(
                **get_shared_tenant_filter(self.request),
                deleted_at__isnull=True,
            )
            .select_related("customer", "warehouse", "salesman")
            .prefetch_related(
                Prefetch(
                    "lines",
                    queryset=SalesOrderLine.objects.filter(
                        deleted_at__isnull=True,
                    ).select_related("product"),
                )
            )
            .annotate(_is_invoiced=Exists(invoiced_subquery))
        )
        queryset = filter_queryset_by_allowed_salesmen(queryset, self.request.user)

        invoiced_param = self.request.query_params.get("invoiced", "").strip().lower()
        if invoiced_param == "false":
            queryset = queryset.filter(_is_invoiced=False)
        elif invoiced_param == "true":
            queryset = queryset.filter(_is_invoiced=True)

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        response_serializer = self.get_serializer(order)
        return Response(
            {
                "data": response_serializer.data,
                "message": "Sales order created successfully",
            },
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        if instance.invoices.filter(deleted_at__isnull=True).exists():
            return Response(
                {"message": "This sales order is already linked to an invoice and cannot be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        response_serializer = self.get_serializer(order)
        return Response(response_serializer.data)

    def perform_destroy(self, instance):
        if instance.invoices.filter(deleted_at__isnull=True).exists():
            raise ValidationError("This sales order is already linked to an invoice and cannot be deleted.")
        instance.deleted_at = now()
        instance.save(update_fields=["deleted_at", "updated_at"])
        instance.lines.filter(deleted_at__isnull=True).update(deleted_at=now())

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        with transaction.atomic():
            self.perform_destroy(instance)
        return Response(
            {"data": None, "message": "Sales order deleted successfully"},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="product-options")
    def product_options(self, request):
        tenant_ids = get_shared_tenant_ids(request)
        warehouse_id = request.query_params.get("warehouse_id")
        search = request.query_params.get("search", "").strip()

        dimension_names = {
            row["code"]: row["name"]
            for row in Dimension.objects.filter(code__in=tenant_ids).values("code", "name")
        }

        queryset = Product.objects.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
        ).select_related("unit").order_by("tenant_id", "name")

        if search:
            queryset = queryset.filter(name__icontains=search)

        products = []
        for product in queryset[:500]:
            quantity = Decimal("0.00")
            if warehouse_id:
                stock = ProductStock.objects.filter(
                    tenant_id=product.tenant_id,
                    warehouse_id=warehouse_id,
                    product_id=product.id,
                    deleted_at__isnull=True,
                ).first()
                quantity = stock.quantity if stock else Decimal("0.00")
            dimension_name = dimension_names.get(product.tenant_id, product.tenant_id)
            products.append(
                {
                    "id": str(product.id),
                    "name": product.name,
                    "dimension_code": product.tenant_id,
                    "dimension_name": dimension_name,
                    "quantity": str(quantity),
                    "unit": product.unit.name if product.unit else None,
                    "product_type": product.product_type,
                    "net_amount": str(product.net_amount),
                    "average_cost": str(
                        get_current_product_average_cost(product.tenant_id, product.id)
                    ),
                }
            )

        return Response({"data": products})


class SalesReturnViewSet(viewsets.ModelViewSet):
    serializer_class = SalesReturnSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter]
    search_fields = [
        "return_number",
        "sales_invoice__invoice_number",
        "customer__business_name",
        "remarks",
    ]

    def get_queryset(self):
        queryset = (
            SalesReturn.objects.filter(
                **get_shared_tenant_filter(self.request),
                deleted_at__isnull=True,
            )
            .select_related("customer", "sales_invoice", "sales_invoice__warehouse")
            .prefetch_related(
                Prefetch(
                    "lines",
                    queryset=SalesReturnLine.objects.filter(
                        deleted_at__isnull=True,
                    ).select_related("product", "sales_invoice_line"),
                )
            )
            .order_by("-date", "-created_at")
        )
        return filter_queryset_by_allowed_salesmen(
            queryset,
            self.request.user,
            field_name="sales_invoice__salesman_id",
        )

    def _get_serializable_return(self, sales_return_id):
        return self.get_queryset().get(id=sales_return_id)

    def _sync_sales_return_stock(self, sales_return):
        line_pairs = list(
            sales_return.lines.filter(deleted_at__isnull=True)
            .values_list("tenant_id", "product_id")
            .distinct()
        )
        product_ids_by_tenant = {}
        for line_tenant_id, product_id in line_pairs:
            product_ids_by_tenant.setdefault(line_tenant_id, set()).add(product_id)
            sync_product_stock_quantity(
                line_tenant_id,
                sales_return.sales_invoice.warehouse_id,
                product_id,
            )
        for line_tenant_id, product_ids in product_ids_by_tenant.items():
            rebuild_product_costing(line_tenant_id, product_ids)

    def _sync_product_stock_pairs(self, tenant_id, warehouse_id, product_ids, line_pairs=None):
        if line_pairs is None:
            line_pairs = [(tenant_id, product_id) for product_id in product_ids]
        product_ids_by_tenant = {}
        for line_tenant_id, product_id in line_pairs:
            if product_id:
                product_ids_by_tenant.setdefault(line_tenant_id, set()).add(product_id)
        for line_tenant_id, product_ids in product_ids_by_tenant.items():
            for product_id in product_ids:
                sync_product_stock_quantity(line_tenant_id, warehouse_id, product_id)
            rebuild_product_costing(line_tenant_id, product_ids)

    def create(self, request, *args, **kwargs):
        with transaction.atomic():
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            sales_return = serializer.save()
            self._sync_sales_return_stock(sales_return)
            sync_sales_return_journal(self._get_serializable_return(sales_return.id))
        response_serializer = self.get_serializer(
            self._get_serializable_return(sales_return.id)
        )
        return Response(
            {
                "data": response_serializer.data,
                "message": "Sales return created successfully",
            },
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        old_warehouse_id = instance.sales_invoice.warehouse_id
        old_line_pairs = list(
            instance.lines.filter(deleted_at__isnull=True).values_list("tenant_id", "product_id")
        )
        with transaction.atomic():
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            sales_return = serializer.save()
            self._sync_sales_return_stock(sales_return)
            self._sync_product_stock_pairs(instance.tenant_id, old_warehouse_id, [], old_line_pairs)
            sync_sales_return_journal(self._get_serializable_return(sales_return.id))
        response_serializer = self.get_serializer(
            self._get_serializable_return(sales_return.id)
        )
        return Response(response_serializer.data)

    def perform_destroy(self, instance):
        instance.deleted_at = now()
        instance.save(update_fields=["deleted_at", "updated_at"])
        instance.lines.filter(deleted_at__isnull=True).update(deleted_at=now())

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        tenant_id = instance.tenant_id
        warehouse_id = instance.sales_invoice.warehouse_id
        old_line_pairs = list(
            instance.lines.filter(deleted_at__isnull=True).values_list("tenant_id", "product_id")
        )
        with transaction.atomic():
            self.perform_destroy(instance)
            self._sync_product_stock_pairs(tenant_id, warehouse_id, [], old_line_pairs)
            delete_journal_entry(
                JournalEntry.SourceType.SALES_RETURN,
                instance.id,
                tenant_id,
            )
        return Response(
            {"data": None, "message": "Sales return deleted successfully"},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="invoice-options")
    def invoice_options(self, request):
        customer_id = request.query_params.get("customer_id")

        if not customer_id:
            return Response({"data": []})

        invoices = (
            SalesInvoice.objects.filter(
                **get_shared_tenant_filter(request),
                customer_id=customer_id,
                deleted_at__isnull=True,
            )
            .order_by("-date", "-created_at")
            .values("id", "invoice_number", "date")
        )
        invoices = filter_queryset_by_allowed_salesmen(invoices, request.user)
        return Response({"data": list(invoices)})

    @action(detail=False, methods=["get"], url_path="invoice-lines")
    def invoice_lines(self, request):
        sales_invoice_id = request.query_params.get("sales_invoice_id")
        sales_return_id = request.query_params.get("sales_return_id")

        if not sales_invoice_id:
            raise ValidationError({"sales_invoice_id": "Sales invoice is required."})

        try:
            tenant_ids = get_shared_tenant_filter(request)["tenant_id__in"]
            invoice = (
                SalesInvoice.objects.select_related("warehouse", "customer")
                .filter(id=sales_invoice_id, deleted_at__isnull=True)
                .filter(Q(tenant_id__in=tenant_ids) | Q(lines__tenant_id__in=tenant_ids))
                .distinct()
                .get()
            )
        except SalesInvoice.DoesNotExist:
            raise ValidationError({"sales_invoice_id": "Sales invoice not found."})

        excluded_return_line_ids = []
        existing_quantities = {}
        if sales_return_id:
            try:
                current_return = SalesReturn.objects.get(
                    id=sales_return_id,
                    tenant_id__in=get_shared_tenant_filter(request)["tenant_id__in"],
                    deleted_at__isnull=True,
                )
            except SalesReturn.DoesNotExist:
                raise ValidationError({"sales_return_id": "Sales return not found."})

            excluded_return_line_ids = list(
                current_return.lines.filter(deleted_at__isnull=True).values_list("id", flat=True)
            )
            existing_quantities = {
                str(line.sales_invoice_line_id): quantize_money(line.quantity)
                for line in current_return.lines.filter(deleted_at__isnull=True).select_related(
                    "sales_invoice_line"
                )
            }

        payload = []
        invoice_lines = invoice.lines.filter(
            tenant_id__in=get_shared_tenant_filter(request)["tenant_id__in"],
            deleted_at__isnull=True,
        ).select_related("product")
        for invoice_line in invoice_lines:
            metrics = get_sales_return_line_metrics(
                invoice_line,
                excluded_return_line_ids=excluded_return_line_ids,
            )
            current_return_qty = existing_quantities.get(str(invoice_line.id), Decimal("0.00"))
            max_return_quantity = quantize_money(
                metrics["available_return_quantity"] + current_return_qty
            )
            payload.append(
                {
                    "sales_invoice_line_id": invoice_line.id,
                    "product_id": invoice_line.product_id,
                    "product_name": invoice_line.product.name,
                    "sold_quantity": metrics["sold_quantity"],
                    "return_quantity": current_return_qty,
                    "unit": "Each",
                    "rate": quantize_money(invoice_line.rate),
                    "amount": quantize_money(invoice_line.rate * current_return_qty),
                    "max_return_quantity": max_return_quantity,
                }
            )

        return Response(
            {
                "data": {
                    "sales_invoice_id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                    "warehouse_id": str(invoice.warehouse_id),
                    "warehouse_name": invoice.warehouse.name,
                    "customer_id": str(invoice.customer_id),
                    "customer_name": invoice.customer.business_name,
                    "lines": SalesReturnInvoiceLinePreviewSerializer(payload, many=True).data,
                }
            }
        )


class SalesBankReceiptViewSet(viewsets.ModelViewSet):
    serializer_class = SalesBankReceiptSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter]
    search_fields = [
        "receipt_number",
        "lines__sales_invoice__invoice_number",
        "lines__customer__business_name",
        "bank_account__name",
        "remarks",
    ]

    def get_queryset(self):
        queryset = (
            SalesBankReceipt.objects.filter(
                **get_shared_tenant_filter(self.request),
                deleted_at__isnull=True,
            )
            .select_related("bank_account")
            .prefetch_related(
                "lines__customer",
                "lines__sales_invoice",
                "lines__salesman",
                "lines__party_opening_balance",
            )
            .order_by("-date", "-created_at")
            .distinct()
        )
        return filter_queryset_by_allowed_salesmen(
            queryset,
            self.request.user,
            field_name="lines__sales_invoice__salesman_id",
        )

    def _get_serializable_receipt(self, receipt_id):
        return self.get_queryset().get(id=receipt_id)

    def create(self, request, *args, **kwargs):
        with transaction.atomic():
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            receipt = serializer.save()
            sync_sales_bank_receipt_journal(self._get_serializable_receipt(receipt.id))
        response_serializer = self.get_serializer(
            self._get_serializable_receipt(receipt.id)
        )
        return Response(
            {
                "data": response_serializer.data,
                "message": "Sales bank receipt created successfully",
            },
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        previous_tenant_id = instance.tenant_id
        with transaction.atomic():
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            receipt = serializer.save()
            if previous_tenant_id != receipt.tenant_id:
                delete_journal_entry(
                    JournalEntry.SourceType.SALES_BANK_RECEIPT,
                    receipt.id,
                    previous_tenant_id,
                )
            sync_sales_bank_receipt_journal(self._get_serializable_receipt(receipt.id))
        response_serializer = self.get_serializer(
            self._get_serializable_receipt(receipt.id)
        )
        return Response(response_serializer.data)

    def perform_destroy(self, instance):
        instance.deleted_at = now()
        instance.save(update_fields=["deleted_at", "updated_at"])

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        with transaction.atomic():
            self.perform_destroy(instance)
            delete_journal_entry(
                JournalEntry.SourceType.SALES_BANK_RECEIPT,
                instance.id,
                instance.tenant_id,
            )
        return Response(
            {"data": None, "message": "Sales bank receipt deleted successfully"},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="invoice-options")
    def invoice_options(self, request):
        customer_id = request.query_params.get("customer_id")
        receipt_id = request.query_params.get("receipt_id")

        if not customer_id:
            return Response({"data": []})

        shared_filter = get_shared_tenant_filter(request)
        current_receipt = None
        current_invoice_ids = set()
        current_opening_ids = set()
        if receipt_id:
            try:
                current_receipt = SalesBankReceipt.objects.prefetch_related(
                    "lines__sales_invoice",
                ).get(
                    id=receipt_id,
                    tenant_id__in=shared_filter["tenant_id__in"],
                    deleted_at__isnull=True,
                )
            except SalesBankReceipt.DoesNotExist:
                raise ValidationError({"receipt_id": "Sales bank receipt not found."})
            for line in current_receipt.lines.filter(deleted_at__isnull=True):
                if line.sales_invoice_id:
                    current_invoice_ids.add(line.sales_invoice_id)
                    if not user_can_access_salesman(
                        request.user, line.sales_invoice.salesman_id if line.sales_invoice else None
                    ):
                        raise ValidationError({"receipt_id": "Sales bank receipt not found."})
                if line.party_opening_balance_id:
                    current_opening_ids.add(line.party_opening_balance_id)

        invoices = (
            SalesInvoice.objects.filter(
                **shared_filter,
                customer_id=customer_id,
                deleted_at__isnull=True,
            )
            .select_related("salesman")
            .order_by("-date", "-created_at")
        )
        invoices = filter_queryset_by_allowed_salesmen(invoices, request.user)

        payload = []
        for invoice in invoices:
            excluded_receipt_ids = [current_receipt.id] if current_receipt else []
            financials = get_sales_invoice_financials(
                invoice,
                excluded_receipt_ids=excluded_receipt_ids,
            )
            include_current_invoice = invoice.id in current_invoice_ids
            if financials["balance_amount"] <= Decimal("0.00") and not include_current_invoice:
                continue

            payload.append(
                {
                    "receipt_against": SalesBankReceiptLine.ReceiptAgainst.INVOICE,
                    "id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                    "date": invoice.date,
                    "tenant_id": invoice.tenant_id,
                    "net_amount": str(financials["net_amount"]),
                    "returned_amount": str(financials["returned_amount"]),
                    "received_amount": str(financials["received_amount"]),
                    "balance_amount": str(financials["balance_amount"]),
                    "salesman": (
                        {
                            "id": str(invoice.salesman.id),
                            "code": invoice.salesman.code,
                            "name": invoice.salesman.name,
                            "commission_on_recovery": str(invoice.salesman.commission_on_recovery),
                        }
                        if invoice.salesman
                        else None
                    ),
                }
            )

        opening_qs = PartyOpeningBalance.objects.select_related("customer").filter(
            tenant_id__in=shared_filter["tenant_id__in"],
            customer_id=customer_id,
            party_type=PartyOpeningBalance.PartyType.CUSTOMER,
            deleted_at__isnull=True,
        )
        for opening in opening_qs:
            include_current_opening = opening.id in current_opening_ids
            excluded_ids = [current_receipt.id] if current_receipt else []
            opening_financials = get_customer_opening_balance_financials(
                opening,
                excluded_receipt_ids=excluded_ids,
            )
            if opening_financials["balance_amount"] <= Decimal("0.00") and not include_current_opening:
                continue

            payload.append(
                {
                    "receipt_against": SalesBankReceiptLine.ReceiptAgainst.OPENING_BALANCE,
                    "id": str(opening.id),
                    "invoice_number": "Opening Balance",
                    "date": opening.date,
                    "tenant_id": opening.tenant_id,
                    "net_amount": str(opening_financials["opening_amount"]),
                    "returned_amount": "0.00",
                    "received_amount": str(opening_financials["received_amount"]),
                    "balance_amount": str(opening_financials["balance_amount"]),
                    "salesman": None,
                }
            )

        return Response({"data": payload})


class SalesmanCommissionPaymentViewSet(viewsets.ModelViewSet):
    serializer_class = SalesmanCommissionPaymentSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter]
    search_fields = [
        "voucher_number",
        "sales_invoice__invoice_number",
        "salesman__name",
        "salesman__code",
        "remarks",
    ]

    def get_queryset(self):
        queryset = (
            SalesmanCommissionPayment.objects.filter(
                **get_shared_tenant_filter(self.request),
                deleted_at__isnull=True,
            )
            .select_related("salesman", "sales_invoice", "payable_account", "payment_account")
            .order_by("-date", "-created_at")
        )
        return filter_queryset_by_allowed_salesmen(queryset, self.request.user)

    def _get_serializable_payment(self, payment_id):
        return self.get_queryset().get(id=payment_id)

    def create(self, request, *args, **kwargs):
        with transaction.atomic():
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            payment = serializer.save()
            sync_salesman_commission_payment_journal(
                self._get_serializable_payment(payment.id)
            )
        response_serializer = self.get_serializer(
            self._get_serializable_payment(payment.id)
        )
        return Response(
            {
                "data": response_serializer.data,
                "message": "Salesman commission voucher created successfully",
            },
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        with transaction.atomic():
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            payment = serializer.save()
            sync_salesman_commission_payment_journal(
                self._get_serializable_payment(payment.id)
            )
        response_serializer = self.get_serializer(
            self._get_serializable_payment(payment.id)
        )
        return Response(response_serializer.data)

    def perform_destroy(self, instance):
        instance.deleted_at = now()
        instance.save(update_fields=["deleted_at", "updated_at"])

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        with transaction.atomic():
            self.perform_destroy(instance)
            delete_journal_entry(
                JournalEntry.SourceType.SALESMAN_COMMISSION_PAYMENT,
                instance.id,
                instance.tenant_id,
            )
        return Response(
            {"data": None, "message": "Salesman commission voucher deleted successfully"},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="invoice-options")
    def invoice_options(self, request):
        salesman_id = request.query_params.get("salesman_id")
        payment_id = request.query_params.get("payment_id")

        if not salesman_id:
            return Response({"data": []})
        if not user_can_access_salesman(request.user, salesman_id):
            raise ValidationError({"salesman_id": "You do not have access to this salesman."})

        shared_filter = get_shared_tenant_filter(request)
        current_payment = None
        if payment_id:
            try:
                current_payment = SalesmanCommissionPayment.objects.select_related(
                    "sales_invoice"
                ).get(
                    id=payment_id,
                    tenant_id__in=shared_filter["tenant_id__in"],
                    deleted_at__isnull=True,
                )
            except SalesmanCommissionPayment.DoesNotExist:
                raise ValidationError(
                    {"payment_id": "Salesman commission voucher not found."}
                )
            if not user_can_access_salesman(request.user, current_payment.salesman_id):
                raise ValidationError({"payment_id": "Salesman commission voucher not found."})

        invoices = (
            SalesInvoice.objects.filter(
                **shared_filter,
                deleted_at__isnull=True,
            )
            .filter(
                Q(salesman_id=salesman_id, salesman_commission_amount__gt=Decimal("0.00"))
                | Q(
                    bank_receipts__salesman_id=salesman_id,
                    bank_receipts__recovery_commission_amount__gt=Decimal("0.00"),
                    bank_receipts__deleted_at__isnull=True,
                )
            )
            .distinct()
            .select_related("customer", "salesman")
            .order_by("-date", "-created_at")
        )

        payload = []
        for invoice in invoices:
            excluded_payment_ids = [current_payment.id] if current_payment else []
            financials = get_salesman_commission_financials(
                invoice,
                salesman_id=salesman_id,
                excluded_payment_ids=excluded_payment_ids,
            )
            include_current_invoice = (
                current_payment and current_payment.sales_invoice_id == invoice.id
            )
            if financials["pending_amount"] <= Decimal("0.00") and not include_current_invoice:
                continue

            payload.append(
                {
                    "id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                    "date": invoice.date,
                    "customer_name": invoice.customer.business_name,
                    "commission_amount": str(financials["commission_amount"]),
                    "paid_amount": str(financials["paid_amount"]),
                    "pending_amount": str(financials["pending_amount"]),
                }
            )

        return Response({"data": payload})
