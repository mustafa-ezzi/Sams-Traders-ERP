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
    sync_purchase_bank_payment_journal,
    sync_purchase_invoice_journal,
    sync_purchase_return_journal,
)
from accounts.models import JournalEntry
from inventory.models import Product, ProductStock
from inventory.pagination import StandardResultsSetPagination
from inventory.services import sync_product_stock_quantity
from purchase.models import (
    PurchaseBankPayment,
    PurchaseInvoice,
    PurchaseInvoiceLine,
    PurchaseReturn,
    PurchaseReturnLine,
)
from purchase.serializers import (
    PurchaseBankPaymentSerializer,
    PurchaseInvoiceSerializer,
    PurchaseReturnInvoiceLinePreviewSerializer,
    PurchaseReturnSerializer,
)
from purchase.services import (
    get_purchase_invoice_financials,
    get_purchase_return_line_metrics,
    quantize_money,
)


class PurchaseInvoiceViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseInvoiceSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ["invoice_number", "supplier__business_name", "remarks", "warehouse__name"]

    def get_queryset(self):
        return (
            PurchaseInvoice.objects.filter(
                tenant_id=self.request.user.tenant_id,
                deleted_at__isnull=True,
            )
            .select_related("supplier", "warehouse")
            .prefetch_related(
                Prefetch(
                    "lines",
                    queryset=PurchaseInvoiceLine.objects.filter(
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
            sync_product_stock_quantity(
                invoice.tenant_id,
                invoice.warehouse_id,
                product_id,
            )

    def _sync_product_stock_pairs(self, tenant_id, warehouse_id, product_ids):
        for product_id in set(product_ids):
            sync_product_stock_quantity(tenant_id, warehouse_id, product_id)

    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        with transaction.atomic():
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            invoice = serializer.save()
            self._sync_invoice_product_stock(invoice)
            sync_purchase_invoice_journal(self._get_serializable_invoice(invoice.id))
        response_serializer = self.get_serializer(
            self._get_serializable_invoice(invoice.id)
        )
        return Response(
            {
                "data": response_serializer.data,
                "message": "Purchase invoice created successfully",
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
            sync_purchase_invoice_journal(self._get_serializable_invoice(invoice.id))
        response_serializer = self.get_serializer(
            self._get_serializable_invoice(invoice.id)
        )
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
                JournalEntry.SourceType.PURCHASE_INVOICE,
                instance.id,
                tenant_id,
            )
        return Response(
            {"data": None, "message": "Purchase invoice deleted successfully"},
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


class PurchaseReturnViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseReturnSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter]
    search_fields = [
        "return_number",
        "purchase_invoice__invoice_number",
        "supplier__business_name",
        "remarks",
    ]

    def get_queryset(self):
        return (
            PurchaseReturn.objects.filter(
                tenant_id=self.request.user.tenant_id,
                deleted_at__isnull=True,
            )
            .select_related("supplier", "purchase_invoice", "purchase_invoice__warehouse")
            .prefetch_related(
                Prefetch(
                    "lines",
                    queryset=PurchaseReturnLine.objects.filter(
                        deleted_at__isnull=True,
                    ).select_related("product", "purchase_invoice_line"),
                )
            )
            .order_by("-date", "-created_at")
        )

    def _get_serializable_return(self, purchase_return_id):
        return self.get_queryset().get(id=purchase_return_id)

    def _sync_purchase_return_stock(self, purchase_return):
        product_ids = list(
            purchase_return.lines.filter(deleted_at__isnull=True)
            .values_list("product_id", flat=True)
            .distinct()
        )
        for product_id in product_ids:
            sync_product_stock_quantity(
                purchase_return.tenant_id,
                purchase_return.purchase_invoice.warehouse_id,
                product_id,
            )

    def _sync_product_stock_pairs(self, tenant_id, warehouse_id, product_ids):
        for product_id in set(product_ids):
            sync_product_stock_quantity(tenant_id, warehouse_id, product_id)

    def create(self, request, *args, **kwargs):
        with transaction.atomic():
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            purchase_return = serializer.save()
            self._sync_purchase_return_stock(purchase_return)
            sync_purchase_return_journal(self._get_serializable_return(purchase_return.id))
        response_serializer = self.get_serializer(
            self._get_serializable_return(purchase_return.id)
        )
        return Response(
            {
                "data": response_serializer.data,
                "message": "Purchase return created successfully",
            },
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        old_warehouse_id = instance.purchase_invoice.warehouse_id
        old_product_ids = list(
            instance.lines.filter(deleted_at__isnull=True).values_list("product_id", flat=True)
        )
        with transaction.atomic():
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            purchase_return = serializer.save()
            self._sync_purchase_return_stock(purchase_return)
            self._sync_product_stock_pairs(instance.tenant_id, old_warehouse_id, old_product_ids)
            sync_purchase_return_journal(self._get_serializable_return(purchase_return.id))
        response_serializer = self.get_serializer(
            self._get_serializable_return(purchase_return.id)
        )
        return Response(response_serializer.data)

    def perform_destroy(self, instance):
        instance.deleted_at = now()
        instance.save(update_fields=["deleted_at", "updated_at"])
        instance.lines.filter(deleted_at__isnull=True).update(deleted_at=now())

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        tenant_id = instance.tenant_id
        warehouse_id = instance.purchase_invoice.warehouse_id
        product_ids = list(
            instance.lines.filter(deleted_at__isnull=True).values_list("product_id", flat=True)
        )
        with transaction.atomic():
            self.perform_destroy(instance)
            self._sync_product_stock_pairs(tenant_id, warehouse_id, product_ids)
            delete_journal_entry(
                JournalEntry.SourceType.PURCHASE_RETURN,
                instance.id,
                tenant_id,
            )
        return Response(
            {"data": None, "message": "Purchase return deleted successfully"},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="invoice-options")
    def invoice_options(self, request):
        tenant_id = request.user.tenant_id
        supplier_id = request.query_params.get("supplier_id")

        if not supplier_id:
            return Response({"data": []})

        invoices = (
            PurchaseInvoice.objects.filter(
                tenant_id=tenant_id,
                supplier_id=supplier_id,
                deleted_at__isnull=True,
            )
            .order_by("-date", "-created_at")
            .values("id", "invoice_number", "date")
        )
        return Response({"data": list(invoices)})

    @action(detail=False, methods=["get"], url_path="invoice-lines")
    def invoice_lines(self, request):
        tenant_id = request.user.tenant_id
        purchase_invoice_id = request.query_params.get("purchase_invoice_id")
        purchase_return_id = request.query_params.get("purchase_return_id")

        if not purchase_invoice_id:
            raise ValidationError({"purchase_invoice_id": "Purchase invoice is required."})

        try:
            invoice = (
                PurchaseInvoice.objects.select_related("warehouse", "supplier")
                .get(
                    id=purchase_invoice_id,
                    tenant_id=tenant_id,
                    deleted_at__isnull=True,
                )
            )
        except PurchaseInvoice.DoesNotExist:
            raise ValidationError({"purchase_invoice_id": "Purchase invoice not found for this tenant."})

        excluded_return_line_ids = []
        existing_quantities = {}
        if purchase_return_id:
            try:
                current_return = PurchaseReturn.objects.get(
                    id=purchase_return_id,
                    tenant_id=tenant_id,
                    deleted_at__isnull=True,
                )
            except PurchaseReturn.DoesNotExist:
                raise ValidationError({"purchase_return_id": "Purchase return not found for this tenant."})

            excluded_return_line_ids = list(
                current_return.lines.filter(deleted_at__isnull=True).values_list("id", flat=True)
            )
            existing_quantities = {
                str(line.purchase_invoice_line_id): quantize_money(line.quantity)
                for line in current_return.lines.filter(deleted_at__isnull=True).select_related(
                    "purchase_invoice_line"
                )
            }

        payload = []
        invoice_lines = invoice.lines.filter(deleted_at__isnull=True).select_related("product")
        for invoice_line in invoice_lines:
            metrics = get_purchase_return_line_metrics(
                invoice_line,
                excluded_return_line_ids=excluded_return_line_ids,
            )
            current_return_qty = existing_quantities.get(str(invoice_line.id), Decimal("0.00"))
            max_return_quantity = quantize_money(
                metrics["available_return_quantity"] + current_return_qty
            )
            payload.append(
                {
                    "purchase_invoice_line_id": invoice_line.id,
                    "product_id": invoice_line.product_id,
                    "product_name": invoice_line.product.name,
                    "purchased_quantity": quantize_money(invoice_line.quantity),
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
                    "purchase_invoice_id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                    "warehouse_id": str(invoice.warehouse_id),
                    "warehouse_name": invoice.warehouse.name,
                    "supplier_id": str(invoice.supplier_id),
                    "supplier_name": invoice.supplier.business_name,
                    "lines": PurchaseReturnInvoiceLinePreviewSerializer(payload, many=True).data,
                }
            }
        )


class PurchaseBankPaymentViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseBankPaymentSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter]
    search_fields = [
        "payment_number",
        "purchase_invoice__invoice_number",
        "supplier__business_name",
        "bank_account__name",
        "remarks",
    ]

    def get_queryset(self):
        return (
            PurchaseBankPayment.objects.filter(
                tenant_id=self.request.user.tenant_id,
                deleted_at__isnull=True,
            )
            .select_related("supplier", "purchase_invoice", "bank_account")
            .order_by("-date", "-created_at")
        )

    def _get_serializable_payment(self, payment_id):
        return self.get_queryset().get(id=payment_id)

    def create(self, request, *args, **kwargs):
        with transaction.atomic():
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            payment = serializer.save()
            sync_purchase_bank_payment_journal(self._get_serializable_payment(payment.id))
        response_serializer = self.get_serializer(
            self._get_serializable_payment(payment.id)
        )
        return Response(
            {
                "data": response_serializer.data,
                "message": "Purchase bank payment created successfully",
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
            sync_purchase_bank_payment_journal(self._get_serializable_payment(payment.id))
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
                JournalEntry.SourceType.PURCHASE_BANK_PAYMENT,
                instance.id,
                instance.tenant_id,
            )
        return Response(
            {"data": None, "message": "Purchase bank payment deleted successfully"},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="invoice-options")
    def invoice_options(self, request):
        tenant_id = request.user.tenant_id
        supplier_id = request.query_params.get("supplier_id")
        payment_id = request.query_params.get("payment_id")

        if not supplier_id:
            return Response({"data": []})

        current_payment = None
        if payment_id:
            try:
                current_payment = PurchaseBankPayment.objects.select_related("purchase_invoice").get(
                    id=payment_id,
                    tenant_id=tenant_id,
                    deleted_at__isnull=True,
                )
            except PurchaseBankPayment.DoesNotExist:
                raise ValidationError({"payment_id": "Purchase bank payment not found for this tenant."})

        invoices = (
            PurchaseInvoice.objects.filter(
                tenant_id=tenant_id,
                supplier_id=supplier_id,
                deleted_at__isnull=True,
            )
            .order_by("-date", "-created_at")
        )

        payload = []
        for invoice in invoices:
            excluded_payment_ids = [current_payment.id] if current_payment else []
            financials = get_purchase_invoice_financials(
                invoice,
                excluded_payment_ids=excluded_payment_ids,
            )
            include_current_invoice = current_payment and current_payment.purchase_invoice_id == invoice.id
            if financials["balance_amount"] <= Decimal("0.00") and not include_current_invoice:
                continue

            payload.append(
                {
                    "id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                    "date": invoice.date,
                    "net_amount": str(financials["net_amount"]),
                    "returned_amount": str(financials["returned_amount"]),
                    "paid_amount": str(financials["paid_amount"]),
                    "balance_amount": str(financials["balance_amount"]),
                }
            )

        return Response({"data": payload})
