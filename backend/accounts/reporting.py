from collections import defaultdict
from decimal import Decimal
from datetime import date

from django.db.models import Prefetch, Q, Sum
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


def _party_lines_queryset(tenant_ids, people_type, people_name):
    return JournalLine.objects.filter(
        tenant_id__in=tenant_ids,
        deleted_at__isnull=True,
        journal_entry__deleted_at__isnull=True,
        people_type=people_type,
        people_name=people_name,
    ).select_related("journal_entry", "account")


def _journal_net_before(queryset, before_date):
    """Control-account net (debit - credit) for lines dated before before_date."""
    totals = queryset.filter(journal_entry__date__lt=before_date).aggregate(
        debit=Coalesce(Sum("debit"), Decimal("0.00")),
        credit=Coalesce(Sum("credit"), Decimal("0.00")),
    )
    return _money(totals["debit"]) - _money(totals["credit"])


def _opening_balance_row(as_of_date, debit, credit, *, invert_for_party=False, show_tenant=False):
    """Synthetic brought-forward row so prior activity (including openings) stays visible."""
    journal_debit = _money(debit)
    journal_credit = _money(credit)
    if invert_for_party:
        display_debit = journal_credit
        display_credit = journal_debit
    else:
        display_debit = journal_debit
        display_credit = journal_credit

    row = {
        "id": "BF-OPENING",
        "date": as_of_date.isoformat() if hasattr(as_of_date, "isoformat") else str(as_of_date),
        "document_type": "Opening Balance",
        "people_type": "",
        "remarks": "Brought forward",
        "debit": str(display_debit),
        "credit": str(display_credit),
    }
    if show_tenant:
        row["tenant"] = ""
    return row


def build_ledger_report(tenant_ids, ledger_type, ledger_key, from_date, to_date, title=""):
    show_tenant = len(tenant_ids) > 1
    queryset = JournalLine.objects.filter(
        tenant_id__in=tenant_ids,
        deleted_at__isnull=True,
        journal_entry__deleted_at__isnull=True,
        journal_entry__date__gte=from_date,
        journal_entry__date__lte=to_date,
    ).select_related("journal_entry", "account")

    prior_queryset = None
    if ledger_type == "supplier":
        party_filter = {
            "people_type": "Supplier",
            "people_name": ledger_key["business_name"],
        }
        queryset = queryset.filter(**party_filter)
        prior_queryset = _party_lines_queryset(
            tenant_ids, "Supplier", ledger_key["business_name"]
        )
    elif ledger_type == "customer":
        party_filter = {
            "people_type": "Customer",
            "people_name": ledger_key["business_name"],
        }
        queryset = queryset.filter(**party_filter)
        prior_queryset = _party_lines_queryset(
            tenant_ids, "Customer", ledger_key["business_name"]
        )
    else:
        accounts = Account.objects.filter(
            tenant_id__in=tenant_ids,
            code=ledger_key["code"],
            deleted_at__isnull=True,
        ).values_list("id", flat=True)
        queryset = queryset.filter(account_id__in=list(accounts))
        prior_queryset = JournalLine.objects.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
            journal_entry__deleted_at__isnull=True,
            account_id__in=list(accounts),
        )

    rows = []
    journal_net = _journal_net_before(prior_queryset, from_date)
    if journal_net != 0:
        # GL view: positive net → debit brought forward, negative → credit.
        bf_debit = _money(max(Decimal("0.00"), journal_net))
        bf_credit = _money(max(Decimal("0.00"), -journal_net))
        rows.append(
            _opening_balance_row(
                from_date,
                bf_debit,
                bf_credit,
                invert_for_party=False,
                show_tenant=show_tenant,
            )
        )

    rows.extend([_serialize_line(line, show_tenant=show_tenant) for line in queryset])
    rows.sort(key=lambda row: (row["date"], row["document_type"], row["id"]))

    total_debit = sum(Decimal(row["debit"]) for row in rows)
    total_credit = sum(Decimal(row["credit"]) for row in rows)

    return {
        "title": title,
        "rows": rows,
        "total_debit": str(_money(total_debit)),
        "total_credit": str(_money(total_credit)),
    }


