"""
List sales invoices that need collection attention before the due date.

Schedule with cron (example: daily at 08:00 server local time):

    0 8 * * * cd /path/to/backend && python manage.py sales_invoice_due_reminders

- "Due tomorrow": unpaid balance and due_date is the calendar day after today.
- "Overdue": unpaid balance and due_date is today or in the past.

Output is stdout; redirect to a log or monitoring tool as needed.
"""

from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from sales.models import SalesInvoice
from sales.services import get_sales_invoice_financials


class Command(BaseCommand):
    help = "Print sales invoices due for collection soon (for cron / ops alerts)."

    def handle(self, *args, **options):
        today = timezone.localdate()
        tomorrow = today + timedelta(days=1)

        qs = (
            SalesInvoice.objects.filter(deleted_at__isnull=True)
            .exclude(due_date__isnull=True)
            .select_related("customer", "warehouse")
            .order_by("due_date", "invoice_number")
        )

        due_tomorrow = []
        overdue = []

        for inv in qs:
            fin = get_sales_invoice_financials(inv)
            balance = fin["balance_amount"]
            if balance <= Decimal("0.01"):
                continue
            if inv.due_date == tomorrow:
                due_tomorrow.append((inv, fin))
            elif inv.due_date <= today:
                overdue.append((inv, fin))

        if not due_tomorrow and not overdue:
            self.stdout.write(
                self.style.SUCCESS("No unpaid sales invoices due tomorrow or overdue.")
            )
            return

        if due_tomorrow:
            self.stdout.write(
                self.style.WARNING(
                    f"--- Due tomorrow ({tomorrow}) — collect before due date ---"
                )
            )
            for inv, fin in due_tomorrow:
                self._line(inv, fin)

        if overdue:
            self.stdout.write(
                self.style.ERROR(f"--- Overdue (due on or before {today}) ---")
            )
            for inv, fin in overdue:
                self._line(inv, fin)

    def _line(self, inv, fin):
        self.stdout.write(
            f"  [{inv.tenant_id}] {inv.invoice_number} | customer={inv.customer.business_name} | "
            f"due={inv.due_date} | net={fin['net_amount']} | received={fin['received_amount']} | "
            f"returns={fin['returned_amount']} | balance={fin['balance_amount']}"
        )
