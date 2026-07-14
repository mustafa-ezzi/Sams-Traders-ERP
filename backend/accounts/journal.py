from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.models import Account, Expense, JournalEntry, JournalLine, BankTransfer
from inventory.models import PartyOpeningBalance
from inventory.party_accounts import (
    resolve_default_payable_account,
    resolve_default_receivable_account,
    resolve_opening_equity_account,
)
from purchase.models import PurchaseBankPayment, PurchaseInvoice, PurchaseReturn
from sales.models import SalesBankReceipt, SalesInvoice, SalesReturn


MONEY = Decimal("0.01")


def quantize_money(value):
    return Decimal(value or 0).quantize(MONEY, rounding=ROUND_HALF_UP)


def _resolve_party_account(party, field_label):
    if not party or not party.account_id:
        raise ValidationError({field_label: f"{field_label} account is required for journal posting."})
    return party.account


def _party_control_account_for_dimension(party, field_label, tenant_id):
    if field_label == "Customer":
        return resolve_default_receivable_account([tenant_id])
    if field_label == "Supplier":
        return resolve_default_payable_account([tenant_id])
    return _resolve_party_account(party, field_label)


def _account_for_dimension(account, tenant_id):
    if account.tenant_id == tenant_id:
        return account

    matching_account = Account.objects.filter(
        tenant_id=tenant_id,
        code=account.code,
        deleted_at__isnull=True,
        is_active=True,
        is_postable=True,
    ).first()
    if matching_account:
        return matching_account

    raise ValidationError(
        {
            "account": (
                f"Account {account.code} - {account.name} was selected from "
                f"{account.tenant_id}, but no active postable copy exists in {tenant_id}."
            )
        }
    )


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