def build_party_ledger_report(
    tenant_ids,
    partner_type,
    partner_name,
    from_date=None,
    to_date=None,
):
    """
    Party statement for a customer or supplier.

    Includes Opening Balance journals and a brought-forward opening row when
    from_date excludes earlier activity (including party opening accounts).
    """
    people_type = "Customer" if partner_type == "customer" else "Supplier"
    if partner_type == "customer":
        summary_labels = [
            "Opening Balance",
            "Sales Invoice",
            "Sales Return",
            "Bank Receipt",
            "Journal Voucher",
        ]
    else:
        summary_labels = [
            "Opening Balance",
            "Purchase Invoice",
            "Purchase Return",
            "Bank Payment",
            "Journal Voucher",
        ]

    base_queryset = _party_lines_queryset(tenant_ids, people_type, partner_name)
    queryset = base_queryset
    if from_date:
        queryset = queryset.filter(journal_entry__date__gte=from_date)
    if to_date:
        queryset = queryset.filter(journal_entry__date__lte=to_date)

    rows = []
    document_totals = {label: Decimal("0.00") for label in summary_labels}
    total_debit = Decimal("0.00")
    total_credit = Decimal("0.00")

    def _accumulate_row(row):
        nonlocal total_debit, total_credit
        display_debit = _money(row["debit"])
        display_credit = _money(row["credit"])
        document_type = row["document_type"] or "Journal Voucher"
        if document_type in document_totals:
            document_totals[document_type] += display_debit + display_credit
        total_debit += display_debit
        total_credit += display_credit
        rows.append(row)

    if from_date:
        journal_net = _journal_net_before(base_queryset, from_date)
        if journal_net != 0:
            # Invert to party-statement side: customer receivable → credit,
            # supplier payable → debit (matching control-account journal invert).
            bf_journal_debit = _money(max(Decimal("0.00"), journal_net))
            bf_journal_credit = _money(max(Decimal("0.00"), -journal_net))
            _accumulate_row(
                _opening_balance_row(
                    from_date,
                    bf_journal_debit,
                    bf_journal_credit,
                    invert_for_party=True,
                )
            )

    for line in queryset.order_by(
        "journal_entry__date", "journal_entry__reference", "created_at"
    ):
        entry = line.journal_entry
        # Party ledger is shown from the party statement perspective,
        # so we invert the control-account journal direction.
        display_debit = _money(line.credit)
        display_credit = _money(line.debit)
        _accumulate_row(
            {
                "id": entry.reference,
                "document_type": entry.document_type or "Journal Voucher",
                "date": entry.date.isoformat(),
                "remarks": line.line_description or entry.description or "",
                "debit": str(display_debit),
                "credit": str(display_credit),
            }
        )

    if partner_type == "customer":
        grand_total = _money(
            document_totals.get("Opening Balance", Decimal("0.00"))
            + document_totals.get("Sales Invoice", Decimal("0.00"))
            - document_totals.get("Sales Return", Decimal("0.00"))
            - document_totals.get("Bank Receipt", Decimal("0.00"))
        )
    else:
        grand_total = _money(
            document_totals.get("Opening Balance", Decimal("0.00"))
            + document_totals.get("Purchase Invoice", Decimal("0.00"))
            - document_totals.get("Purchase Return", Decimal("0.00"))
            - document_totals.get("Bank Payment", Decimal("0.00"))
        )

    return {
        "rows": rows,
        "summary": {
            "document_totals": [
                {
                    "label": label,
                    "amount": str(_money(document_totals.get(label, Decimal("0.00")))),
                }
                for label in summary_labels
            ],
            "grand_total": str(grand_total),
            "total_debit": str(_money(total_debit)),
            "total_credit": str(_money(total_credit)),
        },
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


def _allocated_invoice_amount(invoice, amount, scoped_line_total):
    if not invoice.gross_amount:
        return Decimal("0.00")
    return _money((_money(amount) * _money(scoped_line_total)) / invoice.gross_amount)


def _sales_invoice_line_totals(invoice, tenant_ids):
    return {
        row["tenant_id"]: _money(row["total"])
        for row in invoice.lines.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
        )
        .values("tenant_id")
        .annotate(total=Coalesce(Sum("total_amount"), Decimal("0.00")))
    }


def _purchase_invoice_line_totals(invoice, tenant_ids):
    return {
        row["tenant_id"]: _money(row["total"])
        for row in invoice.lines.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
        )
        .values("tenant_id")
        .annotate(total=Coalesce(Sum("total_amount"), Decimal("0.00")))
    }


