from decimal import Decimal
from datetime import date

from django.db.models import Sum
from django.db.models.functions import Coalesce

from accounts.models import Account, Dimension, JournalLine


def _money(value):
    return Decimal(value or 0).quantize(Decimal("0.01"))


def _serialize_line(line, show_tenant=False):
    entry = line.journal_entry
    return {
        "id": entry.reference,
        "date": entry.date.isoformat() if hasattr(entry.date, "isoformat") else str(entry.date),
        "tenant": entry.tenant_id if show_tenant else "",
        "document_type": entry.document_type,
        "people_type": line.people_type or entry.people_type or "",
        "remarks": line.line_description or entry.description or "",
        "debit": str(_money(line.debit)),
        "credit": str(_money(line.credit)),
    }


def get_account_balance(account, as_of_date=None):
    """Current ledger balance for a single postable account."""
    queryset = JournalLine.objects.filter(
        tenant_id=account.tenant_id,
        account_id=account.id,
        deleted_at__isnull=True,
        journal_entry__deleted_at__isnull=True,
    )
    if as_of_date is not None:
        queryset = queryset.filter(journal_entry__date__lte=as_of_date)

    totals = queryset.aggregate(
        debit=Coalesce(Sum("debit"), Decimal("0.00")),
        credit=Coalesce(Sum("credit"), Decimal("0.00")),
    )
    return _balance_for_account(
        account,
        _money(totals["debit"]),
        _money(totals["credit"]),
    )


def build_ledger_report(tenant_ids, ledger_type, ledger_key, from_date, to_date, title=""):
    show_tenant = len(tenant_ids) > 1
    queryset = JournalLine.objects.filter(
        tenant_id__in=tenant_ids,
        deleted_at__isnull=True,
        journal_entry__deleted_at__isnull=True,
        journal_entry__date__gte=from_date,
        journal_entry__date__lte=to_date,
    ).select_related("journal_entry", "account")

    if ledger_type == "supplier":
        queryset = queryset.filter(
            people_type="Supplier",
            people_name=ledger_key["business_name"],
        )
    elif ledger_type == "customer":
        queryset = queryset.filter(
            people_type="Customer",
            people_name=ledger_key["business_name"],
        )
    else:
        accounts = Account.objects.filter(
            tenant_id__in=tenant_ids,
            code=ledger_key["code"],
            deleted_at__isnull=True,
        ).values_list("id", flat=True)
        queryset = queryset.filter(account_id__in=list(accounts))

    rows = [_serialize_line(line, show_tenant=show_tenant) for line in queryset]
    rows.sort(key=lambda row: (row["date"], row["document_type"], row["id"]))

    total_debit = sum(Decimal(row["debit"]) for row in rows)
    total_credit = sum(Decimal(row["credit"]) for row in rows)

    return {
        "title": title,
        "rows": rows,
        "total_debit": str(_money(total_debit)),
        "total_credit": str(_money(total_credit)),
    }


def _balance_for_account(account, debit_total, credit_total):
    if account.account_nature == Account.AccountNature.DEBIT:
        return _money(debit_total - credit_total)
    return _money(credit_total - debit_total)


def _profit_and_loss_contribution(account, debit_total, credit_total):
    balance = _balance_for_account(account, debit_total, credit_total)
    if account.account_nature == Account.AccountNature.CREDIT:
        return balance
    return _money(balance * Decimal("-1"))


