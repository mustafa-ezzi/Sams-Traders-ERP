from decimal import Decimal

from django.db.models import DecimalField, ExpressionWrapper, F, Sum
from django.utils.timezone import now

from inventory.models import ProductCostHistory, ProductCostState, ProductStock, Production, Stock


MONEY = Decimal("0.01")
COST = Decimal("0.0001")


def quantize_money(value):
    return Decimal(str(value or 0)).quantize(MONEY)


def quantize_cost(value):
    return Decimal(str(value or 0)).quantize(COST)


def get_current_product_average_cost(tenant_id, product_id):
    state = ProductCostState.objects.filter(
        tenant_id=tenant_id,
        product_id=product_id,
        deleted_at__isnull=True,
    ).first()
    return state.average_cost if state else Decimal("0.0000")


def _add_product_cost_event(events, *, date, created_at, source_type, source_id, product_id, quantity, unit_cost, total_cost):
    events.append(
        {
            "date": date,
            "created_at": created_at,
            "source_type": source_type,
            "source_id": source_id,
            "product_id": product_id,
            "quantity": Decimal(str(quantity or 0)),
            "unit_cost": Decimal(str(unit_cost or 0)),
            "total_cost": Decimal(str(total_cost or 0)),
        }
    )


def rebuild_product_costing(tenant_id, product_ids):
    from purchase.models import PurchaseInvoiceLine, PurchaseReturnLine
    from sales.models import SalesInvoiceLine, SalesReturnLine

    product_ids = {product_id for product_id in product_ids if product_id}
    for product_id in product_ids:
        events = []

        purchase_lines = (
            PurchaseInvoiceLine.objects.filter(
                tenant_id=tenant_id,
                item_type="FINISHED_GOOD",
                product_id=product_id,
                deleted_at__isnull=True,
                invoice__deleted_at__isnull=True,
            )
            .select_related("invoice")
            .order_by("invoice__date", "created_at", "id")
        )
        for line in purchase_lines:
            quantity = Decimal(str(line.quantity or 0))
            if quantity <= 0:
                continue
            total_cost = quantize_money(line.total_amount)
            unit_cost = quantize_cost(total_cost / quantity)
            _add_product_cost_event(
                events,
                date=line.invoice.date,
                created_at=line.created_at,
                source_type=ProductCostHistory.SourceType.PURCHASE_INVOICE,
                source_id=line.id,
                product_id=product_id,
                quantity=quantity,
                unit_cost=unit_cost,
                total_cost=total_cost,
            )

        productions = (
            Production.objects.filter(
                tenant_id=tenant_id,
                product_id=product_id,
                deleted_at__isnull=True,
            )
            .select_related("product")
            .order_by("date", "created_at", "id")
        )
        for production in productions:
            quantity = Decimal(str(production.quantity or 0))
            if quantity <= 0:
                continue
            unit_cost = quantize_cost(production.product.net_amount)
            total_cost = quantize_money(quantity * unit_cost)
            _add_product_cost_event(
                events,
                date=production.date,
                created_at=production.created_at,
                source_type=ProductCostHistory.SourceType.PRODUCTION,
                source_id=production.id,
                product_id=product_id,
                quantity=quantity,
                unit_cost=unit_cost,
                total_cost=total_cost,
            )

        purchase_return_lines = (
            PurchaseReturnLine.objects.filter(
                tenant_id=tenant_id,
                product_id=product_id,
                deleted_at__isnull=True,
                purchase_return__tenant_id=tenant_id,
                purchase_return__deleted_at__isnull=True,
            )
            .select_related("purchase_return")
            .order_by("purchase_return__date", "created_at", "id")
        )
        for line in purchase_return_lines:
            quantity = Decimal(str(line.quantity or 0))
            if quantity <= 0:
                continue
            total_cost = quantize_money(line.amount)
            unit_cost = quantize_cost(total_cost / quantity)
            _add_product_cost_event(
                events,
                date=line.purchase_return.date,
                created_at=line.created_at,
                source_type=ProductCostHistory.SourceType.PURCHASE_RETURN,
                source_id=line.id,
                product_id=product_id,
                quantity=-quantity,
                unit_cost=unit_cost,
                total_cost=-total_cost,
            )

        sales_lines = (
            SalesInvoiceLine.objects.filter(
                tenant_id=tenant_id,
                product_id=product_id,
                deleted_at__isnull=True,
                invoice__deleted_at__isnull=True,
            )
            .select_related("invoice")
            .order_by("invoice__date", "created_at", "id")
        )
        for line in sales_lines:
            _add_product_cost_event(
                events,
                date=line.invoice.date,
                created_at=line.created_at,
                source_type=ProductCostHistory.SourceType.SALES_INVOICE,
                source_id=line.id,
                product_id=product_id,
                quantity=-Decimal(str(line.quantity or 0)),
                unit_cost=Decimal("0"),
                total_cost=Decimal("0"),
            )

        sales_return_lines = (
            SalesReturnLine.objects.filter(
                tenant_id=tenant_id,
                product_id=product_id,
                deleted_at__isnull=True,
                sales_return__tenant_id=tenant_id,
                sales_return__deleted_at__isnull=True,
            )
            .select_related("sales_return", "sales_invoice_line")
            .order_by("sales_return__date", "created_at", "id")
        )
        for line in sales_return_lines:
            quantity = Decimal(str(line.quantity or 0))
            if quantity <= 0:
                continue
            unit_cost = quantize_cost(line.sales_invoice_line.cost_used)
            total_cost = quantize_money(quantity * unit_cost)
            _add_product_cost_event(
                events,
                date=line.sales_return.date,
                created_at=line.created_at,
                source_type=ProductCostHistory.SourceType.SALES_RETURN,
                source_id=line.id,
                product_id=product_id,
                quantity=quantity,
                unit_cost=unit_cost,
                total_cost=total_cost,
            )

        events.sort(
            key=lambda event: (
                event["date"],
                0 if event["quantity"] > 0 else 1,
                event["created_at"],
                str(event["source_id"]),
            )
        )

        ProductCostHistory.objects.filter(
            tenant_id=tenant_id,
            product_id=product_id,
            deleted_at__isnull=True,
        ).update(deleted_at=now())

        running_quantity = Decimal("0")
        running_value = Decimal("0")
        average_cost = Decimal("0")
        histories = []

        for event in events:
            quantity = event["quantity"]

            if quantity > 0:
                running_quantity += quantity
                running_value += event["total_cost"]
                average_cost = Decimal("0") if running_quantity <= 0 else quantize_cost(running_value / running_quantity)
                unit_cost = quantize_cost(event["unit_cost"])
                total_cost = quantize_money(event["total_cost"])
            else:
                sold_quantity = abs(quantity)
                unit_cost = average_cost
                total_cost = quantize_money(sold_quantity * average_cost)
                running_quantity -= sold_quantity
                running_value -= total_cost
                if running_quantity <= 0:
                    running_quantity = Decimal("0")
                    running_value = Decimal("0")
                    average_cost = Decimal("0")

                if event["source_type"] == ProductCostHistory.SourceType.SALES_INVOICE:
                    SalesInvoiceLine.objects.filter(id=event["source_id"]).update(
                        cost_used=unit_cost,
                        cost_total=total_cost,
                        profit=quantize_money(
                            (
                                SalesInvoiceLine.objects.filter(id=event["source_id"])
                                .values_list("total_amount", flat=True)
                                .first()
                                or Decimal("0")
                            )
                            - total_cost
                        ),
                    )

            histories.append(
                ProductCostHistory(
                    tenant_id=tenant_id,
                    product_id=product_id,
                    date=event["date"],
                    source_type=event["source_type"],
                    source_id=event["source_id"],
                    quantity=quantize_cost(quantity),
                    unit_cost=unit_cost,
                    total_cost=total_cost if quantity > 0 else -total_cost,
                    running_quantity=quantize_cost(running_quantity),
                    running_value=quantize_money(running_value),
                    average_cost_after=average_cost,
                )
            )

        if histories:
            ProductCostHistory.objects.bulk_create(histories)

        state, _ = ProductCostState.objects.get_or_create(
            tenant_id=tenant_id,
            product_id=product_id,
            deleted_at__isnull=True,
            defaults={
                "total_quantity": quantize_cost(running_quantity),
                "total_value": quantize_money(running_value),
                "average_cost": average_cost,
            },
        )
        state.total_quantity = quantize_cost(running_quantity)
        state.total_value = quantize_money(running_value)
        state.average_cost = average_cost
        state.deleted_at = None
        state.save(update_fields=["total_quantity", "total_value", "average_cost", "deleted_at", "updated_at"])


