from decimal import Decimal

from django.db import transaction
from django.db.models import Prefetch
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
)
from accounts.models import JournalEntry
from inventory.models import Product, ProductStock
from inventory.pagination import StandardResultsSetPagination
from inventory.services import sync_product_stock_quantity
from sales.models import SalesBankReceipt, SalesInvoice, SalesInvoiceLine, SalesReturn, SalesReturnLine
from sales.serializers import (
    SalesBankReceiptSerializer,
    SalesInvoiceSerializer,
    SalesReturnInvoiceLinePreviewSerializer,
    SalesReturnSerializer,
)
from sales.services import (
    get_sales_invoice_financials,
    get_sales_return_line_metrics,
    quantize_money,
)


class SalesInvoiceViewSet(viewsets.ModelViewSet):
    serializer_class = SalesInvoiceSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ["invoice_number", "customer__business_name", "remarks", "warehouse__name"]

    def get_queryset(self):
        return (
            SalesInvoice.objects.filter(
                tenant_id=self.request.user.tenant_id,
                deleted_at__isnull=True,
            )
            .select_related("customer", "warehouse")
            .prefetch_related(
                Prefetch(
                    "lines",
                    queryset=SalesInvoiceLine.objects.filter(
                        deleted_at__isnull=True,
                    ).select_related("product"),
                )
            )
            .order_by("-date", "-created_at")
        )

    def _get_serializable_invoice(self, invoice_id):
        return self.get_queryset().get(id=invoice_id)

    def _sync_invoice_product_stock(self, invoice):
        product_ids = list(
            invoice.lines.filter(deleted_at__isnull=True).values_list("product_id", flat=True).distinct()
        )
        for product_id in product_ids:
            sync_product_stock_quantity(invoice.tenant_id, invoice.warehouse_id, product_id)

    def _sync_product_stock_pairs(self, tenant_id, warehouse_id, product_ids):
        for product_id in set(product_ids):
            sync_product_stock_quantity(tenant_id, warehouse_id, product_id)

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
        old_product_ids = list(
            instance.lines.filter(deleted_at__isnull=True).values_list("product_id", flat=True)
        )
        with transaction.atomic():
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            invoice = serializer.save()
            self._sync_invoice_product_stock(invoice)
            self._sync_product_stock_pairs(instance.tenant_id, old_warehouse_id, old_product_ids)
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
        product_ids = list(
            instance.lines.filter(deleted_at__isnull=True).values_list("product_id", flat=True)
        )
        with transaction.atomic():
            self.perform_destroy(instance)
            self._sync_product_stock_pairs(tenant_id, warehouse_id, product_ids)
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
        tenant_id = request.user.tenant_id
        warehouse_id = request.query_params.get("warehouse_id")
        search = request.query_params.get("search", "").strip()

        queryset = Product.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ).order_by("name")

        if search:
            queryset = queryset.filter(name__icontains=search)

        products = []
        for product in queryset[:100]:
            quantity = Decimal("0.00")
            if warehouse_id:
                stock = ProductStock.objects.filter(
                    tenant_id=tenant_id,
                    warehouse_id=warehouse_id,
                    product_id=product.id,
                    deleted_at__isnull=True,
                ).first()
                quantity = stock.quantity if stock else Decimal("0.00")
            products.append(
                {
                    "id": str(product.id),
                    "name": product.name,
                    "quantity": str(quantity),
                    "product_type": product.product_type,
                    "net_amount": str(product.net_amount),
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
        return (
            SalesReturn.objects.filter(
                tenant_id=self.request.user.tenant_id,
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

    def _get_serializable_return(self, sales_return_id):
        return self.get_queryset().get(id=sales_return_id)

    def _sync_sales_return_stock(self, sales_return):
        product_ids = list(
            sales_return.lines.filter(deleted_at__isnull=True)
            .values_list("product_id", flat=True)
            .distinct()
        )
        for product_id in product_ids:
            sync_product_stock_quantity(
                sales_return.tenant_id,
                sales_return.sales_invoice.warehouse_id,
                product_id,
            )

    def _sync_product_stock_pairs(self, tenant_id, warehouse_id, product_ids):
        for product_id in set(product_ids):
            sync_product_stock_quantity(tenant_id, warehouse_id, product_id)

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
        old_product_ids = list(
            instance.lines.filter(deleted_at__isnull=True).values_list("product_id", flat=True)
        )
        with transaction.atomic():
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            sales_return = serializer.save()
            self._sync_sales_return_stock(sales_return)
            self._sync_product_stock_pairs(instance.tenant_id, old_warehouse_id, old_product_ids)
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
        product_ids = list(
            instance.lines.filter(deleted_at__isnull=True).values_list("product_id", flat=True)
        )
        with transaction.atomic():
            self.perform_destroy(instance)
            self._sync_product_stock_pairs(tenant_id, warehouse_id, product_ids)
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
        tenant_id = request.user.tenant_id
        customer_id = request.query_params.get("customer_id")

        if not customer_id:
            return Response({"data": []})

        invoices = (
            SalesInvoice.objects.filter(
                tenant_id=tenant_id,
                customer_id=customer_id,
                deleted_at__isnull=True,
            )
            .order_by("-date", "-created_at")
            .values("id", "invoice_number", "date")
        )
        return Response({"data": list(invoices)})

    @action(detail=False, methods=["get"], url_path="invoice-lines")
    def invoice_lines(self, request):
        tenant_id = request.user.tenant_id
        sales_invoice_id = request.query_params.get("sales_invoice_id")
        sales_return_id = request.query_params.get("sales_return_id")

        if not sales_invoice_id:
            raise ValidationError({"sales_invoice_id": "Sales invoice is required."})

        try:
            invoice = SalesInvoice.objects.select_related("warehouse", "customer").get(
                id=sales_invoice_id,
                tenant_id=tenant_id,
                deleted_at__isnull=True,
            )
        except SalesInvoice.DoesNotExist:
            raise ValidationError({"sales_invoice_id": "Sales invoice not found for this tenant."})

        excluded_return_line_ids = []
        existing_quantities = {}
        if sales_return_id:
            try:
                current_return = SalesReturn.objects.get(
                    id=sales_return_id,
                    tenant_id=tenant_id,
                    deleted_at__isnull=True,
                )
            except SalesReturn.DoesNotExist:
                raise ValidationError({"sales_return_id": "Sales return not found for this tenant."})

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
        invoice_lines = invoice.lines.filter(deleted_at__isnull=True).select_related("product")
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
        "sales_invoice__invoice_number",
        "customer__business_name",
        "bank_account__name",
        "remarks",
    ]

    def get_queryset(self):
        return (
            SalesBankReceipt.objects.filter(
                tenant_id=self.request.user.tenant_id,
                deleted_at__isnull=True,
            )
            .select_related("customer", "sales_invoice", "bank_account")
            .order_by("-date", "-created_at")
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
        with transaction.atomic():
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            receipt = serializer.save()
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
        tenant_id = request.user.tenant_id
        customer_id = request.query_params.get("customer_id")
        receipt_id = request.query_params.get("receipt_id")

        if not customer_id:
            return Response({"data": []})

        current_receipt = None
        if receipt_id:
            try:
                current_receipt = SalesBankReceipt.objects.select_related("sales_invoice").get(
                    id=receipt_id,
                    tenant_id=tenant_id,
                    deleted_at__isnull=True,
                )
            except SalesBankReceipt.DoesNotExist:
                raise ValidationError({"receipt_id": "Sales bank receipt not found for this tenant."})

        invoices = (
            SalesInvoice.objects.filter(
                tenant_id=tenant_id,
                customer_id=customer_id,
                deleted_at__isnull=True,
            )
            .order_by("-date", "-created_at")
        )

        payload = []
        for invoice in invoices:
            excluded_receipt_ids = [current_receipt.id] if current_receipt else []
            financials = get_sales_invoice_financials(
                invoice,
                excluded_receipt_ids=excluded_receipt_ids,
            )
            include_current_invoice = current_receipt and current_receipt.sales_invoice_id == invoice.id
            if financials["balance_amount"] <= Decimal("0.00") and not include_current_invoice:
                continue

            payload.append(
                {
                    "id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                    "date": invoice.date,
                    "net_amount": str(financials["net_amount"]),
                    "returned_amount": str(financials["returned_amount"]),
                    "received_amount": str(financials["received_amount"]),
                    "balance_amount": str(financials["balance_amount"]),
                }
            )

        return Response({"data": payload})