def _build_balance_section(accounts, balance_map, group):
    scoped_accounts = [account for account in accounts if account.account_group == group]
    node_map = {}
    roots = []

    for account in scoped_accounts:
        node_map[account.id] = {
            "id": str(account.id),
            "code": account.code,
            "name": account.name,
            "level": account.level,
            "is_postable": account.is_postable,
            "is_synthetic": False,
            "direct_balance": balance_map.get(account.id, Decimal("0.00")),
            "children": [],
        }

    for account in scoped_accounts:
        node = node_map[account.id]
        if account.parent_id and account.parent_id in node_map:
            node_map[account.parent_id]["children"].append(node)
        else:
            roots.append(node)

    roots.sort(key=lambda item: item["code"])

    def finalize(node):
        node["children"].sort(key=lambda item: item["code"])
        children_total = sum((finalize(child) for child in node["children"]), Decimal("0.00"))
        total_balance = _money(node["direct_balance"] + children_total)
        node["balance"] = total_balance
        node["display_balance"] = str(total_balance)
        return total_balance

    for root in roots:
        finalize(root)

    flat_rows = []

    def flatten(node, depth=0):
        flat_rows.append(
            {
                "id": node["id"],
                "code": node["code"],
                "name": node["name"],
                "level": node["level"],
                "depth": depth,
                "is_postable": node["is_postable"],
                "is_synthetic": node["is_synthetic"],
                "balance": node["display_balance"],
            }
        )
        for child in node["children"]:
            flatten(child, depth + 1)

    for root in roots:
        flatten(root)

    section_total = _money(
        sum(Decimal(row["balance"]) for row in flat_rows if row["depth"] == 0)
    )

    return {
        "rows": flat_rows,
        "total": str(section_total),
    }


def build_profit_and_loss_report(tenant_ids, from_date, to_date):
    """Profit & Loss (income statement) for a date range.

    Net Profit = Revenue - COGS - Expenses - Tax - Purchases, which keeps the
    figure consistent with the Balance Sheet's "unclosed profit/loss" line.
    """
    pl_groups = [
        Account.AccountGroup.REVENUE,
        Account.AccountGroup.COGS,
        Account.AccountGroup.EXPENSE,
        Account.AccountGroup.TAX,
        Account.AccountGroup.PURCHASE,
    ]

    accounts = list(
        Account.objects.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
            is_active=True,
            account_group__in=pl_groups,
        )
        .select_related("parent")
        .order_by("code")
    )

    account_ids = [account.id for account in accounts]
    line_totals = {
        row["account_id"]: {
            "debit": _money(row["debit"]),
            "credit": _money(row["credit"]),
        }
        for row in JournalLine.objects.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
            journal_entry__deleted_at__isnull=True,
            journal_entry__date__gte=from_date,
            journal_entry__date__lte=to_date,
            account_id__in=account_ids,
        )
        .values("account_id")
        .annotate(
            debit=Coalesce(Sum("debit"), Decimal("0.00")),
            credit=Coalesce(Sum("credit"), Decimal("0.00")),
        )
    }

    balance_map = {}
    for account in accounts:
        totals = line_totals.get(
            account.id,
            {"debit": Decimal("0.00"), "credit": Decimal("0.00")},
        )
        balance_map[account.id] = _balance_for_account(
            account,
            totals["debit"],
            totals["credit"],
        )

    revenue = _build_balance_section(accounts, balance_map, Account.AccountGroup.REVENUE)
    cogs = _build_balance_section(accounts, balance_map, Account.AccountGroup.COGS)
    expense = _build_balance_section(accounts, balance_map, Account.AccountGroup.EXPENSE)
    tax = _build_balance_section(accounts, balance_map, Account.AccountGroup.TAX)
    purchase = _build_balance_section(accounts, balance_map, Account.AccountGroup.PURCHASE)

    total_revenue = _money(revenue["total"])
    total_cogs = _money(cogs["total"])
    total_expense = _money(expense["total"])
    total_tax = _money(tax["total"])
    total_purchase = _money(purchase["total"])
    gross_profit = _money(total_revenue - total_cogs)
    total_operating = _money(total_expense + total_tax + total_purchase)
    net_profit = _money(gross_profit - total_operating)

    return {
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "revenue": revenue,
        "cogs": cogs,
        "expense": expense,
        "tax": tax,
        "purchase": purchase,
        "summary": {
            "total_revenue": str(total_revenue),
            "total_cogs": str(total_cogs),
            "gross_profit": str(gross_profit),
            "total_expense": str(total_expense),
            "total_tax": str(total_tax),
            "total_purchase": str(total_purchase),
            "total_operating": str(total_operating),
            "net_profit": str(net_profit),
            "is_profit": net_profit >= Decimal("0.00"),
        },
    }