def _resolve_raw_material_account(raw_material, field_name, error_label):
    account = getattr(raw_material, field_name, None)
    if account:
        return account

    category = getattr(raw_material, "category", None)
    if category:
        account = getattr(category, field_name, None)
        if account:
            return account

    raise ValidationError(
        {
            error_label: (
                f"{raw_material.name} is missing {field_name}. "
                "Set it on the raw material or its category before posting."
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


def _sales_invoice_weights(invoice):
    weights = {}
    for line in invoice.lines.filter(deleted_at__isnull=True).select_related("product"):
        tenant_id = line.product.tenant_id
        weights[tenant_id] = weights.get(tenant_id, Decimal("0.00")) + quantize_money(
            line.total_amount
        )
    return weights


def _purchase_invoice_weights(invoice):
    weights = {}
    lines = invoice.lines.filter(deleted_at__isnull=True).select_related(
        "product",
        "raw_material",
    )
    for line in lines:
        tenant_id = line.raw_material.tenant_id if line.item_type == "RAW_MATERIAL" else line.product.tenant_id
        weights[tenant_id] = weights.get(tenant_id, Decimal("0.00")) + quantize_money(
            line.total_amount
        )
    return weights


def _allocate_invoice_amount_by_tenant(invoice, target_total, weights):
    weighted_entries = [
        {"tenant_id": tenant_id, "weight": amount}
        for tenant_id, amount in weights.items()
        if quantize_money(amount) > 0
    ]
    if not weighted_entries:
        return {invoice.tenant_id: quantize_money(target_total)}

    return {
        entry["tenant_id"]: entry["allocated_amount"]
        for entry in _allocate_amounts(weighted_entries, target_total)
    }


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
            tenant_id=line.get("tenant_id") or line["account"].tenant_id or tenant_id,
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
    weighted_lines = []
    invoice_lines = invoice.lines.filter(deleted_at__isnull=True).select_related(
        "product__category",
        "product__inventory_account",
        "product__category__inventory_account",
        "raw_material__inventory_account",
        "raw_material__category__inventory_account",
    )
    for line in invoice_lines:
        if line.item_type == "RAW_MATERIAL":
            inventory_account = _resolve_raw_material_account(
                line.raw_material, "inventory_account", "inventory_account"
            )
            line_description = line.raw_material.name
            line_tenant_id = line.raw_material.tenant_id
        else:
            inventory_account = _resolve_product_account(line.product, "inventory_account", "inventory_account")
            line_description = line.product.name
            line_tenant_id = line.product.tenant_id
        weighted_lines.append(
            {
                "account": inventory_account,
                "tenant_id": line_tenant_id,
                "weight": line.total_amount,
                "line_description": line_description,
            }
        )

    inventory_lines = [
        {
            "account": line["account"],
            "tenant_id": line["tenant_id"],
            "debit": line["allocated_amount"],
            "credit": Decimal("0.00"),
            "line_description": line["line_description"],
        }
        for line in _allocate_amounts(weighted_lines, invoice.net_amount)
    ]
    inventory_by_account = {}
    for line in inventory_lines:
        key = (line["tenant_id"], line["account"].id)
        current = inventory_by_account.setdefault(
            key,
            {
                "account": line["account"],
                "tenant_id": line["tenant_id"],
                "debit": Decimal("0.00"),
                "credit": Decimal("0.00"),
                "line_description": "Purchase Inventory",
            },
        )
        current["debit"] += line["debit"]

    payable_lines = []
    for item in inventory_by_account.values():
        supplier_account = _party_control_account_for_dimension(
            invoice.supplier,
            "Supplier",
            item["tenant_id"],
        )
        payable_lines.append(
            {
                "account": supplier_account,
                "tenant_id": item["tenant_id"],
                "debit": Decimal("0.00"),
                "credit": item["debit"],
                "line_description": "Purchase Payable",
                "people_type": "Supplier",
                "people_name": invoice.supplier.business_name,
            }
        )

    return [*inventory_by_account.values(), *payable_lines]


def _build_purchase_return_lines(purchase_return):
    lines = []
    payable_totals = {}
    inventory_totals = {}
    return_lines = purchase_return.lines.filter(deleted_at__isnull=True).select_related(
        "product__category",
        "product__inventory_account",
        "product__category__inventory_account",
    )
    for line in return_lines:
        tenant_id = line.product.tenant_id
        payable_totals[tenant_id] = payable_totals.get(tenant_id, Decimal("0.00")) + quantize_money(
            line.amount
        )
        inventory_account = _resolve_product_account(line.product, "inventory_account", "inventory_account")
        inventory_key = (tenant_id, inventory_account.id)
        bucket = inventory_totals.setdefault(
            inventory_key,
            {
                "account": inventory_account,
                "tenant_id": tenant_id,
                "debit": Decimal("0.00"),
                "credit": Decimal("0.00"),
            },
        )
        bucket["credit"] += quantize_money(line.amount)

    for tenant_id, amount in payable_totals.items():
        supplier_account = _party_control_account_for_dimension(
            purchase_return.supplier,
            "Supplier",
            tenant_id,
        )
        lines.append(
            {
                "account": supplier_account,
                "tenant_id": tenant_id,
                "debit": amount,
                "credit": Decimal("0.00"),
                "line_description": "Purchase Return Payable Reversal",
                "people_type": "Supplier",
                "people_name": purchase_return.supplier.business_name,
            }
        )

    lines.extend(
        {
            "account": item["account"],
            "tenant_id": item["tenant_id"],
            "debit": Decimal("0.00"),
            "credit": item["credit"],
            "line_description": "Purchase Return Inventory",
        }
        for item in inventory_totals.values()
    )
    return lines


def _build_purchase_bank_payment_lines(payment):
    lines = []
    bank_account = payment.bank_account
    bank_tenant_id = bank_account.tenant_id
    for payment_line in payment.lines.filter(deleted_at__isnull=True).select_related(
        "supplier",
        "purchase_invoice",
    ):
        allocations = _allocate_invoice_amount_by_tenant(
            payment_line.purchase_invoice,
            payment_line.amount,
            _purchase_invoice_weights(payment_line.purchase_invoice),
        )
        for tenant_id, amount in allocations.items():
            supplier_account = _party_control_account_for_dimension(
                payment_line.supplier,
                "Supplier",
                tenant_id,
            )
            lines.append(
                {
                    "account": supplier_account,
                    "tenant_id": tenant_id,
                    "debit": amount,
                    "credit": Decimal("0.00"),
                    "line_description": "Supplier Payment",
                    "people_type": "Supplier",
                    "people_name": payment_line.supplier.business_name,
                }
            )
        lines.append(
            {
                "account": bank_account,
                "tenant_id": bank_tenant_id,
                "debit": Decimal("0.00"),
                "credit": payment_line.amount,
                "line_description": "Bank Payment",
            }
        )
    return lines


def _build_sales_invoice_lines(invoice):
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
                "tenant_id": line.product.tenant_id,
                "weight": line.total_amount,
                "line_description": line.product.name,
            }
        )
        cost_amount = quantize_money(quantize_money(line.quantity) * quantize_money(line.product.net_amount))
        cogs_key = (line.product.tenant_id, cogs_account.id)
        inventory_key = (line.product.tenant_id, inventory_account.id)
        cogs_totals[cogs_key] = cogs_totals.get(
            cogs_key,
            {"account": cogs_account, "tenant_id": line.product.tenant_id, "amount": Decimal("0.00")},
        )
        cogs_totals[cogs_key]["amount"] += cost_amount
        inventory_totals[inventory_key] = inventory_totals.get(
            inventory_key,
            {"account": inventory_account, "tenant_id": line.product.tenant_id, "amount": Decimal("0.00")},
        )
        inventory_totals[inventory_key]["amount"] += cost_amount

    revenue_lines = _allocate_amounts(revenue_weighted, invoice.net_amount)
    revenue_totals = {}
    for line in revenue_lines:
        key = (line["tenant_id"], line["account"].id)
        revenue_totals[key] = revenue_totals.get(
            key,
            {"account": line["account"], "tenant_id": line["tenant_id"], "amount": Decimal("0.00")},
        )
        revenue_totals[key]["amount"] += line["allocated_amount"]

    lines = []
    for item in revenue_totals.values():
        customer_account = _party_control_account_for_dimension(
            invoice.customer,
            "Customer",
            item["tenant_id"],
        )
        lines.append(
            {
                "account": customer_account,
                "tenant_id": item["tenant_id"],
                "debit": item["amount"],
                "credit": Decimal("0.00"),
                "line_description": "Customer Receivable",
                "people_type": "Customer",
                "people_name": invoice.customer.business_name,
            }
        )
    lines.extend(
        {
            "account": item["account"],
            "tenant_id": item["tenant_id"],
            "debit": Decimal("0.00"),
            "credit": item["amount"],
            "line_description": "Sales Revenue",
        }
        for item in revenue_totals.values()
    )
    lines.extend(
        {
            "account": item["account"],
            "tenant_id": item["tenant_id"],
            "debit": item["amount"],
            "credit": Decimal("0.00"),
            "line_description": "Cost of Goods Sold",
        }
        for item in cogs_totals.values()
    )
    lines.extend(
        {
            "account": item["account"],
            "tenant_id": item["tenant_id"],
            "debit": Decimal("0.00"),
            "credit": item["amount"],
            "line_description": "Inventory Reduction",
        }
        for item in inventory_totals.values()
    )
    return lines


def _build_sales_return_lines(sales_return):
    lines = []
    receivable_totals = {}
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
        tenant_id = line.product.tenant_id
        revenue_account = _resolve_product_account(line.product, "revenue_account", "revenue_account")
        cogs_account = _resolve_product_account(line.product, "cogs_account", "cogs_account")
        inventory_account = _resolve_product_account(line.product, "inventory_account", "inventory_account")
        receivable_totals[tenant_id] = receivable_totals.get(tenant_id, Decimal("0.00")) + quantize_money(
            line.amount
        )
        revenue_key = (tenant_id, revenue_account.id)
        revenue_totals[revenue_key] = revenue_totals.get(
            revenue_key,
            {"account": revenue_account, "tenant_id": tenant_id, "amount": Decimal("0.00")},
        )
        revenue_totals[revenue_key]["amount"] += quantize_money(line.amount)

        cost_amount = quantize_money(quantize_money(line.quantity) * quantize_money(line.product.net_amount))
        inventory_key = (tenant_id, inventory_account.id)
        inventory_totals[inventory_key] = inventory_totals.get(
            inventory_key,
            {"account": inventory_account, "tenant_id": tenant_id, "amount": Decimal("0.00")},
        )
        inventory_totals[inventory_key]["amount"] += cost_amount
        cogs_key = (tenant_id, cogs_account.id)
        cogs_totals[cogs_key] = cogs_totals.get(
            cogs_key,
            {"account": cogs_account, "tenant_id": tenant_id, "amount": Decimal("0.00")},
        )
        cogs_totals[cogs_key]["amount"] += cost_amount

    for tenant_id, amount in receivable_totals.items():
        customer_account = _party_control_account_for_dimension(
            sales_return.customer,
            "Customer",
            tenant_id,
        )
        lines.append(
            {
                "account": customer_account,
                "tenant_id": tenant_id,
                "debit": Decimal("0.00"),
                "credit": amount,
                "line_description": "Customer Receivable Reversal",
                "people_type": "Customer",
                "people_name": sales_return.customer.business_name,
            }
        )

    lines.extend(
        {
            "account": item["account"],
            "tenant_id": item["tenant_id"],
            "debit": item["amount"],
            "credit": Decimal("0.00"),
            "line_description": "Sales Return Revenue Reversal",
        }
        for item in revenue_totals.values()
    )
    lines.extend(
        {
            "account": item["account"],
            "tenant_id": item["tenant_id"],
            "debit": item["amount"],
            "credit": Decimal("0.00"),
            "line_description": "Inventory Return",
        }
        for item in inventory_totals.values()
    )
    lines.extend(
        {
            "account": item["account"],
            "tenant_id": item["tenant_id"],
            "debit": Decimal("0.00"),
            "credit": item["amount"],
            "line_description": "COGS Reversal",
        }
        for item in cogs_totals.values()
    )
    return lines


def _build_sales_bank_receipt_lines(receipt):
    lines = []
    for receipt_line in receipt.lines.filter(deleted_at__isnull=True).select_related(
        "customer",
        "sales_invoice",
        "party_opening_balance",
        "bank_account",
    ):
        bank_account = receipt_line.bank_account
        bank_tenant_id = bank_account.tenant_id
        line_tenant_id = receipt_line.tenant_id or bank_tenant_id

        if (
            receipt_line.receipt_against == receipt_line.ReceiptAgainst.OPENING_BALANCE
            and receipt_line.party_opening_balance_id
        ):
            ar_tenant_id = receipt_line.party_opening_balance.tenant_id or line_tenant_id
            customer_account = _party_control_account_for_dimension(
                receipt_line.customer,
                "Customer",
                ar_tenant_id,
            )
            lines.extend(
                [
                    {
                        "account": bank_account,
                        "tenant_id": bank_tenant_id,
                        "debit": receipt_line.amount,
                        "credit": Decimal("0.00"),
                        "line_description": "Bank Receipt",
                    },
                    {
                        "account": customer_account,
                        "tenant_id": ar_tenant_id,
                        "debit": Decimal("0.00"),
                        "credit": receipt_line.amount,
                        "line_description": "Customer Opening Receipt",
                        "people_type": "Customer",
                        "people_name": receipt_line.customer.business_name,
                    },
                ]
            )
            continue

        # Debit the selected line bank; credit AR in the line's dimension.
        customer_account = _party_control_account_for_dimension(
            receipt_line.customer,
            "Customer",
            line_tenant_id,
        )
        lines.extend(
            [
                {
                    "account": bank_account,
                    "tenant_id": bank_tenant_id,
                    "debit": receipt_line.amount,
                    "credit": Decimal("0.00"),
                    "line_description": "Bank Receipt",
                },
                {
                    "account": customer_account,
                    "tenant_id": line_tenant_id,
                    "debit": Decimal("0.00"),
                    "credit": receipt_line.amount,
                    "line_description": "Customer Receipt",
                    "people_type": "Customer",
                    "people_name": receipt_line.customer.business_name,
                },
            ]
        )
    return lines


def _build_salesman_commission_payment_lines(payment):
    return [
        {
            "account": payment.payable_account,
            "debit": payment.payment,
            "credit": Decimal("0.00"),
            "line_description": "Salesman Commission Payable",
            "people_type": "Salesman",
            "people_name": payment.salesman.name,
        },
        {
            "account": payment.payment_account or payment.payable_account,
            "debit": Decimal("0.00"),
            "credit": payment.payment,
            "line_description": "Salesman Commission Payment",
            "people_type": "Salesman",
            "people_name": payment.salesman.name,
        },
    ]


def _build_expense_lines(expense):
    lines = []
    for expense_line in expense.lines.filter(deleted_at__isnull=True).select_related(
        "bank_account",
        "expense_account",
    ):
        bank_account = expense_line.bank_account
        bank_tenant_id = bank_account.tenant_id
        line_tenant_id = expense_line.tenant_id or bank_tenant_id
        amount = quantize_money(expense_line.amount)
        description = (expense_line.description or "").strip()
        expense_label = description or "Expense"
        payment_label = (
            f"Expense Payment - {description}" if description else "Expense Payment"
        )
        lines.extend(
            [
                {
                    "account": expense_line.expense_account,
                    "tenant_id": line_tenant_id,
                    "debit": amount,
                    "credit": Decimal("0.00"),
                    "line_description": expense_label,
                },
                {
                    "account": bank_account,
                    "tenant_id": bank_tenant_id,
                    "debit": Decimal("0.00"),
                    "credit": amount,
                    "line_description": payment_label,
                },
            ]
        )
    return lines


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


def _receipt_people_name(receipt):
    names = []
    seen = set()
    for line in receipt.lines.filter(deleted_at__isnull=True).select_related("customer"):
        name = (line.customer.business_name or line.customer.name or "").strip()
        if name and name not in seen:
            seen.add(name)
            names.append(name)
    if not names:
        return ""
    if len(names) == 1:
        return names[0]
    return f"{names[0]} +{len(names) - 1}"


def _payment_people_name(payment):
    names = []
    seen = set()
    for line in payment.lines.filter(deleted_at__isnull=True).select_related("supplier"):
        name = (line.supplier.business_name or "").strip()
        if name and name not in seen:
            seen.add(name)
            names.append(name)
    if not names:
        return ""
    if len(names) == 1:
        return names[0]
    return f"{names[0]} +{len(names) - 1}"


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
        people_name=_payment_people_name(payment),
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
        people_name=_receipt_people_name(receipt),
        lines=_build_sales_bank_receipt_lines(receipt),
    )


