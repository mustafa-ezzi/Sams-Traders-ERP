from decimal import Decimal

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