def build_balance_sheet_report(tenant_ids, as_of_date):
    accounts = list(
        Account.objects.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
            is_active=True,
        )
        .select_related("parent")
        .order_by("code")
    )

    account_ids = [account.id for account in accounts]
    line_totals = {
        row["account_id"]: {
            "debit": _money(row["debit"]),
            "credit": _money(row["credit"]),
        }
        for row in JournalLine.objects.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
            journal_entry__deleted_at__isnull=True,
            journal_entry__date__lte=as_of_date,
            account_id__in=account_ids,
        )
        .values("account_id")
        .annotate(
            debit=Coalesce(Sum("debit"), Decimal("0.00")),
            credit=Coalesce(Sum("credit"), Decimal("0.00")),
        )
    }

    balance_map = {}
    income_total = Decimal("0.00")
    expense_total = Decimal("0.00")

    for account in accounts:
        totals = line_totals.get(
            account.id,
            {"debit": Decimal("0.00"), "credit": Decimal("0.00")},
        )
        balance_map[account.id] = _balance_for_account(
            account,
            totals["debit"],
            totals["credit"],
        )

        if account.account_group in {
            Account.AccountGroup.REVENUE,
            Account.AccountGroup.COGS,
            Account.AccountGroup.EXPENSE,
            Account.AccountGroup.TAX,
            Account.AccountGroup.PURCHASE,
        }:
            contribution = _profit_and_loss_contribution(
                account,
                totals["debit"],
                totals["credit"],
            )
            if contribution >= 0:
                income_total += contribution
            else:
                expense_total += abs(contribution)

    unclosed_profit_loss = _money(income_total - expense_total)

    assets = _build_balance_section(accounts, balance_map, Account.AccountGroup.ASSET)
    liabilities = _build_balance_section(accounts, balance_map, Account.AccountGroup.LIABILITY)
    equity = _build_balance_section(accounts, balance_map, Account.AccountGroup.EQUITY)

    total_assets = _money(assets["total"])
    total_liabilities = _money(liabilities["total"])
    total_equity = _money(equity["total"])
    # Current-period (unclosed) profit/loss belongs to the owners until it is
    # closed into Retained Earnings, so it must sit on the equity side for the
    # accounting equation (Assets = Liabilities + Equity + Net Income) to hold.
    total_liabilities_and_equity = _money(
        total_liabilities + total_equity + unclosed_profit_loss
    )
    difference = _money(total_assets - total_liabilities_and_equity)

    return {
        "as_of_date": as_of_date.isoformat(),
        "assets": assets,
        "liabilities": liabilities,
        "equity": equity,
        "summary": {
            "total_assets": str(total_assets),
            "total_liabilities": str(total_liabilities),
            "total_equity": str(total_equity),
            "total_liabilities_and_equity": str(total_liabilities_and_equity),
            "unclosed_profit_loss": str(unclosed_profit_loss),
            "difference": str(difference),
            "is_balanced": difference == Decimal("0.00"),
        },
    }


AGING_BUCKET_KEYS = (
    "current",
    "days_1_30",
    "days_31_60",
    "days_61_90",
    "days_91_120",
    "over_120",
)

AGING_BUCKET_LABELS = {
    "current": "Current",
    "days_1_30": "1–30 Days",
    "days_31_60": "31–60 Days",
    "days_61_90": "61–90 Days",
    "days_91_120": "91–120 Days",
    "over_120": "Over 120 Days",
}


def _empty_aging_buckets():
    return {key: Decimal("0.00") for key in AGING_BUCKET_KEYS}


