from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum
from django.db.models.functions import Coalesce

from accounts.models import Account, JournalEntry, JournalLine
from accounts.reporting import _raw_journal_totals


class Command(BaseCommand):
    help = "Find unbalanced journal vouchers and balances on inactive COA accounts."

    def add_arguments(self, parser):
        parser.add_argument(
            "--tenant",
            default="",
            help="Optional dimension code (e.g. AM_TRADERS). Defaults to all tenants.",
        )

    def handle(self, *args, **options):
        tenant_code = (options.get("tenant") or "").strip()
        tenant_ids = None
        if tenant_code:
            tenant_ids = [tenant_code]

        self.stdout.write("Checking journal voucher balance…")
        entry_qs = JournalEntry.objects.filter(deleted_at__isnull=True)
        if tenant_ids:
            entry_qs = entry_qs.filter(tenant_id__in=tenant_ids)

        unbalanced = []
        for entry in entry_qs.order_by("date", "reference"):
            totals = entry.lines.filter(deleted_at__isnull=True).aggregate(
                debit=Coalesce(Sum("debit"), Decimal("0.00")),
                credit=Coalesce(Sum("credit"), Decimal("0.00")),
            )
            debit = totals["debit"]
            credit = totals["credit"]
            if debit.quantize(Decimal("0.01")) != credit.quantize(Decimal("0.01")):
                unbalanced.append((entry, debit, credit))

        if unbalanced:
            self.stdout.write(self.style.ERROR(f"Found {len(unbalanced)} unbalanced voucher(s):"))
            for entry, debit, credit in unbalanced[:50]:
                self.stdout.write(
                    f"  {entry.date} {entry.reference} ({entry.document_type}) "
                    f"debit={debit} credit={credit} diff={debit - credit}"
                )
        else:
            self.stdout.write(self.style.SUCCESS("All journal vouchers are balanced."))

        if tenant_ids:
            integrity = _raw_journal_totals(tenant_ids)
            self.stdout.write(
                f"Raw journal totals for {tenant_code}: "
                f"debit={integrity['total_debit']} credit={integrity['total_credit']} "
                f"diff={integrity['difference']}"
            )

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
            for account, debit, credit in inactive_with_activity[:50]:
                self.stdout.write(
                    f"  [{account.tenant_id}] {account.code} {account.name} "
                    f"debit={debit} credit={credit}"
                )
        else:
            self.stdout.write(self.style.SUCCESS("No inactive accounts with journal activity."))
