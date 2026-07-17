from django.db.models import Q

from accounts.access_control import filter_queryset_by_allowed_salesmen
from accounts.models import Account, BankTransfer, Expense
from common.tenancy import get_request_tenant_ids, get_shared_tenant_ids
from inventory.models import (
    Customer,
    Product,
    RawMaterial,
    Salesman,
    Supplier,
    Warehouse,
)
from purchase.models import PurchaseBankPayment, PurchaseInvoice, PurchaseReturn
from sales.models import (
    SalesBankReceipt,
    SalesInvoice,
    SalesmanCommissionPayment,
    SalesOrder,
    SalesReturn,
)


def _user_permission_keys(user):
    if getattr(user, "parent_user_id", None):
        return set(user.ui_permissions or [])
    return None


def _can_search(permission_keys, permission_key):
    if permission_keys is None:
        return True
    return permission_key in permission_keys


def _result(*, type_key, id_value, title, subtitle, tenant_id, permission_key, url):
    return {
        "type": type_key,
        "id": str(id_value),
        "title": title or "Untitled",
        "subtitle": subtitle or "",
        "tenant_id": tenant_id or "",
        "permission_key": permission_key,
        "url": url,
    }


def _limit_qs(queryset, limit):
    return list(queryset[:limit])


def search_app(request, query, limit=5):
    query = (query or "").strip()
    if len(query) < 2:
        return {"query": query, "results": []}

    user = request.user
    permission_keys = _user_permission_keys(user)
    view_tenant_ids = get_request_tenant_ids(request)
    shared_tenant_ids = get_shared_tenant_ids(request)
    results = []

    def add_group(items):
        results.extend(items)

    # Customers
    if _can_search(permission_keys, "customers"):
        rows = _limit_qs(
            Customer.objects.filter(
                tenant_id__in=shared_tenant_ids,
                deleted_at__isnull=True,
            )
            .filter(
                Q(name__icontains=query)
                | Q(business_name__icontains=query)
                | Q(phone_number__icontains=query)
                | Q(email__icontains=query)
            )
            .order_by("business_name", "name"),
            limit,
        )
        add_group(
            [
                _result(
                    type_key="customer",
                    id_value=row.id,
                    title=row.business_name or row.name,
                    subtitle=row.phone_number or row.email or row.tenant_id,
                    tenant_id=row.tenant_id,
                    permission_key="customers",
                    url=f"/customers/{row.id}/edit",
                )
                for row in rows
            ]
        )

    # Suppliers
    if _can_search(permission_keys, "suppliers"):
        rows = _limit_qs(
            Supplier.objects.filter(
                tenant_id__in=shared_tenant_ids,
                deleted_at__isnull=True,
            )
            .filter(
                Q(name__icontains=query)
                | Q(business_name__icontains=query)
                | Q(phone_number__icontains=query)
                | Q(email__icontains=query)
            )
            .order_by("business_name", "name"),
            limit,
        )
        add_group(
            [
                _result(
                    type_key="supplier",
                    id_value=row.id,
                    title=row.business_name or row.name,
                    subtitle=row.phone_number or row.email or row.tenant_id,
                    tenant_id=row.tenant_id,
                    permission_key="suppliers",
                    url=f"/suppliers/{row.id}/edit",
                )
                for row in rows
            ]
        )

    # Products
    if _can_search(permission_keys, "products"):
        rows = _limit_qs(
            Product.objects.filter(
                tenant_id__in=view_tenant_ids,
                deleted_at__isnull=True,
            )
            .filter(Q(name__icontains=query) | Q(sku__icontains=query))
            .order_by("name"),
            limit,
        )
        add_group(
            [
                _result(
                    type_key="product",
                    id_value=row.id,
                    title=row.name,
                    subtitle=f"{row.sku or 'No SKU'} · {row.product_type}",
                    tenant_id=row.tenant_id,
                    permission_key="products",
                    url=f"/products/{row.id}/edit",
                )
                for row in rows
            ]
        )

    # Raw materials
    if _can_search(permission_keys, "raw_materials"):
        rows = _limit_qs(
            RawMaterial.objects.filter(
                tenant_id__in=view_tenant_ids,
                deleted_at__isnull=True,
            )
            .filter(name__icontains=query)
            .select_related("brand")
            .order_by("name"),
            limit,
        )
        add_group(
            [
                _result(
                    type_key="raw_material",
                    id_value=row.id,
                    title=row.name,
                    subtitle=getattr(row.brand, "name", "") or row.tenant_id,
                    tenant_id=row.tenant_id,
                    permission_key="raw_materials",
                    url=f"/raw-materials/{row.id}/edit",
                )
                for row in rows
            ]
        )

    # Warehouses
    if _can_search(permission_keys, "warehouses"):
        rows = _limit_qs(
            Warehouse.objects.filter(
                tenant_id__in=shared_tenant_ids,
                deleted_at__isnull=True,
            )
            .filter(Q(name__icontains=query) | Q(location__icontains=query))
            .order_by("name"),
            limit,
        )
        add_group(
            [
                _result(
                    type_key="warehouse",
                    id_value=row.id,
                    title=row.name,
                    subtitle=row.location or row.tenant_id,
                    tenant_id=row.tenant_id,
                    permission_key="warehouses",
                    url="/warehouses",
                )
                for row in rows
            ]
        )

    # Salesmen
    if _can_search(permission_keys, "salesmen"):
        qs = Salesman.objects.filter(
            tenant_id__in=shared_tenant_ids,
            deleted_at__isnull=True,
        ).filter(
            Q(code__icontains=query)
            | Q(name__icontains=query)
            | Q(email__icontains=query)
            | Q(phone_number__icontains=query)
        )
        qs = filter_queryset_by_allowed_salesmen(qs, user, field_name="id")
        rows = _limit_qs(qs.order_by("code", "name"), limit)
        add_group(
            [
                _result(
                    type_key="salesman",
                    id_value=row.id,
                    title=f"{row.code} - {row.name}" if row.code else row.name,
                    subtitle=row.phone_number or row.email or "",
                    tenant_id=row.tenant_id,
                    permission_key="salesmen",
                    url=f"/salesmen/{row.id}/edit",
                )
                for row in rows
            ]
        )

    # Sales invoices
    if _can_search(permission_keys, "sales_invoices"):
        qs = (
            SalesInvoice.objects.filter(
                tenant_id__in=shared_tenant_ids,
                deleted_at__isnull=True,
            )
            .filter(
                Q(invoice_number__icontains=query)
                | Q(dc_number__icontains=query)
                | Q(order_reference__icontains=query)
                | Q(customer__business_name__icontains=query)
                | Q(warehouse__name__icontains=query)
                | Q(remarks__icontains=query)
            )
            .select_related("customer")
        )
        qs = filter_queryset_by_allowed_salesmen(qs, user)
        rows = _limit_qs(qs.order_by("-date", "-created_at"), limit)
        add_group(
            [
                _result(
                    type_key="sales_invoice",
                    id_value=row.id,
                    title=row.invoice_number,
                    subtitle=f"{getattr(row.customer, 'business_name', '')} · {row.date}",
                    tenant_id=row.tenant_id,
                    permission_key="sales_invoices",
                    url=f"/sales-invoices/{row.id}/edit",
                )
                for row in rows
            ]
        )

    # Sales orders
    if _can_search(permission_keys, "sales_orders"):
        qs = (
            SalesOrder.objects.filter(
                tenant_id__in=shared_tenant_ids,
                deleted_at__isnull=True,
            )
            .filter(
                Q(order_number__icontains=query)
                | Q(dc_number__icontains=query)
                | Q(customer__business_name__icontains=query)
                | Q(warehouse__name__icontains=query)
                | Q(remarks__icontains=query)
            )
            .select_related("customer")
        )
        qs = filter_queryset_by_allowed_salesmen(qs, user)
        rows = _limit_qs(qs.order_by("-date", "-created_at"), limit)
        add_group(
            [
                _result(
                    type_key="sales_order",
                    id_value=row.id,
                    title=row.order_number,
                    subtitle=f"{getattr(row.customer, 'business_name', '')} · {row.date}",
                    tenant_id=row.tenant_id,
                    permission_key="sales_orders",
                    url=f"/sales-orders/{row.id}/edit",
                )
                for row in rows
            ]
        )

    # Sales returns
    if _can_search(permission_keys, "sales_returns"):
        qs = (
            SalesReturn.objects.filter(
                tenant_id__in=shared_tenant_ids,
                deleted_at__isnull=True,
            )
            .filter(
                Q(return_number__icontains=query)
                | Q(sales_invoice__invoice_number__icontains=query)
                | Q(customer__business_name__icontains=query)
                | Q(remarks__icontains=query)
            )
            .select_related("customer", "sales_invoice")
        )
        qs = filter_queryset_by_allowed_salesmen(
            qs, user, field_name="sales_invoice__salesman_id"
        )
        rows = _limit_qs(qs.order_by("-date", "-created_at"), limit)
        add_group(
            [
                _result(
                    type_key="sales_return",
                    id_value=row.id,
                    title=row.return_number,
                    subtitle=f"{getattr(row.customer, 'business_name', '')} · {row.date}",
                    tenant_id=row.tenant_id,
                    permission_key="sales_returns",
                    url=f"/sales-returns/{row.id}/edit",
                )
                for row in rows
            ]
        )

    # Bank receipts
    if _can_search(permission_keys, "sales_bank_receipts"):
        qs = (
            SalesBankReceipt.objects.filter(
                deleted_at__isnull=True,
            )
            .filter(
                Q(tenant_id__in=shared_tenant_ids)
                | Q(lines__tenant_id__in=shared_tenant_ids)
            )
            .filter(
                Q(receipt_number__icontains=query)
                | Q(lines__sales_invoice__invoice_number__icontains=query)
                | Q(lines__customer__business_name__icontains=query)
                | Q(lines__bank_account__name__icontains=query)
                | Q(remarks__icontains=query)
            )
            .distinct()
        )
        qs = filter_queryset_by_allowed_salesmen(
            qs, user, field_name="lines__sales_invoice__salesman_id"
        )
        rows = _limit_qs(qs.order_by("-date", "-created_at"), limit)
        add_group(
            [
                _result(
                    type_key="sales_bank_receipt",
                    id_value=row.id,
                    title=row.receipt_number,
                    subtitle=f"{row.date} · {row.amount}",
                    tenant_id=row.tenant_id,
                    permission_key="sales_bank_receipts",
                    url=f"/sales-bank-receipts/{row.id}/edit",
                )
                for row in rows
            ]
        )

    # Purchase invoices
    if _can_search(permission_keys, "purchase_invoices"):
        rows = _limit_qs(
            PurchaseInvoice.objects.filter(
                tenant_id__in=view_tenant_ids,
                deleted_at__isnull=True,
            )
            .filter(
                Q(invoice_number__icontains=query)
                | Q(supplier__business_name__icontains=query)
                | Q(warehouse__name__icontains=query)
                | Q(remarks__icontains=query)
            )
            .select_related("supplier")
            .order_by("-date", "-created_at"),
            limit,
        )
        add_group(
            [
                _result(
                    type_key="purchase_invoice",
                    id_value=row.id,
                    title=row.invoice_number,
                    subtitle=f"{getattr(row.supplier, 'business_name', '')} · {row.date}",
                    tenant_id=row.tenant_id,
                    permission_key="purchase_invoices",
                    url=f"/purchase-invoices/{row.id}/edit",
                )
                for row in rows
            ]
        )

    # Purchase returns
    if _can_search(permission_keys, "purchase_returns"):
        rows = _limit_qs(
            PurchaseReturn.objects.filter(
                tenant_id__in=view_tenant_ids,
                deleted_at__isnull=True,
            )
            .filter(
                Q(return_number__icontains=query)
                | Q(purchase_invoice__invoice_number__icontains=query)
                | Q(supplier__business_name__icontains=query)
                | Q(remarks__icontains=query)
            )
            .select_related("supplier")
            .order_by("-date", "-created_at"),
            limit,
        )
        add_group(
            [
                _result(
                    type_key="purchase_return",
                    id_value=row.id,
                    title=row.return_number,
                    subtitle=f"{getattr(row.supplier, 'business_name', '')} · {row.date}",
                    tenant_id=row.tenant_id,
                    permission_key="purchase_returns",
                    url=f"/purchase-returns/{row.id}/edit",
                )
                for row in rows
            ]
        )

    # Bank payments
    if _can_search(permission_keys, "purchase_bank_payments"):
        rows = _limit_qs(
            PurchaseBankPayment.objects.filter(
                tenant_id__in=view_tenant_ids,
                deleted_at__isnull=True,
            )
            .filter(
                Q(payment_number__icontains=query)
                | Q(lines__purchase_invoice__invoice_number__icontains=query)
                | Q(lines__supplier__business_name__icontains=query)
                | Q(bank_account__name__icontains=query)
                | Q(remarks__icontains=query)
            )
            .distinct()
            .order_by("-date", "-created_at"),
            limit,
        )
        add_group(
            [
                _result(
                    type_key="purchase_bank_payment",
                    id_value=row.id,
                    title=row.payment_number,
                    subtitle=f"{row.date} · {row.amount}",
                    tenant_id=row.tenant_id,
                    permission_key="purchase_bank_payments",
                    url=f"/purchase-bank-payments/{row.id}/edit",
                )
                for row in rows
            ]
        )

    # Expenses
    if _can_search(permission_keys, "expenses"):
        rows = _limit_qs(
            Expense.objects.filter(
                deleted_at__isnull=True,
            )
            .filter(
                Q(tenant_id__in=view_tenant_ids)
                | Q(lines__tenant_id__in=view_tenant_ids)
            )
            .filter(
                Q(expense_number__icontains=query)
                | Q(lines__bank_account__name__icontains=query)
                | Q(lines__expense_account__name__icontains=query)
                | Q(lines__description__icontains=query)
                | Q(remarks__icontains=query)
            )
            .distinct()
            .order_by("-date", "-created_at"),
            limit,
        )
        add_group(
            [
                _result(
                    type_key="expense",
                    id_value=row.id,
                    title=row.expense_number,
                    subtitle=f"{row.date} · {row.amount}",
                    tenant_id=row.tenant_id,
                    permission_key="expenses",
                    url=f"/expenses/{row.id}/edit",
                )
                for row in rows
            ]
        )

    # Bank transfers
    if _can_search(permission_keys, "bank_transfers"):
        rows = _limit_qs(
            BankTransfer.objects.filter(
                deleted_at__isnull=True,
            )
            .filter(
                Q(from_bank_account__tenant_id__in=shared_tenant_ids)
                | Q(to_bank_account__tenant_id__in=shared_tenant_ids)
            )
            .filter(
                Q(transfer_number__icontains=query)
                | Q(from_bank_account__name__icontains=query)
                | Q(from_bank_account__code__icontains=query)
                | Q(to_bank_account__name__icontains=query)
                | Q(to_bank_account__code__icontains=query)
                | Q(remarks__icontains=query)
            )
            .distinct()
            .order_by("-date", "-created_at"),
            limit,
        )
        add_group(
            [
                _result(
                    type_key="bank_transfer",
                    id_value=row.id,
                    title=row.transfer_number,
                    subtitle=f"{row.date} · {row.amount}",
                    tenant_id=row.tenant_id,
                    permission_key="bank_transfers",
                    url=f"/bank-transfers/{row.id}/edit",
                )
                for row in rows
            ]
        )

    # Commission payments
    if _can_search(permission_keys, "salesman_commission_payments"):
        qs = (
            SalesmanCommissionPayment.objects.filter(
                tenant_id__in=shared_tenant_ids,
                deleted_at__isnull=True,
            )
            .filter(
                Q(voucher_number__icontains=query)
                | Q(salesman__name__icontains=query)
                | Q(salesman__code__icontains=query)
                | Q(sales_invoice__invoice_number__icontains=query)
                | Q(remarks__icontains=query)
            )
            .select_related("salesman", "sales_invoice")
        )
        qs = filter_queryset_by_allowed_salesmen(qs, user)
        rows = _limit_qs(qs.order_by("-date", "-created_at"), limit)
        add_group(
            [
                _result(
                    type_key="salesman_commission_payment",
                    id_value=row.id,
                    title=getattr(row, "voucher_number", None)
                    or f"Commission {row.id}",
                    subtitle=f"{getattr(row.salesman, 'name', '')} · {row.date}",
                    tenant_id=row.tenant_id,
                    permission_key="salesman_commission_payments",
                    url=f"/salesman-commission-payments/{row.id}/edit",
                )
                for row in rows
            ]
        )

    # Chart of accounts
    if _can_search(permission_keys, "accounts"):
        rows = _limit_qs(
            Account.objects.filter(
                tenant_id__in=shared_tenant_ids,
                deleted_at__isnull=True,
            )
            .filter(Q(code__icontains=query) | Q(name__icontains=query))
            .order_by("code", "name"),
            limit,
        )
        add_group(
            [
                _result(
                    type_key="account",
                    id_value=row.id,
                    title=f"{row.code} - {row.name}",
                    subtitle=row.account_group or row.tenant_id,
                    tenant_id=row.tenant_id,
                    permission_key="accounts",
                    url=f"/accounts/{row.id}/edit",
                )
                for row in rows
            ]
        )

    return {"query": query, "results": results}