@transaction.atomic
def sync_salesman_commission_payment_journal(payment):
    return _upsert_journal_entry(
        tenant_id=payment.tenant_id,
        source_type=JournalEntry.SourceType.SALESMAN_COMMISSION_PAYMENT,
        source_id=payment.id,
        date=payment.date,
        reference=payment.voucher_number,
        document_type="Salesman Commission Voucher",
        description=payment.remarks,
        people_type="Salesman",
        people_name=payment.salesman.name,
        lines=_build_salesman_commission_payment_lines(payment),
    )


def _resolve_opening_balance_party_account(party, field_label, tenant_id):
    if party.account_id:
        return _account_for_dimension(party.account, tenant_id)
    return _party_control_account_for_dimension(party, field_label, tenant_id)


def _build_party_opening_balance_lines(opening_balance):
    equity_account = resolve_opening_equity_account(opening_balance.tenant_id)
    amount = quantize_money(opening_balance.amount)
    tenant_id = opening_balance.tenant_id

    if opening_balance.party_type == PartyOpeningBalance.PartyType.CUSTOMER:
        customer = opening_balance.customer
        party_account = _resolve_opening_balance_party_account(
            customer,
            "Customer",
            tenant_id,
        )
        return [
            {
                "account": party_account,
                "debit": amount,
                "credit": Decimal("0.00"),
                "line_description": "Customer Opening Balance",
                "people_type": "Customer",
                "people_name": customer.business_name,
            },
            {
                "account": equity_account,
                "debit": Decimal("0.00"),
                "credit": amount,
                "line_description": "Opening Balance Equity",
            },
        ]

    supplier = opening_balance.supplier
    party_account = _resolve_opening_balance_party_account(
        supplier,
        "Supplier",
        tenant_id,
    )
    return [
        {
            "account": equity_account,
            "debit": amount,
            "credit": Decimal("0.00"),
            "line_description": "Opening Balance Equity",
        },
        {
            "account": party_account,
            "debit": Decimal("0.00"),
            "credit": amount,
            "line_description": "Supplier Opening Balance",
            "people_type": "Supplier",
            "people_name": supplier.business_name,
        },
    ]


