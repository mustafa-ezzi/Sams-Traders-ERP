from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.models import Account, JournalEntry, JournalLine
from purchase.models import PurchaseBankPayment, PurchaseInvoice, PurchaseReturn
from sales.models import SalesBankReceipt, SalesInvoice, SalesReturn


MONEY = Decimal("0.01")


def quantize_money(value):
    return Decimal(value or 0).quantize(MONEY, rounding=ROUND_HALF_UP)


def _resolve_party_account(party, field_label):
    if not party or not party.account_id:
        raise ValidationError({field_label: f"{field_label} account is required for journal posting."})
    return party.account


def _resolve_product_account(product, field_name, error_label):
    account = getattr(product, field_name, None)
    if account:
        return account

    category = getattr(product, "category", None)
    if category:
        account = getattr(category, field_name, None)
        if account:
            return account

    raise ValidationError(
        {
            error_label: (
                f"{product.name} is missing {field_name}. "
                "Set it on the product or its category before posting."
            )
        }
    )


def _allocate_amounts(entries, target_total):
    target_total = quantize_money(target_total)
    total_weight = sum(quantize_money(entry["weight"]) for entry in entries)
    if not entries:
        return []
    if total_weight <= 0:
        raise ValidationError({"amount": "Cannot allocate journal amounts with zero total weight."})

    allocated = []
    running_total = Decimal("0.00")
    for index, entry in enumerate(entries):
        if index == len(entries) - 1:
            amount = quantize_money(target_total - running_total)
        else:
            amount = quantize_money((target_total * quantize_money(entry["weight"])) / total_weight)
            running_total += amount
        allocated.append({**entry, "allocated_amount": amount})
    return allocated


def _upsert_journal_entry(
    *,
    tenant_id,
    source_type,
    source_id,
    date,
    reference,
    document_type,
    description,
    people_type,
    people_name,
    lines,
):
    debit_total = sum(quantize_money(line["debit"]) for line in lines)
    credit_total = sum(quantize_money(line["credit"]) for line in lines)
    if quantize_money(debit_total) != quantize_money(credit_total):
        raise ValidationError(
            {
                "journal": (
                    f"Journal entry {reference} is unbalanced. "
                    f"Debit {quantize_money(debit_total)} != credit {quantize_money(credit_total)}."
                )
            }
        )

    entry, _created = JournalEntry.objects.update_or_create(
        tenant_id=tenant_id,
        source_type=source_type,
        source_id=source_id,
        deleted_at__isnull=True,
        defaults={
            "date": date,
            "reference": reference,
            "document_type": document_type,
            "description": description or "",
            "people_type": people_type or "",
            "people_name": people_name or "",
            "deleted_at": None,
        },
    )
    entry.lines.filter(deleted_at__isnull=True).update(deleted_at=timezone.now())

    for line in lines:
        JournalLine.objects.create(
            tenant_id=tenant_id,
            journal_entry=entry,
            account=line["account"],
            debit=quantize_money(line["debit"]),
            credit=quantize_money(line["credit"]),
            line_description=line.get("line_description", ""),
            people_type=line.get("people_type", ""),
            people_name=line.get("people_name", ""),
        )
    return entry


def delete_journal_entry(source_type, source_id, tenant_id):
    now = timezone.now()
    entry = JournalEntry.objects.filter(
        tenant_id=tenant_id,
        source_type=source_type,
        source_id=source_id,
        deleted_at__isnull=True,
    ).first()
    if not entry:
        return
    entry.deleted_at = now
    entry.save(update_fields=["deleted_at", "updated_at"])
    entry.lines.filter(deleted_at__isnull=True).update(deleted_at=now)


