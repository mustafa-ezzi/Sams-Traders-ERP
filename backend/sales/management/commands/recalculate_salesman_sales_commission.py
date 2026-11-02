from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q

from sales.models import SalesInvoice
from sales.services import quantize_money


class Command(BaseCommand):
    help = (
        "Recalculate sales-invoice salesman_commission_rate/amount from each "
        "salesman's current commission_on_sales. Default is report-only; "
        "pass --apply to write changes."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Write recalculated commission onto invoices. Default is dry-run.",
        )
        parser.add_argument(
            "--salesman",
            default="",
            help="Limit by salesman code or name (e.g. SM-00001 or Taha).",
        )
        parser.add_argument(
            "--tenant",
            default="",
            help="Optional salesman tenant_id (e.g. SAMS_TRADERS).",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=30,
            help="Max sample rows to print.",
        )

    def handle(self, *args, **options):
        apply_fix = bool(options.get("apply"))
        salesman_filter = (options.get("salesman") or "").strip()
        tenant_filter = (options.get("tenant") or "").strip()
        print_limit = options.get("limit") or 30

        invoices = (
            SalesInvoice.objects.filter(
                deleted_at__isnull=True,
                salesman__isnull=False,
                salesman__deleted_at__isnull=True,
            )
            .select_related("salesman")
            .order_by("date", "invoice_number")
        )
        if tenant_filter:
            invoices = invoices.filter(salesman__tenant_id=tenant_filter)
        if salesman_filter:
            invoices = invoices.filter(
                Q(salesman__code__iexact=salesman_filter)
                | Q(salesman__name__icontains=salesman_filter)
            )

        changes = []
        for invoice in invoices.iterator(chunk_size=200):
            salesman = invoice.salesman
            rate = quantize_money(salesman.commission_on_sales or 0)
            if rate <= 0:
                amount = Decimal("0.00")
            else:
                amount = quantize_money(
                    (quantize_money(invoice.net_amount or 0) * rate) / Decimal("100")
                )

            old_rate = quantize_money(invoice.salesman_commission_rate or 0)
            old_amount = quantize_money(invoice.salesman_commission_amount or 0)
            if old_rate == rate and old_amount == amount:
                continue

            changes.append(
                {
                    "invoice": invoice,
                    "invoice_number": invoice.invoice_number,
                    "date": invoice.date.isoformat() if invoice.date else "",
                    "salesman": f"{salesman.code} — {salesman.name}",
                    "net": quantize_money(invoice.net_amount or 0),
                    "old_rate": old_rate,
                    "old_amount": old_amount,
                    "new_rate": rate,
                    "new_amount": amount,
                }
            )

        if not changes:
            self.stdout.write(
                self.style.SUCCESS(
                    "No invoices need recalculation"
                    + (f" for filter {salesman_filter!r}." if salesman_filter else ".")
                )
            )
            return

        total_old = sum((row["old_amount"] for row in changes), Decimal("0.00"))
        total_new = sum((row["new_amount"] for row in changes), Decimal("0.00"))
        self.stdout.write(
            self.style.WARNING(
                f"Found {len(changes)} invoice(s) to recalculate. "
                f"Old sales commission total={total_old} -> new={total_new}."
            )
        )
        for row in changes[:print_limit]:
            self.stdout.write(
                f"  {row['invoice_number']}  {row['date']}  {row['salesman']}  "
                f"net={row['net']}  "
                f"{row['old_rate']}%/{row['old_amount']} -> "
                f"{row['new_rate']}%/{row['new_amount']}"
            )
        if len(changes) > print_limit:
            self.stdout.write(f"  ... and {len(changes) - print_limit} more.")

        if not apply_fix:
            self.stdout.write("")
            self.stdout.write(
                "Dry-run only. Re-run with --apply to update invoices, e.g.\n"
                '  py -3 manage.py recalculate_salesman_sales_commission '
                '--salesman "Taha Mustafa" --tenant SAMS_TRADERS --apply'
            )
            return

        with transaction.atomic():
            for row in changes:
                invoice = row["invoice"]
                invoice.salesman_commission_rate = row["new_rate"]
                invoice.salesman_commission_amount = row["new_amount"]
                invoice.save(
                    update_fields=[
                        "salesman_commission_rate",
                        "salesman_commission_amount",
                        "updated_at",
                    ]
                )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Updated {len(changes)} invoice(s). "
                f"Sales commission total {total_old} -> {total_new}."
            )
        )