def _party_opening_reference(opening_balance):
    prefix = (
        "CUST"
        if opening_balance.party_type == PartyOpeningBalance.PartyType.CUSTOMER
        else "SUP"
    )
    return f"OB-{prefix}-{str(opening_balance.id).split('-')[0].upper()}"


@transaction.atomic
def sync_party_opening_balance_journal(opening_balance):
    opening_balance = PartyOpeningBalance.objects.select_related(
        "customer",
        "supplier",
    ).get(pk=opening_balance.pk)

    if opening_balance.party_type == PartyOpeningBalance.PartyType.CUSTOMER:
        people_type = "Customer"
        people_name = opening_balance.customer.business_name
    else:
        people_type = "Supplier"
        people_name = opening_balance.supplier.business_name

    return _upsert_journal_entry(
        tenant_id=opening_balance.tenant_id,
        source_type=JournalEntry.SourceType.PARTY_OPENING_BALANCE,
        source_id=opening_balance.id,
        date=opening_balance.date,
        reference=_party_opening_reference(opening_balance),
        document_type="Opening Balance",
        description=opening_balance.remarks,
        people_type=people_type,
        people_name=people_name,
        lines=_build_party_opening_balance_lines(opening_balance),
    )


@transaction.atomic
def sync_expense_journal(expense):
    return _upsert_journal_entry(
        tenant_id=expense.tenant_id,
        source_type=JournalEntry.SourceType.EXPENSE,
        source_id=expense.id,
        date=expense.date,
        reference=expense.expense_number,
        document_type="Expense",
        description=expense.remarks,
        people_type="",
        people_name="",
        lines=_build_expense_lines(expense),
    )


