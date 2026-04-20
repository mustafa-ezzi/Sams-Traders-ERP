from django.db.models import Sum

from inventory.models import ProductStock, Production


def sync_product_stock_quantity(tenant_id, warehouse_id, product_id):
    from purchase.models import PurchaseInvoiceLine, PurchaseReturnLine
    from sales.models import SalesInvoiceLine, SalesReturnLine

    production_total = (
        Production.objects.filter(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            product_id=product_id,
            deleted_at__isnull=True,
        ).aggregate(total=Sum("quantity"))["total"]
        or 0
    )

    purchased_total = (
        PurchaseInvoiceLine.objects.filter(
            tenant_id=tenant_id,
            product_id=product_id,
            deleted_at__isnull=True,
            invoice__tenant_id=tenant_id,
            invoice__warehouse_id=warehouse_id,
            invoice__deleted_at__isnull=True,
        ).aggregate(total=Sum("quantity"))["total"]
        or 0
    )

    returned_total = (
        PurchaseReturnLine.objects.filter(
            tenant_id=tenant_id,
            product_id=product_id,
            deleted_at__isnull=True,
            purchase_return__tenant_id=tenant_id,
            purchase_return__purchase_invoice__warehouse_id=warehouse_id,
            purchase_return__deleted_at__isnull=True,
            purchase_return__purchase_invoice__deleted_at__isnull=True,
        ).aggregate(total=Sum("quantity"))["total"]
        or 0
    )

    sold_total = (
        SalesInvoiceLine.objects.filter(
            tenant_id=tenant_id,
            product_id=product_id,
            deleted_at__isnull=True,
            invoice__tenant_id=tenant_id,
            invoice__warehouse_id=warehouse_id,
            invoice__deleted_at__isnull=True,
        ).aggregate(total=Sum("quantity"))["total"]
        or 0
    )

    sales_return_total = (
        SalesReturnLine.objects.filter(
            tenant_id=tenant_id,
            product_id=product_id,
            deleted_at__isnull=True,
            sales_return__tenant_id=tenant_id,
            sales_return__sales_invoice__warehouse_id=warehouse_id,
            sales_return__deleted_at__isnull=True,
            sales_return__sales_invoice__deleted_at__isnull=True,
        ).aggregate(total=Sum("quantity"))["total"]
        or 0
    )

    total_quantity = production_total + purchased_total - returned_total - sold_total + sales_return_total

    stock, _ = ProductStock.objects.get_or_create(
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        deleted_at__isnull=True,
        defaults={"quantity": total_quantity},
    )
    stock.quantity = total_quantity
    stock.deleted_at = None
    stock.save(update_fields=["quantity", "deleted_at", "updated_at"])

    return stock
