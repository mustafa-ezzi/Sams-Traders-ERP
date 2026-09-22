from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count, Prefetch, Q, Sum
from django.db.models.functions import Coalesce
from django.utils.timezone import now

from accounts.journal import sync_sales_bank_receipt_journal
from accounts.models import Account
from sales.models import SalesBankReceipt, SalesBankReceiptLine, SalesInvoice, SalesInvoiceLine
from sales.services import (
    allocate_invoice_amount_to_line_share,
    get_sales_invoice_line_totals_by_tenant,
    quantize_money,
)


class Command(BaseCommand):
    help = (
        "Report (and optionally repair) bank receipts that booked a mixed "
        "AM/SAMS invoice's full amount into one dimension."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help=(
                "Split over-allocated receipt lines onto under-allocated "
                "dimensions and re-sync journals. Default is report-only."
            ),
        )
        parser.add_argument(
            "--invoice",
            default="",
            help="Optional invoice number to limit the scan.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=100,
            help="Max mismatched invoices to print.",
        )

    def handle(self, *args, **options):
        apply_fix = bool(options.get("apply"))
        invoice_number = (options.get("invoice") or "").strip()
        print_limit = options.get("limit") or 100

        invoices = (
            SalesInvoice.objects.filter(deleted_at__isnull=True)
            .annotate(
                dim_count=Count(
                    "lines__tenant_id",
                    distinct=True,
                    filter=Q(lines__deleted_at__isnull=True),
                )
            )
            .filter(dim_count__gt=1)
            .prefetch_related(
                Prefetch(
                    "lines",
                    queryset=SalesInvoiceLine.objects.filter(deleted_at__isnull=True),
                ),
                Prefetch(
                    "bank_receipt_lines",
                    queryset=SalesBankReceiptLine.objects.filter(
                        deleted_at__isnull=True,
                        receipt__deleted_at__isnull=True,
                        receipt_against=SalesBankReceiptLine.ReceiptAgainst.INVOICE,
                    ).select_related("receipt", "bank_account", "customer"),
                ),
            )
            .order_by("date", "invoice_number")
        )
        if invoice_number:
            invoices = invoices.filter(invoice_number=invoice_number)

        mismatches = []
        for invoice in invoices.iterator(chunk_size=50):
            report = self._analyze_invoice(invoice)
            if report["needs_fix"]:
                mismatches.append(report)

        if not mismatches:
            self.stdout.write(self.style.SUCCESS("No mixed-invoice receipt mismatches found."))
            return

        self.stdout.write(
            self.style.WARNING(
                f"Found {len(mismatches)} mixed invoice(s) with receipt dimension mismatches."
            )
        )
        for report in mismatches[:print_limit]:
            self._print_report(report)

        if len(mismatches) > print_limit:
            self.stdout.write(f"... and {len(mismatches) - print_limit} more.")

        if not apply_fix:
            self.stdout.write("")
            self.stdout.write(
                "Report only. Re-run with --apply to split over-allocated "
                "receipt amounts onto the other company's share and re-sync journals."
            )
            self.stdout.write(
                "Tip: preview one voucher first with "
                "--invoice SI-0004  then  --invoice SI-0004 --apply"
            )
            return

        fixed = 0
        failed = 0
        for report in mismatches:
            try:
                changed = self._apply_fix(report)
                if changed:
                    fixed += 1
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"Fixed {report['invoice_number']}: moved "
                            f"{changed['moved']} across {changed['splits']} split(s)."
                        )
                    )
            except Exception as exc:  # noqa: BLE001 - surface per-invoice failures
                failed += 1
                self.stdout.write(
                    self.style.ERROR(f"Failed {report['invoice_number']}: {exc}")
                )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Fixed {fixed} invoice(s). Failures: {failed}."
            )
        )

    def _analyze_invoice(self, invoice):
        line_totals = get_sales_invoice_line_totals_by_tenant(invoice)
        targets = {
            dim: allocate_invoice_amount_to_line_share(
                invoice, invoice.net_amount or Decimal("0.00"), total
            )
            for dim, total in line_totals.items()
        }

        received = {dim: Decimal("0.00") for dim in targets}
        receipt_lines = list(invoice.bank_receipt_lines.all())
        for line in receipt_lines:
            dim = line.tenant_id or ""
            if not dim:
                continue
            received[dim] = received.get(dim, Decimal("0.00")) + quantize_money(
                line.amount or 0
            )

        over = {}
        under = {}
        for dim, target in targets.items():
            got = received.get(dim, Decimal("0.00"))
            if got > target:
                over[dim] = quantize_money(got - target)
            elif got < target:
                under[dim] = quantize_money(target - got)

        return {
            "invoice": invoice,
            "invoice_number": invoice.invoice_number,
            "invoice_id": str(invoice.id),
            "net_amount": quantize_money(invoice.net_amount or 0),
            "targets": targets,
            "received": received,
            "over": over,
            "under": under,
            "needs_fix": bool(over and under),
            "receipt_lines": receipt_lines,
        }

    def _print_report(self, report):
        self.stdout.write("")
        self.stdout.write(
            f"{report['invoice_number']}  net={report['net_amount']}"
        )
        dims = sorted(set(report["targets"]) | set(report["received"]))
        for dim in dims:
            self.stdout.write(
                f"  {dim}: share={report['targets'].get(dim, Decimal('0.00'))}  "
                f"received={report['received'].get(dim, Decimal('0.00'))}"
            )
        if report["over"]:
            self.stdout.write(
                "  OVER: "
                + ", ".join(f"{k} +{v}" for k, v in sorted(report["over"].items()))
            )
        if report["under"]:
            self.stdout.write(
                "  UNDER: "
                + ", ".join(f"{k} -{v}" for k, v in sorted(report["under"].items()))
            )

    def _apply_fix(self, report):
        invoice = report["invoice"]
        over = dict(report["over"])
        under = dict(report["under"])
        if not over or not under:
            return None

        moved_total = Decimal("0.00")
        splits = 0
        touched_receipt_ids = set()

        # Prefer moving from newest over-allocated lines (often the bad full-amount posts).
        candidates = sorted(
            [
                line
                for line in report["receipt_lines"]
                if line.tenant_id in over and quantize_money(line.amount or 0) > 0
            ],
            key=lambda line: (
                line.receipt.date if line.receipt_id else line.created_at,
                line.created_at,
            ),
            reverse=True,
        )

        with transaction.atomic():
            for line in candidates:
                from_dim = line.tenant_id
                if over.get(from_dim, Decimal("0.00")) <= 0:
                    continue

                for to_dim in sorted(under.keys()):
                    if under[to_dim] <= 0 or over.get(from_dim, Decimal("0.00")) <= 0:
                        continue

                    movable = min(
                        quantize_money(line.amount or 0),
                        over[from_dim],
                        under[to_dim],
                    )
                    if movable <= 0:
                        continue

                    to_bank = self._resolve_bank_for_dimension(line.bank_account, to_dim)
                    if not to_bank:
                        raise RuntimeError(
                            f"No bank account in {to_dim} matching "
                            f"{getattr(line.bank_account, 'code', '?')} / "
                            f"{getattr(line.bank_account, 'name', '?')}"
                        )

                    remaining = quantize_money(quantize_money(line.amount) - movable)
                    if remaining > 0:
                        line.amount = remaining
                        if line.recovery_commission_rate:
                            line.recovery_commission_amount = quantize_money(
                                (remaining * line.recovery_commission_rate)
                                / Decimal("100")
                            )
                        else:
                            line.recovery_commission_amount = Decimal("0.00")
                        line.save(
                            update_fields=[
                                "amount",
                                "recovery_commission_amount",
                                "updated_at",
                            ]
                        )
                    else:
                        line.deleted_at = now()
                        line.save(update_fields=["deleted_at", "updated_at"])

                    SalesBankReceiptLine.objects.create(
                        tenant_id=to_dim,
                        receipt=line.receipt,
                        customer=line.customer,
                        receipt_against=SalesBankReceiptLine.ReceiptAgainst.INVOICE,
                        sales_invoice=invoice,
                        salesman_id=line.salesman_id,
                        bank_account=to_bank,
                        amount=movable,
                        recovery_commission_rate=line.recovery_commission_rate
                        or Decimal("0.00"),
                        recovery_commission_amount=(
                            quantize_money(
                                (
                                    movable
                                    * (line.recovery_commission_rate or Decimal("0.00"))
                                )
                                / Decimal("100")
                            )
                            if line.recovery_commission_rate
                            else Decimal("0.00")
                        ),
                    )

                    over[from_dim] = quantize_money(over[from_dim] - movable)
                    under[to_dim] = quantize_money(under[to_dim] - movable)
                    moved_total = quantize_money(moved_total + movable)
                    splits += 1
                    touched_receipt_ids.add(line.receipt_id)

                    if remaining > 0:
                        line.amount = remaining

            for receipt_id in touched_receipt_ids:
                receipt = (
                    SalesBankReceipt.objects.filter(id=receipt_id, deleted_at__isnull=True)
                    .prefetch_related("lines")
                    .first()
                )
                if not receipt:
                    continue
                active_total = (
                    receipt.lines.filter(deleted_at__isnull=True).aggregate(
                        total=Coalesce(Sum("amount"), Decimal("0.00"))
                    )["total"]
                    or Decimal("0.00")
                )
                receipt.amount = quantize_money(active_total)
                receipt.save(update_fields=["amount", "updated_at"])
                sync_sales_bank_receipt_journal(receipt)

        if moved_total <= 0:
            return None
        return {"moved": moved_total, "splits": splits}

    def _resolve_bank_for_dimension(self, bank_account, tenant_id):
        if not bank_account:
            return None
        if bank_account.tenant_id == tenant_id:
            return bank_account

        same_code = (
            Account.objects.filter(
                tenant_id=tenant_id,
                code=bank_account.code,
                deleted_at__isnull=True,
                is_active=True,
                is_postable=True,
                account_type=Account.AccountType.BANK,
            )
            .order_by("created_at")
            .first()
        )
        if same_code:
            return same_code

        return (
            Account.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
                is_active=True,
                is_postable=True,
                account_type=Account.AccountType.BANK,
                account_group=Account.AccountGroup.ASSET,
            )
            .order_by("code")
            .first()
        )