def _build_bank_transfer_lines_same_tenant(transfer):
    amount = quantize_money(transfer.amount)
    return [
        {
            "account": transfer.to_bank_account,
            "debit": amount,
            "credit": Decimal("0.00"),
            "line_description": "Bank Transfer In",
        },
        {
            "account": transfer.from_bank_account,
            "debit": Decimal("0.00"),
            "credit": amount,
            "line_description": "Bank Transfer Out",
        },
    ]


def _build_bank_transfer_lines_from(transfer):
    amount = quantize_money(transfer.amount)
    equity_account = resolve_opening_equity_account(transfer.from_bank_account.tenant_id)
    to_label = f"{transfer.to_bank_account.code} - {transfer.to_bank_account.name}"
    return [
        {
            "account": equity_account,
            "debit": amount,
            "credit": Decimal("0.00"),
            "line_description": f"Transfer to {to_label}",
        },
        {
            "account": transfer.from_bank_account,
            "debit": Decimal("0.00"),
            "credit": amount,
            "line_description": "Bank Transfer Out",
        },
    ]


def _build_bank_transfer_lines_to(transfer):
    amount = quantize_money(transfer.amount)
    equity_account = resolve_opening_equity_account(transfer.to_bank_account.tenant_id)
    from_label = f"{transfer.from_bank_account.code} - {transfer.from_bank_account.name}"
    return [
        {
            "account": transfer.to_bank_account,
            "debit": amount,
            "credit": Decimal("0.00"),
            "line_description": "Bank Transfer In",
        },
        {
            "account": equity_account,
            "debit": Decimal("0.00"),
            "credit": amount,
            "line_description": f"Transfer from {from_label}",
        },
    ]