def _aging_bucket_for_days(days_overdue):
    if days_overdue <= 0:
        return "current"
    if days_overdue <= 30:
        return "days_1_30"
    if days_overdue <= 60:
        return "days_31_60"
    if days_overdue <= 90:
        return "days_61_90"
    if days_overdue <= 120:
        return "days_91_120"
    return "over_120"


def _dimension_name_map(tenant_ids):
    return {
        row["code"]: row["name"]
        for row in Dimension.objects.filter(code__in=tenant_ids).values("code", "name")
    }


def _build_invoice_aging_report(
    *,
    tenant_ids,
    as_of_date,
    invoice_queryset,
    party_attr,
    financials_fn,
    settled_keys,
    report_type,
):
    """
    Build AR/AP aging from unpaid invoice balances.
    Aging is based on due_date when set, otherwise invoice date.
    """
    dimension_names = _dimension_name_map(tenant_ids)
    bucket_totals = _empty_aging_buckets()
    total_outstanding = Decimal("0.00")
    detail_rows = []
    party_map = {}

    for invoice in invoice_queryset.select_related(party_attr):
        financials = financials_fn(invoice)
        balance = _money(financials["balance_amount"])
        if balance <= 0:
            continue

        party = getattr(invoice, party_attr)
        basis_date = invoice.due_date or invoice.date
        days_overdue = max(0, (as_of_date - basis_date).days)
        bucket = _aging_bucket_for_days(days_overdue)
        settled_amount = sum(_money(financials.get(key, 0)) for key in settled_keys)

        party_id = str(party.id)
        party_key = (invoice.tenant_id, party_id)
        if party_key not in party_map:
            party_map[party_key] = {
                "party_id": party_id,
                "party_name": party.business_name or party.name or "",
                "tenant_id": invoice.tenant_id,
                "dimension_name": dimension_names.get(invoice.tenant_id, invoice.tenant_id),
                "buckets": _empty_aging_buckets(),
                "total": Decimal("0.00"),
                "invoice_count": 0,
            }

        party_row = party_map[party_key]
        party_row["buckets"][bucket] = _money(party_row["buckets"][bucket] + balance)
        party_row["total"] = _money(party_row["total"] + balance)
        party_row["invoice_count"] += 1

        bucket_totals[bucket] = _money(bucket_totals[bucket] + balance)
        total_outstanding = _money(total_outstanding + balance)

        detail_rows.append(
            {
                "invoice_id": str(invoice.id),
                "document_number": invoice.invoice_number,
                "party_id": party_id,
                "party_name": party_row["party_name"],
                "tenant_id": invoice.tenant_id,
                "dimension_name": party_row["dimension_name"],
                "invoice_date": invoice.date.isoformat(),
                "due_date": invoice.due_date.isoformat() if invoice.due_date else "",
                "aging_basis_date": basis_date.isoformat(),
                "days_overdue": days_overdue,
                "bucket": bucket,
                "bucket_label": AGING_BUCKET_LABELS[bucket],
                "net_amount": str(_money(financials["net_amount"])),
                "settled_amount": str(_money(settled_amount)),
                "balance_amount": str(balance),
            }
        )

    party_rows = sorted(
        party_map.values(),
        key=lambda row: (row["total"], row["party_name"]),
        reverse=True,
    )
    for row in party_rows:
        row["buckets"] = {key: str(row["buckets"][key]) for key in AGING_BUCKET_KEYS}
        row["total"] = str(row["total"])

    detail_rows.sort(
        key=lambda row: (row["days_overdue"], row["party_name"], row["document_number"]),
        reverse=True,
    )

    return {
        "report_type": report_type,
        "as_of_date": as_of_date.isoformat(),
        "buckets": [
            {"key": key, "label": AGING_BUCKET_LABELS[key]} for key in AGING_BUCKET_KEYS
        ],
        "summary": {
            "total_outstanding": str(total_outstanding),
            "bucket_totals": {key: str(bucket_totals[key]) for key in AGING_BUCKET_KEYS},
            "party_count": len(party_rows),
            "invoice_count": len(detail_rows),
        },
        "party_rows": party_rows,
        "detail_rows": detail_rows,
    }