def _build_invoice_aging_report(
    *,
    tenant_ids,
    as_of_date,
    invoice_queryset,
    party_attr,
    financials_fn,
    line_totals_fn,
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

    for invoice in invoice_queryset.select_related(party_attr).prefetch_related("lines"):
        financials = financials_fn(invoice)
        line_totals = line_totals_fn(invoice, tenant_ids)
        if not line_totals:
            continue

        party = getattr(invoice, party_attr)
        basis_date = invoice.due_date or invoice.date
        days_overdue = max(0, (as_of_date - basis_date).days)
        bucket = _aging_bucket_for_days(days_overdue)
        for line_tenant_id, scoped_line_total in line_totals.items():
            net_amount = _allocated_invoice_amount(
                invoice,
                financials["net_amount"],
                scoped_line_total,
            )
            settled_amount = sum(
                _allocated_invoice_amount(invoice, financials.get(key, 0), scoped_line_total)
                for key in settled_keys
            )
            balance = max(_money(net_amount - settled_amount), Decimal("0.00"))
            if balance <= 0:
                continue

            party_id = str(party.id)
            party_key = (line_tenant_id, party_id)
            if party_key not in party_map:
                party_map[party_key] = {
                    "party_id": party_id,
                    "party_name": party.business_name or party.name or "",
                    "tenant_id": line_tenant_id,
                    "dimension_name": dimension_names.get(line_tenant_id, line_tenant_id),
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
                    "tenant_id": line_tenant_id,
                    "dimension_name": party_row["dimension_name"],
                    "invoice_date": invoice.date.isoformat(),
                    "due_date": invoice.due_date.isoformat() if invoice.due_date else "",
                    "aging_basis_date": basis_date.isoformat(),
                    "days_overdue": days_overdue,
                    "bucket": bucket,
                    "bucket_label": AGING_BUCKET_LABELS[bucket],
                    "net_amount": str(_money(net_amount)),
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

    queryset = (
        SalesInvoice.objects.filter(deleted_at__isnull=True)
        .filter(Q(tenant_id__in=tenant_ids) | Q(lines__tenant_id__in=tenant_ids))
        .distinct()
        .order_by("date", "invoice_number")
    )

    return _build_invoice_aging_report(
        tenant_ids=tenant_ids,
        as_of_date=as_of_date,
        invoice_queryset=queryset,
        party_attr="customer",
        financials_fn=get_sales_invoice_financials,
        line_totals_fn=_sales_invoice_line_totals,
        settled_keys=("returned_amount", "received_amount"),
        report_type="receivable",
    )


def build_payable_aging_report(tenant_ids, as_of_date):
    from purchase.models import PurchaseInvoice
    from purchase.services import get_purchase_invoice_financials

    queryset = (
        PurchaseInvoice.objects.filter(deleted_at__isnull=True)
        .filter(Q(tenant_id__in=tenant_ids) | Q(lines__tenant_id__in=tenant_ids))
        .distinct()
        .order_by("date", "invoice_number")
    )

    return _build_invoice_aging_report(
        tenant_ids=tenant_ids,
        as_of_date=as_of_date,
        invoice_queryset=queryset,
        party_attr="supplier",
        financials_fn=get_purchase_invoice_financials,
        line_totals_fn=_purchase_invoice_line_totals,
        settled_keys=("returned_amount", "paid_amount"),
        report_type="payable",
    )


def build_sales_report(
    tenant_ids,
    from_date,
    to_date,
    customer_id=None,
    product_id=None,
    salesman_id=None,
    salesman_ids=None,
    warehouse_id=None,
):
    from sales.models import SalesBankReceipt, SalesInvoice, SalesInvoiceLine, SalesReturn
    from sales.services import get_sales_invoice_financials

    dimension_names = _dimension_name_map(tenant_ids)
    line_queryset = SalesInvoiceLine.objects.filter(
        deleted_at__isnull=True,
        tenant_id__in=tenant_ids,
    ).select_related("product", "product__unit")

    invoices = (
        SalesInvoice.objects.filter(
            deleted_at__isnull=True,
            date__gte=from_date,
            date__lte=to_date,
        )
        .filter(Q(tenant_id__in=tenant_ids) | Q(lines__tenant_id__in=tenant_ids))
        .distinct()
        .select_related("customer", "warehouse", "salesman", "sales_order")
        .prefetch_related(Prefetch("lines", queryset=line_queryset))
        .order_by("date", "invoice_number")
    )

    if customer_id:
        invoices = invoices.filter(customer_id=customer_id)
    if salesman_id:
        invoices = invoices.filter(salesman_id=salesman_id)
    elif salesman_ids:
        invoices = invoices.filter(salesman_id__in=salesman_ids)
    if warehouse_id:
        invoices = invoices.filter(warehouse_id=warehouse_id)
    if product_id:
        invoices = invoices.filter(lines__product_id=product_id, lines__deleted_at__isnull=True).distinct()

    invoice_rows = []
    product_rows_map = {}
    customer_rows_map = {}
    salesman_rows_map = {}
    warehouse_rows_map = {}
    dimension_rows_map = {}
    monthly_rows_map = defaultdict(
        lambda: {
            "invoice_count": 0,
            "quantity": Decimal("0.00"),
            "gross_amount": Decimal("0.00"),
            "line_discount": Decimal("0.00"),
            "line_net_sales": Decimal("0.00"),
            "invoice_discount": Decimal("0.00"),
            "invoice_net_sales": Decimal("0.00"),
            "returned_amount": Decimal("0.00"),
            "received_amount": Decimal("0.00"),
            "balance_amount": Decimal("0.00"),
            "cost_total": Decimal("0.00"),
            "profit": Decimal("0.00"),
        }
    )

    summary = {
        "invoice_count": 0,
        "customer_count": set(),
        "product_count": set(),
        "quantity": Decimal("0.00"),
        "gross_amount": Decimal("0.00"),
        "line_discount": Decimal("0.00"),
        "line_net_sales": Decimal("0.00"),
        "invoice_discount": Decimal("0.00"),
        "invoice_net_sales": Decimal("0.00"),
        "returned_amount": Decimal("0.00"),
        "received_amount": Decimal("0.00"),
        "balance_amount": Decimal("0.00"),
        "cost_total": Decimal("0.00"),
        "profit": Decimal("0.00"),
        "salesman_commission": Decimal("0.00"),
    }

    def add_group_row(map_obj, key, base):
        if key not in map_obj:
            map_obj[key] = {
                **base,
                "invoice_count": 0,
                "quantity": Decimal("0.00"),
                "gross_amount": Decimal("0.00"),
                "line_discount": Decimal("0.00"),
                "line_net_sales": Decimal("0.00"),
                "invoice_net_sales": Decimal("0.00"),
                "returned_amount": Decimal("0.00"),
                "received_amount": Decimal("0.00"),
                "balance_amount": Decimal("0.00"),
                "cost_total": Decimal("0.00"),
                "profit": Decimal("0.00"),
            }
        return map_obj[key]

    def add_amounts(row, invoice, lines, financials):
        line_quantity = sum((line.quantity for line in lines), Decimal("0.00"))
        gross = sum((line.amount for line in lines), Decimal("0.00"))
        line_discount = sum((line.discount for line in lines), Decimal("0.00"))
        line_net = sum((line.total_amount for line in lines), Decimal("0.00"))
        cost_total = sum((line.cost_total for line in lines), Decimal("0.00"))
        profit = sum((line.profit for line in lines), Decimal("0.00"))
        invoice_net = (
            _money((invoice.net_amount * line_net) / invoice.gross_amount)
            if invoice.gross_amount
            else Decimal("0.00")
        )
        returned_amount = (
            _money((financials["returned_amount"] * line_net) / invoice.gross_amount)
            if invoice.gross_amount
            else Decimal("0.00")
        )
        received_amount = (
            _money((financials["received_amount"] * line_net) / invoice.gross_amount)
            if invoice.gross_amount
            else Decimal("0.00")
        )
        balance_amount = max(
            _money(invoice_net - returned_amount - received_amount),
            Decimal("0.00"),
        )

        row["invoice_count"] += 1
        row["quantity"] += line_quantity
        row["gross_amount"] += gross
        row["line_discount"] += line_discount
        row["line_net_sales"] += line_net
        row["invoice_net_sales"] += invoice_net
        row["returned_amount"] += returned_amount
        row["received_amount"] += received_amount
        row["balance_amount"] += balance_amount
        row["cost_total"] += cost_total
        row["profit"] += profit

        return {
            "quantity": line_quantity,
            "gross": gross,
            "line_discount": line_discount,
            "line_net": line_net,
            "cost_total": cost_total,
            "profit": profit,
            "invoice_net": invoice_net,
            "returned_amount": returned_amount,
            "received_amount": received_amount,
            "balance_amount": balance_amount,
        }

    invoices = list(invoices)
    invoice_ids = [invoice.id for invoice in invoices]
    return_rows = []
    receipt_rows = []

    for invoice in invoices:
        scoped_lines = [
            line
            for line in invoice.lines.all()
            if line.tenant_id in tenant_ids
            if not product_id or str(line.product_id) == str(product_id)
        ]
        if not scoped_lines:
            continue

        financials = get_sales_invoice_financials(invoice)
        line_totals = add_amounts(
            {
                "invoice_count": 0,
                "quantity": Decimal("0.00"),
                "gross_amount": Decimal("0.00"),
                "line_discount": Decimal("0.00"),
                "line_net_sales": Decimal("0.00"),
                "invoice_net_sales": Decimal("0.00"),
                "returned_amount": Decimal("0.00"),
                "received_amount": Decimal("0.00"),
                "balance_amount": Decimal("0.00"),
                "cost_total": Decimal("0.00"),
                "profit": Decimal("0.00"),
            },
            invoice,
            scoped_lines,
            financials,
        )

        summary["invoice_count"] += 1
        summary["customer_count"].add(str(invoice.customer_id))
        summary["quantity"] += line_totals["quantity"]
        summary["gross_amount"] += line_totals["gross"]
        summary["line_discount"] += line_totals["line_discount"]
        summary["line_net_sales"] += line_totals["line_net"]
        summary["invoice_discount"] += invoice.invoice_discount
        summary["invoice_net_sales"] += line_totals["invoice_net"]
        summary["returned_amount"] += line_totals["returned_amount"]
        summary["received_amount"] += line_totals["received_amount"]
        summary["balance_amount"] += line_totals["balance_amount"]
        summary["cost_total"] += line_totals["cost_total"]
        summary["profit"] += line_totals["profit"]
        summary["salesman_commission"] += invoice.salesman_commission_amount

        for line in scoped_lines:
            summary["product_count"].add(str(line.product_id))
            product = line.product
            row = add_group_row(
                product_rows_map,
                str(product.id),
                {
                    "product_id": str(product.id),
                    "sku": product.sku,
                    "product_name": product.name,
                    "unit": product.unit.name if product.unit else "",
                },
            )
            row["invoice_count"] += 1
            row["quantity"] += line.quantity
            row["gross_amount"] += line.amount
            row["line_discount"] += line.discount
            row["line_net_sales"] += line.total_amount
            row["invoice_net_sales"] += (
                _money((invoice.net_amount * line.total_amount) / invoice.gross_amount)
                if invoice.gross_amount
                else Decimal("0.00")
            )
            row["cost_total"] += line.cost_total
            row["profit"] += line.profit

        customer = invoice.customer
        customer_row = add_group_row(
            customer_rows_map,
            str(customer.id),
            {"customer_id": str(customer.id), "customer_name": customer.business_name or customer.name},
        )
        add_amounts(customer_row, invoice, scoped_lines, financials)

        salesman_key = str(invoice.salesman_id) if invoice.salesman_id else "none"
        salesman_row = add_group_row(
            salesman_rows_map,
            salesman_key,
            {
                "salesman_id": str(invoice.salesman_id) if invoice.salesman_id else "",
                "salesman_code": invoice.salesman.code if invoice.salesman else "",
                "salesman_name": invoice.salesman.name if invoice.salesman else "No salesman",
            },
        )
        add_amounts(salesman_row, invoice, scoped_lines, financials)

        warehouse = invoice.warehouse
        warehouse_row = add_group_row(
            warehouse_rows_map,
            str(warehouse.id),
            {"warehouse_id": str(warehouse.id), "warehouse_name": warehouse.name},
        )
        add_amounts(warehouse_row, invoice, scoped_lines, financials)

        for dimension_tenant_id in sorted({line.tenant_id for line in scoped_lines}):
            dimension_lines = [line for line in scoped_lines if line.tenant_id == dimension_tenant_id]
            dimension_row = add_group_row(
                dimension_rows_map,
                dimension_tenant_id,
                {
                    "tenant_id": dimension_tenant_id,
                    "dimension_name": dimension_names.get(dimension_tenant_id, dimension_tenant_id),
                },
            )
            add_amounts(dimension_row, invoice, dimension_lines, financials)

        month_key = invoice.date.replace(day=1).isoformat()
        month_row = monthly_rows_map[month_key]
        add_amounts(month_row, invoice, scoped_lines, financials)

        margin = (line_totals["profit"] / line_totals["line_net"] * Decimal("100")) if line_totals["line_net"] else Decimal("0.00")
        invoice_rows.append(
            {
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "order_reference": invoice.order_reference,
                "date": invoice.date.isoformat(),
                "due_date": invoice.due_date.isoformat() if invoice.due_date else "",
                "tenant_id": invoice.tenant_id,
                "dimension_name": dimension_names.get(invoice.tenant_id, invoice.tenant_id),
                "customer_id": str(invoice.customer_id),
                "customer_name": customer.business_name or customer.name,
                "warehouse_name": warehouse.name,
                "salesman_id": str(invoice.salesman_id) if invoice.salesman_id else "",
                "salesman_name": invoice.salesman.name if invoice.salesman else "",
                "line_count": len(scoped_lines),
                "quantity": str(_money(line_totals["quantity"])),
                "gross_amount": str(_money(line_totals["gross"])),
                "line_discount": str(_money(line_totals["line_discount"])),
                "line_net_sales": str(_money(line_totals["line_net"])),
                "invoice_discount": str(_money(invoice.invoice_discount)),
                "invoice_net_sales": str(_money(line_totals["invoice_net"])),
                "returned_amount": str(_money(line_totals["returned_amount"])),
                "received_amount": str(_money(line_totals["received_amount"])),
                "balance_amount": str(_money(line_totals["balance_amount"])),
                "cost_total": str(_money(line_totals["cost_total"])),
                "profit": str(_money(line_totals["profit"])),
                "margin_percent": str(_money(margin)),
                "salesman_commission": str(_money(invoice.salesman_commission_amount)),
            }
        )

    if invoice_ids:
        returns = (
            SalesReturn.objects.filter(
                tenant_id__in=tenant_ids,
                sales_invoice_id__in=invoice_ids,
                deleted_at__isnull=True,
            )
            .select_related("customer", "sales_invoice")
            .order_by("date", "return_number")
        )
        receipts = (
            SalesBankReceipt.objects.filter(
                tenant_id__in=tenant_ids,
                sales_invoice_id__in=invoice_ids,
                deleted_at__isnull=True,
            )
            .select_related("customer", "sales_invoice", "bank_account", "salesman")
            .order_by("date", "receipt_number")
        )
        for item in returns:
            return_rows.append(
                {
                    "return_id": str(item.id),
                    "return_number": item.return_number,
                    "date": item.date.isoformat(),
                    "invoice_number": item.sales_invoice.invoice_number,
                    "customer_name": item.customer.business_name or item.customer.name,
                    "amount": str(_money(item.gross_amount)),
                    "remarks": item.remarks,
                }
            )
        for item in receipts:
            receipt_rows.append(
                {
                    "receipt_id": str(item.id),
                    "receipt_number": item.receipt_number,
                    "date": item.date.isoformat(),
                    "invoice_number": item.sales_invoice.invoice_number,
                    "customer_name": item.customer.business_name or item.customer.name,
                    "tenant_id": item.tenant_id,
                    "dimension_name": dimension_names.get(item.tenant_id, item.tenant_id),
                    "salesman_name": item.salesman.name if item.salesman else "",
                    "bank_account": item.bank_account.name if item.bank_account else "",
                    "amount": str(_money(item.amount)),
                    "recovery_commission_rate": str(_money(item.recovery_commission_rate)),
                    "recovery_commission_amount": str(_money(item.recovery_commission_amount)),
                    "remarks": item.remarks,
                }
            )

    def serialize_group_rows(rows, sort_key="line_net_sales"):
        serialized = []
        for row in rows:
            margin = (row["profit"] / row["line_net_sales"] * Decimal("100")) if row["line_net_sales"] else Decimal("0.00")
            serialized.append(
                {
                    **{
                        key: value
                        for key, value in row.items()
                        if key
                        not in {
                            "quantity",
                            "gross_amount",
                            "line_discount",
                            "line_net_sales",
                            "invoice_net_sales",
                            "returned_amount",
                            "received_amount",
                            "balance_amount",
                            "cost_total",
                            "profit",
                        }
                    },
                    "quantity": str(_money(row["quantity"])),
                    "gross_amount": str(_money(row["gross_amount"])),
                    "line_discount": str(_money(row["line_discount"])),
                    "line_net_sales": str(_money(row["line_net_sales"])),
                    "invoice_net_sales": str(_money(row["invoice_net_sales"])),
                    "returned_amount": str(_money(row["returned_amount"])),
                    "received_amount": str(_money(row["received_amount"])),
                    "balance_amount": str(_money(row["balance_amount"])),
                    "cost_total": str(_money(row["cost_total"])),
                    "profit": str(_money(row["profit"])),
                    "margin_percent": str(_money(margin)),
                }
            )
        if not sort_key:
            return serialized
        return sorted(serialized, key=lambda item: Decimal(item.get(sort_key) or "0"), reverse=True)

    net_after_returns = summary["invoice_net_sales"] - summary["returned_amount"]
    margin = (summary["profit"] / summary["line_net_sales"] * Decimal("100")) if summary["line_net_sales"] else Decimal("0.00")

    return {
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "filters": {
            "customer_id": str(customer_id or ""),
            "product_id": str(product_id or ""),
            "salesman_id": str(salesman_id or ""),
            "warehouse_id": str(warehouse_id or ""),
        },
        "summary": {
            "invoice_count": summary["invoice_count"],
            "customer_count": len(summary["customer_count"]),
            "product_count": len(summary["product_count"]),
            "return_count": len(return_rows),
            "receipt_count": len(receipt_rows),
            "quantity": str(_money(summary["quantity"])),
            "gross_amount": str(_money(summary["gross_amount"])),
            "line_discount": str(_money(summary["line_discount"])),
            "line_net_sales": str(_money(summary["line_net_sales"])),
            "invoice_discount": str(_money(summary["invoice_discount"])),
            "invoice_net_sales": str(_money(summary["invoice_net_sales"])),
            "returned_amount": str(_money(summary["returned_amount"])),
            "net_after_returns": str(_money(net_after_returns)),
            "received_amount": str(_money(summary["received_amount"])),
            "balance_amount": str(_money(summary["balance_amount"])),
            "cost_total": str(_money(summary["cost_total"])),
            "profit": str(_money(summary["profit"])),
            "margin_percent": str(_money(margin)),
            "salesman_commission": str(_money(summary["salesman_commission"])),
        },
        "invoice_rows": invoice_rows,
        "product_rows": serialize_group_rows(product_rows_map.values()),
        "customer_rows": serialize_group_rows(customer_rows_map.values()),
        "salesman_rows": serialize_group_rows(salesman_rows_map.values()),
        "warehouse_rows": serialize_group_rows(warehouse_rows_map.values()),
        "dimension_rows": serialize_group_rows(dimension_rows_map.values()),
        "monthly_rows": serialize_group_rows(
            [
                {"month": month, **values}
                for month, values in sorted(monthly_rows_map.items())
            ],
            sort_key=None,
        ),
        "return_rows": return_rows,
        "receipt_rows": receipt_rows,
    }


def build_salesman_performance_report(
    tenant_ids,
    from_date,
    to_date,
    salesman_id=None,
    salesman_ids=None,
):
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
    elif salesman_ids:
        invoices = invoices.filter(salesman_id__in=salesman_ids)

    receipts = (
        SalesBankReceipt.objects.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
            date__gte=from_date,
            date__lte=to_date,
            sales_invoice__deleted_at__isnull=True,
        )
        .filter(Q(salesman_id__isnull=False) | Q(sales_invoice__salesman_id__isnull=False))
        .select_related("salesman", "sales_invoice", "sales_invoice__salesman", "customer")
        .order_by("date", "receipt_number")
    )
    if salesman_id:
        receipts = receipts.filter(
            Q(salesman_id=salesman_id)
            | Q(salesman_id__isnull=True, sales_invoice__salesman_id=salesman_id)
        )
    elif salesman_ids:
        receipts = receipts.filter(
            Q(salesman_id__in=salesman_ids)
            | Q(salesman_id__isnull=True, sales_invoice__salesman_id__in=salesman_ids)
        )

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
        salesman = receipt.salesman or invoice.salesman
        if not salesman:
            continue
        row = _ensure_salesman_row(salesman, receipt.tenant_id)
        receipt_amount = _money(receipt.amount)
        if receipt.salesman_id:
            recovery_rate = _money(receipt.recovery_commission_rate)
            recovery_commission = _money(receipt.recovery_commission_amount)
        else:
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