def _build_purchase_invoice_lines(invoice):
    supplier_account = _resolve_party_account(invoice.supplier, "Supplier")
    weighted_lines = []
    invoice_lines = invoice.lines.filter(deleted_at__isnull=True).select_related(
        "product__category",
        "product__inventory_account",
        "product__category__inventory_account",
    )
    for line in invoice_lines:
        inventory_account = _resolve_product_account(line.product, "inventory_account", "inventory_account")
        weighted_lines.append(
            {
                "account": inventory_account,
                "weight": line.total_amount,
                "line_description": line.product.name,
            }
        )

    inventory_lines = [
        {
            "account": line["account"],
            "debit": line["allocated_amount"],
            "credit": Decimal("0.00"),
            "line_description": line["line_description"],
        }
        for line in _allocate_amounts(weighted_lines, invoice.net_amount)
    ]
    inventory_by_account = {}
    for line in inventory_lines:
        key = line["account"].id
        current = inventory_by_account.setdefault(
            key,
            {
                "account": line["account"],
                "debit": Decimal("0.00"),
                "credit": Decimal("0.00"),
                "line_description": "Purchase Inventory",
            },
        )
        current["debit"] += line["debit"]

    return [
        *inventory_by_account.values(),
        {
            "account": supplier_account,
            "debit": Decimal("0.00"),
            "credit": invoice.net_amount,
            "line_description": "Purchase Payable",
            "people_type": "Supplier",
            "people_name": invoice.supplier.business_name,
        },
    ]


def _build_purchase_return_lines(purchase_return):
    supplier_account = _resolve_party_account(purchase_return.supplier, "Supplier")
    lines = [
        {
            "account": supplier_account,
            "debit": purchase_return.gross_amount,
            "credit": Decimal("0.00"),
            "line_description": "Purchase Return Payable Reversal",
            "people_type": "Supplier",
            "people_name": purchase_return.supplier.business_name,
        }
    ]
    inventory_totals = {}
    return_lines = purchase_return.lines.filter(deleted_at__isnull=True).select_related(
        "product__category",
        "product__inventory_account",
        "product__category__inventory_account",
    )
    for line in return_lines:
        inventory_account = _resolve_product_account(line.product, "inventory_account", "inventory_account")
        bucket = inventory_totals.setdefault(
            inventory_account.id,
            {"account": inventory_account, "debit": Decimal("0.00"), "credit": Decimal("0.00")},
        )
        bucket["credit"] += quantize_money(line.amount)
    lines.extend(
        {
            "account": item["account"],
            "debit": Decimal("0.00"),
            "credit": item["credit"],
            "line_description": "Purchase Return Inventory",
        }
        for item in inventory_totals.values()
    )
    return lines


def _build_purchase_bank_payment_lines(payment):
    supplier_account = _resolve_party_account(payment.supplier, "Supplier")
    return [
        {
            "account": supplier_account,
            "debit": payment.amount,
            "credit": Decimal("0.00"),
            "line_description": "Supplier Payment",
            "people_type": "Supplier",
            "people_name": payment.supplier.business_name,
        },
        {
            "account": payment.bank_account,
            "debit": Decimal("0.00"),
            "credit": payment.amount,
            "line_description": "Bank Payment",
        },
    ]


def _build_sales_invoice_lines(invoice):
    customer_account = _resolve_party_account(invoice.customer, "Customer")
    revenue_weighted = []
    cogs_totals = {}
    inventory_totals = {}
    invoice_lines = invoice.lines.filter(deleted_at__isnull=True).select_related(
        "product__category",
        "product__inventory_account",
        "product__cogs_account",
        "product__revenue_account",
        "product__category__inventory_account",
        "product__category__cogs_account",
        "product__category__revenue_account",
    )
    for line in invoice_lines:
        revenue_account = _resolve_product_account(line.product, "revenue_account", "revenue_account")
        cogs_account = _resolve_product_account(line.product, "cogs_account", "cogs_account")
        inventory_account = _resolve_product_account(line.product, "inventory_account", "inventory_account")
        revenue_weighted.append(
            {
                "account": revenue_account,
                "weight": line.total_amount,
                "line_description": line.product.name,
            }
        )
        cost_amount = quantize_money(quantize_money(line.quantity) * quantize_money(line.product.net_amount))
        cogs_totals[cogs_account.id] = cogs_totals.get(cogs_account.id, {"account": cogs_account, "amount": Decimal("0.00")})
        cogs_totals[cogs_account.id]["amount"] += cost_amount
        inventory_totals[inventory_account.id] = inventory_totals.get(
            inventory_account.id,
            {"account": inventory_account, "amount": Decimal("0.00")},
        )
        inventory_totals[inventory_account.id]["amount"] += cost_amount

    revenue_lines = _allocate_amounts(revenue_weighted, invoice.net_amount)
    revenue_totals = {}
    for line in revenue_lines:
        revenue_totals[line["account"].id] = revenue_totals.get(
            line["account"].id,
            {"account": line["account"], "amount": Decimal("0.00")},
        )
        revenue_totals[line["account"].id]["amount"] += line["allocated_amount"]

    lines = [
        {
            "account": customer_account,
            "debit": invoice.net_amount,
            "credit": Decimal("0.00"),
            "line_description": "Customer Receivable",
            "people_type": "Customer",
            "people_name": invoice.customer.business_name,
        }
    ]
    lines.extend(
        {
            "account": item["account"],
            "debit": Decimal("0.00"),
            "credit": item["amount"],
            "line_description": "Sales Revenue",
        }
        for item in revenue_totals.values()
    )
    lines.extend(
        {
            "account": item["account"],
            "debit": item["amount"],
            "credit": Decimal("0.00"),
            "line_description": "Cost of Goods Sold",
        }
        for item in cogs_totals.values()
    )
    lines.extend(
        {
            "account": item["account"],
            "debit": Decimal("0.00"),
            "credit": item["amount"],
            "line_description": "Inventory Reduction",
        }
        for item in inventory_totals.values()
    )
    return lines