def build_receivable_aging_report(tenant_ids, as_of_date):
    from sales.models import SalesInvoice
    from sales.services import get_sales_invoice_financials

    queryset = SalesInvoice.objects.filter(
        tenant_id__in=tenant_ids,
        deleted_at__isnull=True,
    ).order_by("date", "invoice_number")

    return _build_invoice_aging_report(
        tenant_ids=tenant_ids,
        as_of_date=as_of_date,
        invoice_queryset=queryset,
        party_attr="customer",
        financials_fn=get_sales_invoice_financials,
        settled_keys=("returned_amount", "received_amount"),
        report_type="receivable",
    )


def build_payable_aging_report(tenant_ids, as_of_date):
    from purchase.models import PurchaseInvoice
    from purchase.services import get_purchase_invoice_financials

    queryset = PurchaseInvoice.objects.filter(
        tenant_id__in=tenant_ids,
        deleted_at__isnull=True,
    ).order_by("date", "invoice_number")

    return _build_invoice_aging_report(
        tenant_ids=tenant_ids,
        as_of_date=as_of_date,
        invoice_queryset=queryset,
        party_attr="supplier",
        financials_fn=get_purchase_invoice_financials,
        settled_keys=("returned_amount", "paid_amount"),
        report_type="payable",
    )


