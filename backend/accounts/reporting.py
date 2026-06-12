from decimal import Decimal

from django.db.models import Sum
from django.db.models.functions import Coalesce

from accounts.models import Account, JournalLine


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
