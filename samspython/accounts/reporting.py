from datetime import date
from decimal import Decimal

from accounts.models import Account
from inventory.models import Customer, Supplier
from purchase.models import PurchaseBankPayment, PurchaseInvoice, PurchaseReturn
from sales.models import SalesBankReceipt, SalesInvoice, SalesReturn


def _money(value):
    return Decimal(value or 0).quantize(Decimal("0.01"))


def get_descendant_account_ids(account):
    ids = [account.id]
    children = account.children.filter(deleted_at__isnull=True)
    for child in children:
        ids.extend(get_descendant_account_ids(child))
    return ids


def _serialize_row(doc_id, tx_date, document_type, people_type, remarks, debit=0, credit=0):
    return {
        "id": doc_id,
        "date": tx_date.isoformat() if isinstance(tx_date, date) else str(tx_date),
        "document_type": document_type,
        "people_type": people_type,
        "remarks": remarks or "",
        "debit": str(_money(debit)),
        "credit": str(_money(credit)),
    }


def build_supplier_ledger(supplier, from_date, to_date):
    rows = []

    for invoice in PurchaseInvoice.objects.filter(
        tenant_id=supplier.tenant_id,
        supplier=supplier,
        deleted_at__isnull=True,
        date__gte=from_date,
        date__lte=to_date,
    ):
        rows.append(
            _serialize_row(
                invoice.invoice_number,
                invoice.date,
                "Purchase Invoice",
                "Supplier",
                invoice.remarks,
                debit=0,
                credit=invoice.net_amount,
            )
        )

    for purchase_return in PurchaseReturn.objects.filter(
        tenant_id=supplier.tenant_id,
        supplier=supplier,
        deleted_at__isnull=True,
        date__gte=from_date,
        date__lte=to_date,
    ):
        rows.append(
            _serialize_row(
                purchase_return.return_number,
                purchase_return.date,
                "Purchase Return",
                "Supplier",
                purchase_return.remarks,
                debit=purchase_return.gross_amount,
                credit=0,
            )
        )

    for payment in PurchaseBankPayment.objects.filter(
        tenant_id=supplier.tenant_id,
        supplier=supplier,
        deleted_at__isnull=True,
        date__gte=from_date,
        date__lte=to_date,
    ):
        rows.append(
            _serialize_row(
                payment.payment_number,
                payment.date,
                "Bank Payment",
                "Supplier",
                payment.remarks,
                debit=payment.amount,
                credit=0,
            )
        )

    return rows


def build_customer_ledger(customer, from_date, to_date):
    rows = []

    for invoice in SalesInvoice.objects.filter(
        tenant_id=customer.tenant_id,
        customer=customer,
        deleted_at__isnull=True,
        date__gte=from_date,
        date__lte=to_date,
    ):
        rows.append(
            _serialize_row(
                invoice.invoice_number,
                invoice.date,
                "Sales Invoice",
                "Customer",
                invoice.remarks,
                debit=invoice.net_amount,
                credit=0,
            )
        )

    for sales_return in SalesReturn.objects.filter(
        tenant_id=customer.tenant_id,
        customer=customer,
        deleted_at__isnull=True,
        date__gte=from_date,
        date__lte=to_date,
    ):
        rows.append(
            _serialize_row(
                sales_return.return_number,
                sales_return.date,
                "Sales Return",
                "Customer",
                sales_return.remarks,
                debit=0,
                credit=sales_return.gross_amount,
            )
        )

    for receipt in SalesBankReceipt.objects.filter(
        tenant_id=customer.tenant_id,
        customer=customer,
        deleted_at__isnull=True,
        date__gte=from_date,
        date__lte=to_date,
    ):
        rows.append(
            _serialize_row(
                receipt.receipt_number,
                receipt.date,
                "Bank Receipt",
                "Customer",
                receipt.remarks,
                debit=0,
                credit=receipt.amount,
            )
        )

    return rows


def build_account_ledger(account, from_date, to_date):
    rows = []

    for supplier in Supplier.objects.filter(
        tenant_id=account.tenant_id,
        account=account,
        deleted_at__isnull=True,
    ):
        rows.extend(build_supplier_ledger(supplier, from_date, to_date))

    for customer in Customer.objects.filter(
        tenant_id=account.tenant_id,
        account=account,
        deleted_at__isnull=True,
    ):
        rows.extend(build_customer_ledger(customer, from_date, to_date))

    for payment in PurchaseBankPayment.objects.filter(
        tenant_id=account.tenant_id,
        bank_account=account,
        deleted_at__isnull=True,
        date__gte=from_date,
        date__lte=to_date,
    ):
        rows.append(
            _serialize_row(
                payment.payment_number,
                payment.date,
                "Bank Payment",
                "Supplier",
                payment.remarks,
                debit=0,
                credit=payment.amount,
            )
        )

    for receipt in SalesBankReceipt.objects.filter(
        tenant_id=account.tenant_id,
        bank_account=account,
        deleted_at__isnull=True,
        date__gte=from_date,
        date__lte=to_date,
    ):
        rows.append(
            _serialize_row(
                receipt.receipt_number,
                receipt.date,
                "Bank Receipt",
                "Customer",
                receipt.remarks,
                debit=receipt.amount,
                credit=0,
            )
        )

    return rows


def build_ledger_report(tenant_id, ledger_type, ledger_id, from_date, to_date):
    if ledger_type == "supplier":
        supplier = Supplier.objects.get(
            id=ledger_id,
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        )
        rows = build_supplier_ledger(supplier, from_date, to_date)
        title = supplier.business_name
    elif ledger_type == "customer":
        customer = Customer.objects.get(
            id=ledger_id,
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        )
        rows = build_customer_ledger(customer, from_date, to_date)
        title = customer.business_name
    else:
        account = Account.objects.get(
            id=ledger_id,
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        )
        rows = build_account_ledger(account, from_date, to_date)
        title = f"{account.code} - {account.name}"

    rows.sort(key=lambda row: (row["date"], row["document_type"], row["id"]))

    total_debit = sum(Decimal(row["debit"]) for row in rows)
    total_credit = sum(Decimal(row["credit"]) for row in rows)

    return {
        "title": title,
        "rows": rows,
        "total_debit": str(_money(total_debit)),
        "total_credit": str(_money(total_credit)),
    }
