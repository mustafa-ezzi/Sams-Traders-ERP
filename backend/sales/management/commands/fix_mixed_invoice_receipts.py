import csv
import re
from decimal import Decimal
from pathlib import Path

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
        "AM/SAMS invoice's full amount into one dimension. Writes a CSV with "
        "invoice numbers and the SBR vouchers to edit."
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
            help="Max mismatched invoices to print to the console.",
        )
        parser.add_argument(
            "--output",
            default="mixed_invoice_receipt_mismatches.csv",
            help=(
                "CSV path for the full mismatch report (invoice, SBR numbers, "
                "over/under by dimension). Default: mixed_invoice_receipt_mismatches.csv"
            ),
        )

    def handle(self, *args, **options):
        apply_fix = bool(options.get("apply"))
        invoice_number = (options.get("invoice") or "").strip()
        print_limit = options.get("limit") or 100
        output_path = Path(options.get("output") or "mixed_invoice_receipt_mismatches.csv")

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
            .select_related("customer")
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
            invoices = self._filter_by_invoice_number(invoices, invoice_number)
            if not invoices.exists():
                self.stdout.write(
                    self.style.ERROR(
                        f"No invoice matched --invoice {invoice_number!r}. "
                        "Try the exact number from the CSV (e.g. \"SI - 0020\")."
                    )
                )
                return

        mismatches = []
        for invoice in invoices.iterator(chunk_size=50):
            report = self._analyze_invoice(invoice)
            if report["needs_fix"]:
                mismatches.append(report)

        if not mismatches:
            if invoice_number:
                matched = list(
                    invoices.values_list("invoice_number", flat=True)[:5]
                )
                self.stdout.write(
                    self.style.SUCCESS(
                        "No mixed-invoice receipt mismatches found for "
                        f"{matched or invoice_number}."
                    )
                )
            else:
                self.stdout.write(
                    self.style.SUCCESS("No mixed-invoice receipt mismatches found.")
                )
            return

        written = self._write_csv_report(mismatches, output_path)
        self.stdout.write(
            self.style.WARNING(
                f"Found {len(mismatches)} mixed invoice(s) with receipt dimension mismatches."
            )
        )
        self.stdout.write(self.style.SUCCESS(f"Wrote report: {written}"))
        for report in mismatches[:print_limit]:
            self._print_report(report)

        if len(mismatches) > print_limit:
            self.stdout.write(f"... and {len(mismatches) - print_limit} more (see CSV).")

        if not apply_fix:
            self.stdout.write("")
            self.stdout.write(
                "Report only. Open the CSV for invoice + SBR numbers to edit, "
                "or re-run with --apply to auto-split over-allocated amounts."
            )
            self.stdout.write(
                'Tip: preview one voucher first with '
                '--invoice "SI - 0020"  then  --invoice "SI - 0020" --apply'
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

    @staticmethod
    def _normalize_invoice_number(value):
        """SI-0020, SI - 0020, si–0020 → SI-0020."""
        text = str(value or "").strip().upper()
        text = text.replace("–", "-").replace("—", "-")
        text = re.sub(r"\s*-\s*", "-", text)
        text = re.sub(r"\s+", " ", text)
        return text

    def _filter_by_invoice_number(self, queryset, invoice_number):
        normalized = self._normalize_invoice_number(invoice_number)
        # Exact match first (CSV / UI may already use spaced form).
        exact = queryset.filter(invoice_number=invoice_number)
        if exact.exists():
            return exact
        spaced = queryset.filter(invoice_number=normalized.replace("-", " - "))
        if spaced.exists():
            return spaced
        # Fallback: compare normalized forms in Python for odd spacing.
        matched_ids = []
        for inv_id, inv_no in queryset.values_list("id", "invoice_number"):
            if self._normalize_invoice_number(inv_no) == normalized:
                matched_ids.append(inv_id)
        return queryset.filter(id__in=matched_ids)

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
        sbr_details = []
        for line in receipt_lines:
            dim = line.tenant_id or ""
            if not dim:
                continue
            amount = quantize_money(line.amount or 0)
            received[dim] = received.get(dim, Decimal("0.00")) + amount
            receipt = line.receipt
            sbr_details.append(
                {
                    "receipt_number": getattr(receipt, "receipt_number", "") or "",
                    "receipt_date": (
                        receipt.date.isoformat()
                        if getattr(receipt, "date", None)
                        else ""
                    ),
                    "receipt_tenant_id": getattr(receipt, "tenant_id", "") or "",
                    "line_amount": amount,
                    "line_dimension": dim,
                }
            )

        over = {}
        under = {}
        for dim, target in targets.items():
            got = received.get(dim, Decimal("0.00"))
            if got > target:
                over[dim] = quantize_money(got - target)
            elif got < target:
                under[dim] = quantize_money(target - got)

        sbr_numbers = sorted(
            {
                detail["receipt_number"]
                for detail in sbr_details
                if detail["receipt_number"]
            }
        )
        customer_name = ""
        if getattr(invoice, "customer", None):
            customer_name = (
                invoice.customer.business_name or invoice.customer.name or ""
            )

        return {
            "invoice": invoice,
            "invoice_number": invoice.invoice_number,
            "invoice_id": str(invoice.id),
            "invoice_date": (
                invoice.date.isoformat() if getattr(invoice, "date", None) else ""
            ),
            "customer_name": customer_name,
            "net_amount": quantize_money(invoice.net_amount or 0),
            "targets": targets,
            "received": received,
            "over": over,
            "under": under,
            "sbr_numbers": sbr_numbers,
            "sbr_details": sbr_details,
            "needs_fix": bool(over and under),
            "receipt_lines": receipt_lines,
        }

    def _print_report(self, report):
        self.stdout.write("")
        sbr_list = ", ".join(report["sbr_numbers"]) or "(no SBR found)"
        self.stdout.write(
            f"{report['invoice_number']}  net={report['net_amount']}  "
            f"customer={report['customer_name'] or '-'}  SBR: {sbr_list}"
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
        for detail in report["sbr_details"]:
            self.stdout.write(
                f"  -> {detail['receipt_number']} "
                f"({detail['receipt_date']}) "
                f"line dim={detail['line_dimension']} "
                f"amount={detail['line_amount']}"
            )

    def _write_csv_report(self, mismatches, output_path):
        output_path = Path(output_path)
        if not output_path.is_absolute():
            output_path = Path.cwd() / output_path
        output_path.parent.mkdir(parents=True, exist_ok=True)

        fieldnames = [
            "invoice_number",
            "invoice_date",
            "customer",
            "invoice_net",
            "sbr_numbers",
            "sbr_line_detail",
            "over_dimensions",
            "under_dimensions",
            "dimension_share_detail",
            "dimension_received_detail",
        ]
        with output_path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            for report in mismatches:
                sbr_line_detail = "; ".join(
                    (
                        f"{d['receipt_number']}|"
                        f"{d['line_dimension']}|"
                        f"{d['line_amount']}"
                    )
                    for d in report["sbr_details"]
                )
                writer.writerow(
                    {
                        "invoice_number": report["invoice_number"],
                        "invoice_date": report["invoice_date"],
                        "customer": report["customer_name"],
                        "invoice_net": str(report["net_amount"]),
                        "sbr_numbers": ", ".join(report["sbr_numbers"]),
                        "sbr_line_detail": sbr_line_detail,
                        "over_dimensions": ", ".join(
                            f"{k} +{v}" for k, v in sorted(report["over"].items())
                        ),
                        "under_dimensions": ", ".join(
                            f"{k} -{v}" for k, v in sorted(report["under"].items())
                        ),
                        "dimension_share_detail": ", ".join(
                            f"{k}={v}" for k, v in sorted(report["targets"].items())
                        ),
                        "dimension_received_detail": ", ".join(
                            f"{k}={v}" for k, v in sorted(report["received"].items())
                        ),
                    }
                )
        return output_path

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