def sync_product_stock_quantity(tenant_id, warehouse_id, product_id):
    from purchase.models import PurchaseInvoiceLine, PurchaseReturnLine
    from sales.models import SalesInvoiceLine, SalesReturnLine
    from inventory.models import ProductMaterial

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
            sales_return__sales_invoice__warehouse_id=warehouse_id,
            sales_return__deleted_at__isnull=True,
            sales_return__sales_invoice__deleted_at__isnull=True,
        ).aggregate(total=Sum("quantity"))["total"]
        or 0
    )

    component_consumption_total = (
        ProductMaterial.objects.filter(
            tenant_id=tenant_id,
            component_type__in=["FINISHED_GOOD", "ASSEMBLY_PRODUCT"],
            component_product_id=product_id,
            deleted_at__isnull=True,
            product__deleted_at__isnull=True,
            product__product_type__in=["ASSEMBLY_PRODUCT", "MANUFACTURED"],
            product__production__tenant_id=tenant_id,
            product__production__warehouse_id=warehouse_id,
            product__production__deleted_at__isnull=True,
        ).aggregate(
            total=Sum(
                ExpressionWrapper(
                    F("quantity") * F("product__production__quantity"),
                    output_field=DecimalField(max_digits=18, decimal_places=4),
                )
            )
        )["total"]
        or 0
    )

    total_quantity = (
        production_total
        + purchased_total
        - returned_total
        - sold_total
        + sales_return_total
        - component_consumption_total
    )

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


