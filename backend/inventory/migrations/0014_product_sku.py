from django.db import migrations, models
from django.db.models import Q


def backfill_product_skus(apps, schema_editor):
    Product = apps.get_model("inventory", "Product")

    tenant_ids = (
        Product.objects.filter(deleted_at__isnull=True)
        .values_list("tenant_id", flat=True)
        .distinct()
    )

    for tenant_id in tenant_ids:
        products = Product.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ).order_by("created_at", "id")

        next_number = 1
        used_skus = set(
            products.exclude(sku="")
            .values_list("sku", flat=True)
        )

        for product in products:
            if product.sku:
                continue

            while True:
                sku = f"SKU-{next_number:04d}"
                next_number += 1
                if sku not in used_skus:
                    break

            product.sku = sku
            product.save(update_fields=["sku"])
            used_skus.add(sku)


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0013_productmaterial_assembly_component_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="sku",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.RunPython(backfill_product_skus, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="product",
            constraint=models.UniqueConstraint(
                condition=Q(deleted_at__isnull=True) & ~Q(sku=""),
                fields=("tenant_id", "sku"),
                name="unique_active_product_sku_per_tenant",
            ),
        ),
    ]