def _build_sales_return_lines(sales_return):
    customer_account = _resolve_party_account(sales_return.customer, "Customer")
    lines = [
        {
            "account": customer_account,
            "debit": Decimal("0.00"),
            "credit": sales_return.gross_amount,
            "line_description": "Customer Receivable Reversal",
            "people_type": "Customer",
            "people_name": sales_return.customer.business_name,
        }
    ]
    revenue_totals = {}
    cogs_totals = {}
    inventory_totals = {}
    return_lines = sales_return.lines.filter(deleted_at__isnull=True).select_related(
        "product__category",
        "product__inventory_account",
        "product__cogs_account",
        "product__revenue_account",
        "product__category__inventory_account",
        "product__category__cogs_account",
        "product__category__revenue_account",
    )
    for line in return_lines:
        revenue_account = _resolve_product_account(line.product, "revenue_account", "revenue_account")
        cogs_account = _resolve_product_account(line.product, "cogs_account", "cogs_account")
        inventory_account = _resolve_product_account(line.product, "inventory_account", "inventory_account")
        revenue_totals[revenue_account.id] = revenue_totals.get(
            revenue_account.id,
            {"account": revenue_account, "amount": Decimal("0.00")},
        )
        revenue_totals[revenue_account.id]["amount"] += quantize_money(line.amount)

        cost_amount = quantize_money(quantize_money(line.quantity) * quantize_money(line.product.net_amount))
        inventory_totals[inventory_account.id] = inventory_totals.get(
            inventory_account.id,
            {"account": inventory_account, "amount": Decimal("0.00")},
        )
        inventory_totals[inventory_account.id]["amount"] += cost_amount
        cogs_totals[cogs_account.id] = cogs_totals.get(
            cogs_account.id,
            {"account": cogs_account, "amount": Decimal("0.00")},
        )
        cogs_totals[cogs_account.id]["amount"] += cost_amount

    lines.extend(
        {
            "account": item["account"],
            "debit": item["amount"],
            "credit": Decimal("0.00"),
            "line_description": "Sales Return Revenue Reversal",
        }
        for item in revenue_totals.values()
    )
    lines.extend(
        {
            "account": item["account"],
            "debit": item["amount"],
            "credit": Decimal("0.00"),
            "line_description": "Inventory Return",
        }
        for item in inventory_totals.values()
    )
    lines.extend(
        {
            "account": item["account"],
            "debit": Decimal("0.00"),
            "credit": item["amount"],
            "line_description": "COGS Reversal",
        }
        for item in cogs_totals.values()
    )
    return lines


def _build_sales_bank_receipt_lines(receipt):
    customer_account = _resolve_party_account(receipt.customer, "Customer")
    return [
        {
            "account": receipt.bank_account,
            "debit": receipt.amount,
            "credit": Decimal("0.00"),
            "line_description": "Bank Receipt",
        },
        {
            "account": customer_account,
            "debit": Decimal("0.00"),
            "credit": receipt.amount,
            "line_description": "Customer Receipt",
            "people_type": "Customer",
            "people_name": receipt.customer.business_name,
        },
    ]