def delete_bank_transfer_journals(transfer):
    delete_journal_entry(
        JournalEntry.SourceType.BANK_TRANSFER,
        transfer.id,
        transfer.from_bank_account.tenant_id,
    )
    if transfer.from_bank_account.tenant_id != transfer.to_bank_account.tenant_id:
        delete_journal_entry(
            JournalEntry.SourceType.BANK_TRANSFER,
            transfer.id,
            transfer.to_bank_account.tenant_id,
        )


@transaction.atomic
def sync_bank_transfer_journal(transfer):
    transfer = BankTransfer.objects.select_related(
        "from_bank_account",
        "to_bank_account",
    ).get(pk=transfer.pk)

    if transfer.from_bank_account.tenant_id == transfer.to_bank_account.tenant_id:
        return _upsert_journal_entry(
            tenant_id=transfer.from_bank_account.tenant_id,
            source_type=JournalEntry.SourceType.BANK_TRANSFER,
            source_id=transfer.id,
            date=transfer.date,
            reference=transfer.transfer_number,
            document_type="Bank Transfer",
            description=transfer.remarks,
            people_type="",
            people_name="",
            lines=_build_bank_transfer_lines_same_tenant(transfer),
        )

    _upsert_journal_entry(
        tenant_id=transfer.from_bank_account.tenant_id,
        source_type=JournalEntry.SourceType.BANK_TRANSFER,
        source_id=transfer.id,
        date=transfer.date,
        reference=transfer.transfer_number,
        document_type="Bank Transfer",
        description=transfer.remarks,
        people_type="",
        people_name="",
        lines=_build_bank_transfer_lines_from(transfer),
    )
    return _upsert_journal_entry(
        tenant_id=transfer.to_bank_account.tenant_id,
        source_type=JournalEntry.SourceType.BANK_TRANSFER,
        source_id=transfer.id,
        date=transfer.date,
        reference=transfer.transfer_number,
        document_type="Bank Transfer",
        description=transfer.remarks,
        people_type="",
        people_name="",
        lines=_build_bank_transfer_lines_to(transfer),
    )


