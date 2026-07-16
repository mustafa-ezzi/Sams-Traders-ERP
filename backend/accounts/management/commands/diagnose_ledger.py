from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Prefetch, Sum
from django.db.models.functions import Coalesce

from accounts.models import Account, JournalEntry, JournalLine
from accounts.reporting import _money, _raw_journal_totals


class Command(BaseCommand):
    help = (
        "Find unbalanced journal vouchers, cross-dimension imbalances, "
        "and balances on inactive COA accounts."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--tenant",
            default="",
            help="Optional dimension code (e.g. AM_TRADERS). Defaults to all tenants.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=50,
            help="Max number of cross-dimension mismatches to print.",
        )

    def handle(self, *args, **options):
        tenant_code = (options.get("tenant") or "").strip()
        print_limit = options.get("limit") or 50
        tenant_ids = [tenant_code] if tenant_code else None

        self.stdout.write("Checking journal voucher balance (whole voucher)…")
        entry_qs = JournalEntry.objects.filter(deleted_at__isnull=True)
        if tenant_ids:
            # Include every voucher that touches this dimension's accounts,
            # even if the voucher header tenant_id is different.
            entry_ids = (
                JournalLine.objects.filter(
                    deleted_at__isnull=True,
                    journal_entry__deleted_at__isnull=True,
                    account__tenant_id__in=tenant_ids,
                    account__deleted_at__isnull=True,
                )
                .values_list("journal_entry_id", flat=True)
                .distinct()
            )
            entry_qs = JournalEntry.objects.filter(
                id__in=entry_ids,
                deleted_at__isnull=True,
            )

        unbalanced = []
        for entry in entry_qs.order_by("date", "reference"):
            totals = entry.lines.filter(deleted_at__isnull=True).aggregate(
                debit=Coalesce(Sum("debit"), Decimal("0.00")),
                credit=Coalesce(Sum("credit"), Decimal("0.00")),
            )
            debit = _money(totals["debit"])
            credit = _money(totals["credit"])
            if debit != credit:
                unbalanced.append((entry, debit, credit))

        if unbalanced:
            self.stdout.write(self.style.ERROR(f"Found {len(unbalanced)} unbalanced voucher(s):"))
            for entry, debit, credit in unbalanced[:print_limit]:
                self.stdout.write(
                    f"  {entry.date} {entry.reference} ({entry.document_type}) "
                    f"debit={debit} credit={credit} diff={debit - credit}"
                )
        else:
            self.stdout.write(self.style.SUCCESS("All journal vouchers are balanced overall."))

        if tenant_ids:
            integrity = _raw_journal_totals(tenant_ids)
            self.stdout.write(
                f"Raw journal totals for {tenant_code} accounts only: "
                f"debit={integrity['total_debit']} credit={integrity['total_credit']} "
                f"diff={integrity['difference']}"
            )

            if integrity["difference"] != Decimal("0.00"):
                self.stdout.write("")
                self.stdout.write(
                    self.style.WARNING(
                        "Whole vouchers balance, but this dimension's account side does not. "
                        "That usually means CROSS-DIMENSION postings "
                        "(one side of a voucher is on another dimension's COA)."
                    )
                )
                self._report_cross_dimension_mismatches(tenant_code, print_limit)

        self.stdout.write("")
        self.stdout.write("Checking balances on inactive COA accounts…")
        inactive_qs = Account.objects.filter(is_active=False, deleted_at__isnull=True)
        if tenant_ids:
            inactive_qs = inactive_qs.filter(tenant_id__in=tenant_ids)

        inactive_with_activity = []
        for account in inactive_qs.order_by("tenant_id", "code"):
            totals = JournalLine.objects.filter(
                account_id=account.id,
                deleted_at__isnull=True,
                journal_entry__deleted_at__isnull=True,
            ).aggregate(
                debit=Coalesce(Sum("debit"), Decimal("0.00")),
                credit=Coalesce(Sum("credit"), Decimal("0.00")),
            )
            if totals["debit"] or totals["credit"]:
                inactive_with_activity.append((account, totals["debit"], totals["credit"]))

        if inactive_with_activity:
            self.stdout.write(
                self.style.WARNING(
                    f"Found {len(inactive_with_activity)} inactive account(s) with journal activity:"
                )
            )
            for account, debit, credit in inactive_with_activity[:print_limit]:
                self.stdout.write(
                    f"  [{account.tenant_id}] {account.code} {account.name} "
                    f"debit={debit} credit={credit}"
                )
        else:
            self.stdout.write(self.style.SUCCESS("No inactive accounts with journal activity."))

    def _report_cross_dimension_mismatches(self, tenant_code, print_limit):
        lines = (
            JournalLine.objects.filter(
                deleted_at__isnull=True,
                journal_entry__deleted_at__isnull=True,
                account__deleted_at__isnull=True,
            )
            .filter(
                # Any voucher that touches this tenant's accounts
                journal_entry_id__in=JournalLine.objects.filter(
                    deleted_at__isnull=True,
                    account__tenant_id=tenant_code,
                    account__deleted_at__isnull=True,
                ).values("journal_entry_id")
            )
            .select_related("account", "journal_entry")
        )

        by_entry = {}
        for line in lines.iterator(chunk_size=2000):
            entry = line.journal_entry
            bucket = by_entry.setdefault(
                entry.id,
                {
                    "entry": entry,
                    "local_debit": Decimal("0.00"),
                    "local_credit": Decimal("0.00"),
                    "foreign_debit": Decimal("0.00"),
                    "foreign_credit": Decimal("0.00"),
                    "foreign_accounts": set(),
                },
            )
            amount_debit = _money(line.debit)
            amount_credit = _money(line.credit)
            if line.account.tenant_id == tenant_code:
                bucket["local_debit"] += amount_debit
                bucket["local_credit"] += amount_credit
            else:
                bucket["foreign_debit"] += amount_debit
                bucket["foreign_credit"] += amount_credit
                bucket["foreign_accounts"].add(
                    f"{line.account.tenant_id}:{line.account.code} {line.account.name}"
                )

        mismatches = []
        for bucket in by_entry.values():
            local_diff = _money(bucket["local_debit"] - bucket["local_credit"])
            if local_diff == Decimal("0.00"):
                continue
            if bucket["foreign_debit"] == Decimal("0.00") and bucket["foreign_credit"] == Decimal("0.00"):
                # Local-only imbalance (should be rare if whole vouchers balance)
                continue
            mismatches.append(
                (
                    abs(local_diff),
                    local_diff,
                    bucket,
                )
            )

        mismatches.sort(key=lambda item: item[0], reverse=True)
        total_gap = _money(sum((item[1] for item in mismatches), Decimal("0.00")))

        self.stdout.write(
            self.style.WARNING(
                f"Found {len(mismatches)} voucher(s) whose {tenant_code} side is out of balance "
                f"(sum of local diffs={total_gap})."
            )
        )
        for abs_diff, local_diff, bucket in mismatches[:print_limit]:
            entry = bucket["entry"]
            foreign = ", ".join(sorted(bucket["foreign_accounts"])) or "—"
            self.stdout.write(
                f"  {entry.date} {entry.reference} ({entry.document_type} / {entry.source_type}) "
                f"local debit={bucket['local_debit']} credit={bucket['local_credit']} "
                f"local_diff={local_diff} | other-dimension accounts: {foreign}"
            )

        if len(mismatches) > print_limit:
            self.stdout.write(f"  … and {len(mismatches) - print_limit} more")
