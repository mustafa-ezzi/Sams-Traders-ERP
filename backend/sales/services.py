from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Sum

from sales.models import SalesBankReceipt, SalesInvoiceLine, SalesReturn, SalesReturnLine


TWO_PLACES = Decimal("0.01")


def quantize_money(value):
    return Decimal(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def get_available_sale_quantity(tenant_id, warehouse_id, product_id, excluded_sale_line_ids=None):
    from inventory.models import ProductStock

    excluded_sale_line_ids = excluded_sale_line_ids or []

    current_stock = (
        ProductStock.objects.filter(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            product_id=product_id,
            deleted_at__isnull=True,
        )
        .values_list("quantity", flat=True)
        .first()
        or Decimal("0.00")
    )

    excluded_quantity = (
        SalesInvoiceLine.objects.filter(
            tenant_id=tenant_id,
            invoice__warehouse_id=warehouse_id,
            product_id=product_id,
            deleted_at__isnull=True,
            invoice__deleted_at__isnull=True,
            id__in=excluded_sale_line_ids,
        ).aggregate(total=Sum("quantity"))["total"]
        or Decimal("0.00")
    )

    return quantize_money(current_stock + excluded_quantity)


def get_sales_return_line_metrics(invoice_line, excluded_return_line_ids=None):
    excluded_return_line_ids = excluded_return_line_ids or []

    returned_total = (
        SalesReturnLine.objects.filter(
            tenant_id=invoice_line.tenant_id,
            sales_invoice_line=invoice_line,
            deleted_at__isnull=True,
            sales_return__deleted_at__isnull=True,
        )
        .exclude(id__in=excluded_return_line_ids)
        .aggregate(total=Sum("quantity"))["total"]
        or Decimal("0.00")
    )

    remaining_invoice_quantity = max(
        quantize_money(invoice_line.quantity - returned_total),
        Decimal("0.00"),
    )

    return {
        "returned_total": quantize_money(returned_total),
        "sold_quantity": quantize_money(invoice_line.quantity),
        "available_return_quantity": remaining_invoice_quantity,
    }


def get_sales_invoice_financials(sales_invoice, excluded_receipt_ids=None):
    excluded_receipt_ids = excluded_receipt_ids or []

    returned_amount = (
        SalesReturn.objects.filter(
            tenant_id=sales_invoice.tenant_id,
            sales_invoice=sales_invoice,
            deleted_at__isnull=True,
        ).aggregate(total=Sum("gross_amount"))["total"]
        or Decimal("0.00")
    )

    received_amount = (
        SalesBankReceipt.objects.filter(
            tenant_id=sales_invoice.tenant_id,
            sales_invoice=sales_invoice,
            deleted_at__isnull=True,
        )
        .exclude(id__in=excluded_receipt_ids)
        .aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )

    net_amount = quantize_money(sales_invoice.net_amount or Decimal("0.00"))
    returned_amount = quantize_money(returned_amount)
    received_amount = quantize_money(received_amount)
    balance_amount = max(
        quantize_money(net_amount - returned_amount - received_amount),
        Decimal("0.00"),
    )

    return {
        "net_amount": net_amount,
        "returned_amount": returned_amount,
        "received_amount": received_amount,
        "balance_amount": balance_amount,
    }