@transaction.atomic
def sync_all_journals():
    for invoice in PurchaseInvoice.objects.filter(deleted_at__isnull=True).select_related("supplier"):
        sync_purchase_invoice_journal(invoice)
    for purchase_return in PurchaseReturn.objects.filter(deleted_at__isnull=True).select_related("supplier"):
        sync_purchase_return_journal(purchase_return)
    for payment in PurchaseBankPayment.objects.filter(deleted_at__isnull=True).select_related(
        "bank_account"
    ).prefetch_related("lines__supplier", "lines__purchase_invoice"):
        sync_purchase_bank_payment_journal(payment)
    for invoice in SalesInvoice.objects.filter(deleted_at__isnull=True).select_related("customer"):
        sync_sales_invoice_journal(invoice)
    for sales_return in SalesReturn.objects.filter(deleted_at__isnull=True).select_related("customer"):
        sync_sales_return_journal(sales_return)
    for receipt in SalesBankReceipt.objects.filter(deleted_at__isnull=True).prefetch_related(
        "lines__customer",
        "lines__sales_invoice",
        "lines__party_opening_balance",
        "lines__bank_account",
    ):
        sync_sales_bank_receipt_journal(receipt)
    for expense in Expense.objects.filter(deleted_at__isnull=True).prefetch_related(
        "lines__bank_account",
        "lines__expense_account",
    ):
        sync_expense_journal(expense)
    for transfer in BankTransfer.objects.filter(deleted_at__isnull=True).select_related(
        "from_bank_account",
        "to_bank_account",
    ):
        sync_bank_transfer_journal(transfer)
    for opening_balance in PartyOpeningBalance.objects.filter(
        deleted_at__isnull=True,
    ).select_related("customer", "supplier"):
        sync_party_opening_balance_journal(opening_balance)