def build_salesman_performance_report(tenant_ids, from_date, to_date, salesman_id=None):
    """
    Salesman performance for a date range:
    - Sales commission from invoices dated in the period (with a salesman assigned).
    - Recovery commission from bank receipts dated in the period on invoiced sales.
    """
    from sales.models import SalesBankReceipt, SalesInvoice
    from sales.services import get_sales_invoice_financials

    dimension_names = _dimension_name_map(tenant_ids)

    invoices = (
        SalesInvoice.objects.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
            salesman_id__isnull=False,
            date__gte=from_date,
            date__lte=to_date,
        )
        .select_related("salesman", "customer")
        .order_by("date", "invoice_number")
    )
    if salesman_id:
        invoices = invoices.filter(salesman_id=salesman_id)

    receipts = (
        SalesBankReceipt.objects.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
            date__gte=from_date,
            date__lte=to_date,
            sales_invoice__deleted_at__isnull=True,
            sales_invoice__salesman_id__isnull=False,
        )
        .select_related("sales_invoice", "sales_invoice__salesman", "customer")
        .order_by("date", "receipt_number")
    )
    if salesman_id:
        receipts = receipts.filter(sales_invoice__salesman_id=salesman_id)

    def _ensure_salesman_row(salesman, tenant_id):
        key = (tenant_id, str(salesman.id))
        if key not in salesman_map:
            salesman_map[key] = {
                "salesman_id": str(salesman.id),
                "code": salesman.code,
                "name": salesman.name,
                "tenant_id": tenant_id,
                "dimension_name": dimension_names.get(tenant_id, tenant_id),
                "commission_on_sales": str(_money(salesman.commission_on_sales)),
                "commission_on_recovery": str(_money(salesman.commission_on_recovery)),
                "invoice_count": 0,
                "receipt_count": 0,
                "net_sales": Decimal("0.00"),
                "sales_commission": Decimal("0.00"),
                "collected_amount": Decimal("0.00"),
                "recovery_commission": Decimal("0.00"),
                "total_commission": Decimal("0.00"),
            }
        return salesman_map[key]

    salesman_map = {}
    invoice_detail_rows = []
    receipt_detail_rows = []

    total_net_sales = Decimal("0.00")
    total_sales_commission = Decimal("0.00")
    total_collected = Decimal("0.00")
    total_recovery_commission = Decimal("0.00")

    for invoice in invoices:
        salesman = invoice.salesman
        row = _ensure_salesman_row(salesman, invoice.tenant_id)
        financials = get_sales_invoice_financials(invoice)
        net_amount = _money(invoice.net_amount)
        sales_commission = _money(invoice.salesman_commission_amount)

        row["invoice_count"] += 1
        row["net_sales"] = _money(row["net_sales"] + net_amount)
        row["sales_commission"] = _money(row["sales_commission"] + sales_commission)

        total_net_sales = _money(total_net_sales + net_amount)
        total_sales_commission = _money(total_sales_commission + sales_commission)

        invoice_detail_rows.append(
            {
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "invoice_date": invoice.date.isoformat(),
                "due_date": invoice.due_date.isoformat() if invoice.due_date else "",
                "salesman_id": str(salesman.id),
                "salesman_code": salesman.code,
                "salesman_name": salesman.name,
                "customer_name": invoice.customer.business_name or invoice.customer.name or "",
                "tenant_id": invoice.tenant_id,
                "dimension_name": row["dimension_name"],
                "net_amount": str(net_amount),
                "sales_commission_rate": str(_money(invoice.salesman_commission_rate)),
                "sales_commission_amount": str(sales_commission),
                "received_amount": str(_money(financials["received_amount"])),
                "balance_amount": str(_money(financials["balance_amount"])),
            }
        )

    for receipt in receipts:
        invoice = receipt.sales_invoice
        salesman = invoice.salesman
        row = _ensure_salesman_row(salesman, receipt.tenant_id)
        receipt_amount = _money(receipt.amount)
        recovery_rate = _money(salesman.commission_on_recovery)
        recovery_commission = (
            _money((receipt_amount * recovery_rate) / Decimal("100"))
            if recovery_rate > 0
            else Decimal("0.00")
        )

        row["receipt_count"] += 1
        row["collected_amount"] = _money(row["collected_amount"] + receipt_amount)
        row["recovery_commission"] = _money(row["recovery_commission"] + recovery_commission)

        total_collected = _money(total_collected + receipt_amount)
        total_recovery_commission = _money(total_recovery_commission + recovery_commission)

        receipt_detail_rows.append(
            {
                "receipt_id": str(receipt.id),
                "receipt_number": receipt.receipt_number,
                "receipt_date": receipt.date.isoformat(),
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "invoice_date": invoice.date.isoformat(),
                "salesman_id": str(salesman.id),
                "salesman_code": salesman.code,
                "salesman_name": salesman.name,
                "customer_name": receipt.customer.business_name or receipt.customer.name or "",
                "tenant_id": receipt.tenant_id,
                "dimension_name": row["dimension_name"],
                "receipt_amount": str(receipt_amount),
                "recovery_commission_rate": str(recovery_rate),
                "recovery_commission_amount": str(recovery_commission),
            }
        )

    salesman_rows = []
    for row in salesman_map.values():
        row["total_commission"] = _money(row["sales_commission"] + row["recovery_commission"])
        salesman_rows.append(
            {
                **row,
                "net_sales": str(row["net_sales"]),
                "sales_commission": str(row["sales_commission"]),
                "collected_amount": str(row["collected_amount"]),
                "recovery_commission": str(row["recovery_commission"]),
                "total_commission": str(row["total_commission"]),
            }
        )

    salesman_rows.sort(
        key=lambda row: (Decimal(row["total_commission"]), row["name"]),
        reverse=True,
    )

    total_commission = _money(total_sales_commission + total_recovery_commission)

    return {
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "salesman_id": str(salesman_id) if salesman_id else "",
        "summary": {
            "salesman_count": len(salesman_rows),
            "invoice_count": len(invoice_detail_rows),
            "receipt_count": len(receipt_detail_rows),
            "total_net_sales": str(total_net_sales),
            "total_sales_commission": str(total_sales_commission),
            "total_collected": str(total_collected),
            "total_recovery_commission": str(total_recovery_commission),
            "total_commission": str(total_commission),
        },
        "salesman_rows": salesman_rows,
        "invoice_rows": invoice_detail_rows,
        "receipt_rows": receipt_detail_rows,
    }
