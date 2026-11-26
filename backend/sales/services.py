from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Sum

from sales.models import (
    SalesBankReceiptLine,
    SalesInvoice,
    SalesInvoiceLine,
    SalesmanCommissionPayment,
    SalesmanCommissionPaymentLine,
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


def get_sales_return_line_metrics(
    invoice_line,
    excluded_return_line_ids=None,
    excluded_sales_return_id=None,
):
    """
    Remaining returnable qty for an invoice line.

    On edit, pass excluded_sales_return_id (and/or excluded_return_line_ids) so
    the return being edited does not consume its own quantity.
    """
    excluded_return_line_ids = excluded_return_line_ids or []

    queryset = SalesReturnLine.objects.filter(
        sales_invoice_line=invoice_line,
        deleted_at__isnull=True,
        sales_return__deleted_at__isnull=True,
    )
    if excluded_sales_return_id:
        queryset = queryset.exclude(sales_return_id=excluded_sales_return_id)
    if excluded_return_line_ids:
        queryset = queryset.exclude(id__in=excluded_return_line_ids)

    returned_total = (
        queryset.aggregate(total=Sum("quantity"))["total"] or Decimal("0.00")
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


def get_sales_invoice_line_totals_by_tenant(sales_invoice):
    """Gross line totals grouped by product/line dimension."""
    return {
        row["tenant_id"]: quantize_money(row["total"] or Decimal("0.00"))
        for row in sales_invoice.lines.filter(deleted_at__isnull=True)
        .values("tenant_id")
        .annotate(total=Sum("total_amount"))
        if row["tenant_id"]
    }


def allocate_invoice_amount_to_line_share(invoice, amount, scoped_line_total):
    """Allocate header net/return/receipt amounts to one dimension by line share."""
    gross = quantize_money(invoice.gross_amount or Decimal("0.00"))
    if gross <= 0:
        return Decimal("0.00")
    return quantize_money(
        (quantize_money(amount or Decimal("0.00")) * quantize_money(scoped_line_total))
        / gross
    )


def _receipt_lines_queryset(excluded_receipt_ids=None, as_of_date=None):
    qs = SalesBankReceiptLine.objects.filter(
        deleted_at__isnull=True,
        receipt__deleted_at__isnull=True,
    ).exclude(receipt_id__in=excluded_receipt_ids or [])
    if as_of_date is not None:
        qs = qs.filter(receipt__date__lte=as_of_date)
    return qs


def _direct_received_for_invoice(receipts_qs, tenant_id=None, line_totals=None):
    """Receipts explicitly allocated to this invoice."""
    if not tenant_id:
        return receipts_qs.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    matched = (
        receipts_qs.filter(tenant_id=tenant_id).aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )
    line_tenants = {code for code in (line_totals or {}) if code}
    if line_tenants:
        orphans = receipts_qs.exclude(tenant_id__in=line_tenants)
        home_tenant = tenant_id if tenant_id in line_tenants else sorted(line_tenants)[0]
    else:
        orphans = receipts_qs.exclude(tenant_id=tenant_id)
        home_tenant = tenant_id
    if tenant_id == home_tenant:
        matched += orphans.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    return matched


def get_fifo_unallocated_receipt_share(
    invoice,
    tenant_id=None,
    excluded_receipt_ids=None,
    as_of_date=None,
):
    """
    Apply customer receipts that reduced AR but were not linked to an invoice
    (or opening balance) onto the oldest open invoices first.
    """
    qs = _receipt_lines_queryset(excluded_receipt_ids, as_of_date).filter(
        customer_id=invoice.customer_id,
        sales_invoice__isnull=True,
        party_opening_balance__isnull=True,
    )
    if tenant_id:
        qs = qs.filter(tenant_id=tenant_id)
    pool = quantize_money(qs.aggregate(total=Sum("amount"))["total"] or Decimal("0.00"))
    if pool <= 0:
        return Decimal("0.00")

    invoices = SalesInvoice.objects.filter(
        customer_id=invoice.customer_id,
        deleted_at__isnull=True,
    ).order_by("date", "created_at", "id")

    for sibling in invoices:
        if tenant_id:
            sibling_totals = get_sales_invoice_line_totals_by_tenant(sibling)
            if sibling_totals and tenant_id not in sibling_totals:
                continue
        sibling_financials = get_sales_invoice_financials(
            sibling,
            excluded_receipt_ids=excluded_receipt_ids,
            as_of_date=as_of_date,
            tenant_id=tenant_id,
            include_unallocated=False,
        )
        take = min(pool, sibling_financials["balance_amount"])
        if sibling.id == invoice.id:
            return quantize_money(take)
        pool = quantize_money(pool - take)
        if pool <= 0:
            break
    return Decimal("0.00")


def get_sales_invoice_financials(
    sales_invoice,
    excluded_receipt_ids=None,
    as_of_date=None,
    tenant_id=None,
    include_unallocated=True,
):
    """
    Outstanding balance for a sales invoice.

    When tenant_id is set, amounts are limited to that dimension's share of a
    mixed AM/SAMS invoice (line totals, receipts posted to that dimension, and
    returns against that dimension's invoice lines).

    Receipts that hit the customer but were not linked to an invoice are applied
    FIFO onto the oldest open invoices so remaining matches the party ledger.
    """
    excluded_receipt_ids = excluded_receipt_ids or []

    returns_qs = SalesReturn.objects.filter(
            sales_invoice=sales_invoice,
            deleted_at__isnull=True,
    )
    if as_of_date is not None:
        returns_qs = returns_qs.filter(date__lte=as_of_date)

    receipts_qs = _receipt_lines_queryset(excluded_receipt_ids, as_of_date).filter(
        sales_invoice=sales_invoice,
    )

    if tenant_id:
        line_totals = get_sales_invoice_line_totals_by_tenant(sales_invoice)
        if line_totals:
            scoped_line_total = line_totals.get(tenant_id, Decimal("0.00"))
            net_amount = allocate_invoice_amount_to_line_share(
                sales_invoice,
                sales_invoice.net_amount or Decimal("0.00"),
                scoped_line_total,
            )
        else:
            net_amount = quantize_money(sales_invoice.net_amount or Decimal("0.00"))

        returned_amount = (
            SalesReturnLine.objects.filter(
                sales_return__in=returns_qs,
                deleted_at__isnull=True,
                sales_invoice_line__tenant_id=tenant_id,
            ).aggregate(total=Sum("amount"))["total"]
            or Decimal("0.00")
        )
        # Legacy header-only returns: allocate by line share.
        if not returned_amount and returns_qs.exists():
            header_returned = (
                returns_qs.aggregate(total=Sum("gross_amount"))["total"]
                or Decimal("0.00")
            )
            if line_totals:
                returned_amount = allocate_invoice_amount_to_line_share(
                    sales_invoice,
                    header_returned,
                    line_totals.get(tenant_id, Decimal("0.00")),
                )
            else:
                returned_amount = header_returned

        received_amount = _direct_received_for_invoice(
            receipts_qs, tenant_id=tenant_id, line_totals=line_totals
        )
    else:
        # Prefer line amounts; fall back to header gross (legacy / header-only rows).
        line_returned = (
            SalesReturnLine.objects.filter(
                sales_return__in=returns_qs,
            deleted_at__isnull=True,
            ).aggregate(total=Sum("amount"))["total"]
            or Decimal("0.00")
        )
        if line_returned:
            returned_amount = line_returned
        else:
            returned_amount = (
                returns_qs.aggregate(total=Sum("gross_amount"))["total"]
        or Decimal("0.00")
    )

        received_amount = _direct_received_for_invoice(receipts_qs)
    net_amount = quantize_money(sales_invoice.net_amount or Decimal("0.00"))

    if include_unallocated:
        received_amount += get_fifo_unallocated_receipt_share(
            sales_invoice,
            tenant_id=tenant_id,
            excluded_receipt_ids=excluded_receipt_ids,
            as_of_date=as_of_date,
        )

    returned_amount = quantize_money(returned_amount)
    received_amount = quantize_money(received_amount)
    raw_balance = quantize_money(net_amount - returned_amount - received_amount)
    balance_amount = max(raw_balance, Decimal("0.00"))

    return {
        "net_amount": net_amount,
        "returned_amount": returned_amount,
        "received_amount": received_amount,
        "balance_amount": balance_amount,
        # Raw (can be negative) so aging can reassign over-settlement credits.
        "raw_balance": raw_balance,
    }


def get_customer_opening_balance_financials(
    opening_balance,
    excluded_receipt_ids=None,
    as_of_date=None,
):
    excluded_receipt_ids = excluded_receipt_ids or []

    opening_amount = quantize_money(opening_balance.amount or Decimal("0.00"))
    receipts_qs = SalesBankReceiptLine.objects.filter(
            party_opening_balance=opening_balance,
            deleted_at__isnull=True,
            receipt__deleted_at__isnull=True,
    ).exclude(receipt_id__in=excluded_receipt_ids)
    if as_of_date is not None:
        receipts_qs = receipts_qs.filter(receipt__date__lte=as_of_date)

    received_amount = (
        receipts_qs.aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )
    received_amount = quantize_money(received_amount)
    raw_balance = quantize_money(opening_amount - received_amount)
    balance_amount = raw_balance

    return {
        "opening_amount": opening_amount,
        "received_amount": received_amount,
        "balance_amount": balance_amount,
        "raw_balance": raw_balance,
    }


def _invoice_dimension_share(sales_invoice, tenant_id):
    """
    Share of invoice gross belonging to a dimension (line tenant_id).
    Returns 1 when tenant_id is omitted. Returns 0 when the invoice has no
    lines in that dimension (unless the header tenant matches and there are
    no lines to split).
    """
    if not tenant_id:
        return Decimal("1")

    line_totals = (
        SalesInvoiceLine.objects.filter(
            invoice=sales_invoice,
            deleted_at__isnull=True,
        )
        .values("tenant_id")
        .annotate(total=Sum("total_amount"))
    )
    totals_by_tenant = {
        row["tenant_id"]: quantize_money(row["total"] or Decimal("0.00"))
        for row in line_totals
    }
    scoped = totals_by_tenant.get(tenant_id, Decimal("0.00"))
    all_lines_total = sum(totals_by_tenant.values(), Decimal("0.00"))

    if scoped > Decimal("0.00"):
        gross = quantize_money(sales_invoice.gross_amount or Decimal("0.00"))
        base = gross if gross > Decimal("0.00") else all_lines_total
        if base <= Decimal("0.00"):
            return Decimal("0.00")
        return scoped / base

    if sales_invoice.tenant_id == tenant_id and all_lines_total <= Decimal("0.00"):
        return Decimal("1")
    return Decimal("0.00")


def get_salesman_commission_financials(
    sales_invoice,
    salesman_id=None,
    excluded_payment_ids=None,
    tenant_id=None,
    from_date=None,
    to_date=None,
):
    """
    Commission earned / paid / pending for a salesman on one invoice.

    Optional tenant_id scopes amounts to one dimension (invoice line share),
    matching the salesman performance report allocation.

    Optional from_date/to_date scopes *earned* commission to that period.
    Pending is min(period earned, lifetime unpaid) so already-vouchered
    amounts are never re-vouchered.
    """
    excluded_payment_ids = excluded_payment_ids or []
    share = _invoice_dimension_share(sales_invoice, tenant_id)

    lifetime_sales = Decimal("0.00")
    if salesman_id is None or str(sales_invoice.salesman_id or "") == str(salesman_id):
        lifetime_sales = sales_invoice.salesman_commission_amount or Decimal("0.00")
    lifetime_sales = quantize_money(Decimal(lifetime_sales) * share)

    recovery_receipts = SalesBankReceiptLine.objects.filter(
        sales_invoice=sales_invoice,
        deleted_at__isnull=True,
        receipt__deleted_at__isnull=True,
    )
    if salesman_id is not None:
        recovery_receipts = recovery_receipts.filter(salesman_id=salesman_id)

    lifetime_recovery = quantize_money(
        Decimal(
            recovery_receipts.aggregate(total=Sum("recovery_commission_amount"))["total"]
            or Decimal("0.00")
        )
        * share
    )

    period_sales = lifetime_sales
    if from_date or to_date:
        invoice_date = sales_invoice.date
        in_range = True
        if from_date and invoice_date < from_date:
            in_range = False
        if to_date and invoice_date > to_date:
            in_range = False
        period_sales = lifetime_sales if in_range else Decimal("0.00")

    period_recovery_qs = recovery_receipts
    if from_date:
        period_recovery_qs = period_recovery_qs.filter(receipt__date__gte=from_date)
    if to_date:
        period_recovery_qs = period_recovery_qs.filter(receipt__date__lte=to_date)
    period_recovery = quantize_money(
        Decimal(
            period_recovery_qs.aggregate(total=Sum("recovery_commission_amount"))["total"]
            or Decimal("0.00")
        )
        * share
    )

    paid_tenant_id = tenant_id or sales_invoice.tenant_id
    line_queryset = SalesmanCommissionPaymentLine.objects.filter(
        sales_invoice=sales_invoice,
        deleted_at__isnull=True,
        payment__deleted_at__isnull=True,
        payment__tenant_id=paid_tenant_id,
    )
    if salesman_id is not None:
        line_queryset = line_queryset.filter(payment__salesman_id=salesman_id)
    if excluded_payment_ids:
        line_queryset = line_queryset.exclude(payment_id__in=excluded_payment_ids)

    line_paid = line_queryset.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    # Legacy header-only vouchers that never received lines.
    payments_with_lines = SalesmanCommissionPaymentLine.objects.filter(
        deleted_at__isnull=True,
    ).values_list("payment_id", flat=True)
    header_queryset = SalesmanCommissionPayment.objects.filter(
        tenant_id=paid_tenant_id,
        sales_invoice=sales_invoice,
        deleted_at__isnull=True,
    ).exclude(id__in=payments_with_lines)
    if salesman_id is not None:
        header_queryset = header_queryset.filter(salesman_id=salesman_id)
    if excluded_payment_ids:
        header_queryset = header_queryset.exclude(id__in=excluded_payment_ids)

    header_paid = (
        header_queryset.aggregate(total=Sum("payment"))["total"] or Decimal("0.00")
    )

    paid_amount = quantize_money(line_paid + header_paid)
    lifetime_commission = quantize_money(lifetime_sales + lifetime_recovery)
    lifetime_pending = max(
        quantize_money(lifetime_commission - paid_amount),
        Decimal("0.00"),
    )

    if from_date or to_date:
        sales_commission_amount = period_sales
        recovery_commission_amount = period_recovery
        commission_amount = quantize_money(period_sales + period_recovery)
        pending_amount = min(commission_amount, lifetime_pending)
    else:
        sales_commission_amount = lifetime_sales
        recovery_commission_amount = lifetime_recovery
        commission_amount = lifetime_commission
        pending_amount = lifetime_pending

    return {
        "commission_amount": commission_amount,
        "sales_commission_amount": sales_commission_amount,
        "recovery_commission_amount": recovery_commission_amount,
        "paid_amount": paid_amount,
        "pending_amount": pending_amount,
    }
