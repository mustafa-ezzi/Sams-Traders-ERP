from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Sum

from inventory.models import ProductStock
from purchase.models import PurchaseBankPayment, PurchaseReturn, PurchaseReturnLine


TWO_PLACES = Decimal("0.01")


def quantize_money(value):
    return Decimal(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def get_purchase_return_line_metrics(invoice_line, excluded_return_line_ids=None):
    excluded_return_line_ids = excluded_return_line_ids or []

    returned_total = (
        PurchaseReturnLine.objects.filter(
            tenant_id=invoice_line.tenant_id,
            purchase_invoice_line=invoice_line,
            deleted_at__isnull=True,
            purchase_return__deleted_at__isnull=True,
        )
        .exclude(id__in=excluded_return_line_ids)
        .aggregate(total=Sum("quantity"))["total"]
        or Decimal("0.00")
    )

    current_stock = (
        ProductStock.objects.filter(
            tenant_id=invoice_line.tenant_id,
            warehouse_id=invoice_line.invoice.warehouse_id,
            product_id=invoice_line.product_id,
            deleted_at__isnull=True,
        )
        .values_list("quantity", flat=True)
        .first()
        or Decimal("0.00")
    )

    remaining_invoice_quantity = max(
        quantize_money(invoice_line.quantity - returned_total),
        Decimal("0.00"),
    )
    available_return_quantity = min(remaining_invoice_quantity, quantize_money(current_stock))
    sold_quantity = max(
        quantize_money(remaining_invoice_quantity - available_return_quantity),
        Decimal("0.00"),
    )

    return {
        "returned_total": quantize_money(returned_total),
        "remaining_invoice_quantity": remaining_invoice_quantity,
        "available_return_quantity": quantize_money(available_return_quantity),
        "sold_quantity": sold_quantity,
    }


def get_purchase_invoice_financials(purchase_invoice, excluded_payment_ids=None):
    excluded_payment_ids = excluded_payment_ids or []

    returned_amount = (
        PurchaseReturn.objects.filter(
            tenant_id=purchase_invoice.tenant_id,
            purchase_invoice=purchase_invoice,
            deleted_at__isnull=True,
        ).aggregate(total=Sum("gross_amount"))["total"]
        or Decimal("0.00")
    )

    paid_amount = (
        PurchaseBankPayment.objects.filter(
            tenant_id=purchase_invoice.tenant_id,
            purchase_invoice=purchase_invoice,
            deleted_at__isnull=True,
        )
        .exclude(id__in=excluded_payment_ids)
        .aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )

    net_amount = quantize_money(purchase_invoice.net_amount or Decimal("0.00"))
    returned_amount = quantize_money(returned_amount)
    paid_amount = quantize_money(paid_amount)
    balance_amount = max(
        quantize_money(net_amount - returned_amount - paid_amount),
        Decimal("0.00"),
    )

    return {
        "net_amount": net_amount,
        "returned_amount": returned_amount,
        "paid_amount": paid_amount,
        "balance_amount": balance_amount,
    }
