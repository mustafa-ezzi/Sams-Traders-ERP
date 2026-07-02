from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Sum

from sales.models import (
    SalesBankReceipt,
    SalesInvoiceLine,
    SalesmanCommissionPayment,
    SalesReturn,
    SalesReturnLine,
)


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


def get_salesman_commission_financials(
    sales_invoice,
    salesman_id=None,
    excluded_payment_ids=None,
):
    excluded_payment_ids = excluded_payment_ids or []

    sales_commission_amount = Decimal("0.00")
    if salesman_id is None or str(sales_invoice.salesman_id or "") == str(salesman_id):
        sales_commission_amount = sales_invoice.salesman_commission_amount or Decimal("0.00")

    recovery_receipts = SalesBankReceipt.objects.filter(
        tenant_id=sales_invoice.tenant_id,
        sales_invoice=sales_invoice,
        deleted_at__isnull=True,
    )
    if salesman_id is not None:
        recovery_receipts = recovery_receipts.filter(salesman_id=salesman_id)

    recovery_commission_amount = (
        recovery_receipts.aggregate(total=Sum("recovery_commission_amount"))["total"]
        or Decimal("0.00")
    )

    payment_queryset = SalesmanCommissionPayment.objects.filter(
        tenant_id=sales_invoice.tenant_id,
        sales_invoice=sales_invoice,
        deleted_at__isnull=True,
    )
    if salesman_id is not None:
        payment_queryset = payment_queryset.filter(salesman_id=salesman_id)

    paid_amount = (
        payment_queryset.exclude(id__in=excluded_payment_ids).aggregate(total=Sum("payment"))[
            "total"
        ]
        or Decimal("0.00")
    )
    sales_commission_amount = quantize_money(sales_commission_amount)
    recovery_commission_amount = quantize_money(recovery_commission_amount)
    commission_amount = quantize_money(sales_commission_amount + recovery_commission_amount)
    paid_amount = quantize_money(paid_amount)
    pending_amount = max(
        quantize_money(commission_amount - paid_amount),
        Decimal("0.00"),
    )

    return {
        "commission_amount": commission_amount,
        "sales_commission_amount": sales_commission_amount,
        "recovery_commission_amount": recovery_commission_amount,
        "paid_amount": paid_amount,
        "pending_amount": pending_amount,
    }