@transaction.atomic
def sync_purchase_invoice_journal(invoice):
    return _upsert_journal_entry(
        tenant_id=invoice.tenant_id,
        source_type=JournalEntry.SourceType.PURCHASE_INVOICE,
        source_id=invoice.id,
        date=invoice.date,
        reference=invoice.invoice_number,
        document_type="Purchase Invoice",
        description=invoice.remarks,
        people_type="Supplier",
        people_name=invoice.supplier.business_name,
        lines=_build_purchase_invoice_lines(invoice),
    )


@transaction.atomic
def sync_purchase_return_journal(purchase_return):
    return _upsert_journal_entry(
        tenant_id=purchase_return.tenant_id,
        source_type=JournalEntry.SourceType.PURCHASE_RETURN,
        source_id=purchase_return.id,
        date=purchase_return.date,
        reference=purchase_return.return_number,
        document_type="Purchase Return",
        description=purchase_return.remarks,
        people_type="Supplier",
        people_name=purchase_return.supplier.business_name,
        lines=_build_purchase_return_lines(purchase_return),
    )


@transaction.atomic
def sync_purchase_bank_payment_journal(payment):
    return _upsert_journal_entry(
        tenant_id=payment.tenant_id,
        source_type=JournalEntry.SourceType.PURCHASE_BANK_PAYMENT,
        source_id=payment.id,
        date=payment.date,
        reference=payment.payment_number,
        document_type="Bank Payment",
        description=payment.remarks,
        people_type="Supplier",
        people_name=payment.supplier.business_name,
        lines=_build_purchase_bank_payment_lines(payment),
    )


@transaction.atomic
def sync_sales_invoice_journal(invoice):
    return _upsert_journal_entry(
        tenant_id=invoice.tenant_id,
        source_type=JournalEntry.SourceType.SALES_INVOICE,
        source_id=invoice.id,
        date=invoice.date,
        reference=invoice.invoice_number,
        document_type="Sales Invoice",
        description=invoice.remarks,
        people_type="Customer",
        people_name=invoice.customer.business_name,
        lines=_build_sales_invoice_lines(invoice),
    )


@transaction.atomic
def sync_sales_return_journal(sales_return):
    return _upsert_journal_entry(
        tenant_id=sales_return.tenant_id,
        source_type=JournalEntry.SourceType.SALES_RETURN,
        source_id=sales_return.id,
        date=sales_return.date,
        reference=sales_return.return_number,
        document_type="Sales Return",
        description=sales_return.remarks,
        people_type="Customer",
        people_name=sales_return.customer.business_name,
        lines=_build_sales_return_lines(sales_return),
    )


@transaction.atomic
def sync_sales_bank_receipt_journal(receipt):
    return _upsert_journal_entry(
        tenant_id=receipt.tenant_id,
        source_type=JournalEntry.SourceType.SALES_BANK_RECEIPT,
        source_id=receipt.id,
        date=receipt.date,
        reference=receipt.receipt_number,
        document_type="Bank Receipt",
        description=receipt.remarks,
        people_type="Customer",
        people_name=receipt.customer.business_name,
        lines=_build_sales_bank_receipt_lines(receipt),
    )


@transaction.atomic
def sync_all_journals():
    for invoice in PurchaseInvoice.objects.filter(deleted_at__isnull=True).select_related("supplier"):
        sync_purchase_invoice_journal(invoice)
    for purchase_return in PurchaseReturn.objects.filter(deleted_at__isnull=True).select_related("supplier"):
        sync_purchase_return_journal(purchase_return)
    for payment in PurchaseBankPayment.objects.filter(deleted_at__isnull=True).select_related("supplier", "bank_account"):
        sync_purchase_bank_payment_journal(payment)
    for invoice in SalesInvoice.objects.filter(deleted_at__isnull=True).select_related("customer"):
        sync_sales_invoice_journal(invoice)
    for sales_return in SalesReturn.objects.filter(deleted_at__isnull=True).select_related("customer"):
        sync_sales_return_journal(sales_return)
    for receipt in SalesBankReceipt.objects.filter(deleted_at__isnull=True).select_related("customer", "bank_account"):
        sync_sales_bank_receipt_journal(receipt)