def sync_raw_material_stock_quantity(tenant_id, warehouse_id, raw_material_id):
    from purchase.models import PurchaseInvoiceLine

    from inventory.models import OpeningStock, ProductMaterial

    opening_total = (
        OpeningStock.objects.filter(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            raw_material_id=raw_material_id,
            deleted_at__isnull=True,
        ).aggregate(total=Sum("quantity"))["total"]
        or 0
    )

    purchased_total = (
        PurchaseInvoiceLine.objects.filter(
            tenant_id=tenant_id,
            item_type="RAW_MATERIAL",
            raw_material_id=raw_material_id,
            deleted_at__isnull=True,
            invoice__tenant_id=tenant_id,
            invoice__warehouse_id=warehouse_id,
            invoice__deleted_at__isnull=True,
        ).aggregate(total=Sum("quantity"))["total"]
        or 0
    )

    consumption_total = (
        ProductMaterial.objects.filter(
            tenant_id=tenant_id,
            component_type="RAW_MATERIAL",
            raw_material_id=raw_material_id,
            deleted_at__isnull=True,
            product__deleted_at__isnull=True,
            product__product_type__in=["ASSEMBLY_PRODUCT", "MANUFACTURED"],
            product__production__tenant_id=tenant_id,
            product__production__warehouse_id=warehouse_id,
            product__production__deleted_at__isnull=True,
        ).aggregate(
            total=Sum(
                ExpressionWrapper(
                    F("quantity") * F("product__production__quantity"),
                    output_field=DecimalField(max_digits=18, decimal_places=4),
                )
            )
        )["total"]
        or 0
    )

    total_quantity = opening_total + purchased_total - consumption_total

    stock, _ = Stock.objects.get_or_create(
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        raw_material_id=raw_material_id,
        deleted_at__isnull=True,
        defaults={"quantity": total_quantity},
    )
    stock.quantity = total_quantity
    stock.deleted_at = None
    stock.save(update_fields=["quantity", "deleted_at", "updated_at"])
    return stock
