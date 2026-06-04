from django.db import migrations, models


def backfill_dimension_sku_codes(apps, schema_editor):
    Dimension = apps.get_model("accounts", "Dimension")
    for dimension in Dimension.objects.all():
        if dimension.sku_code:
            continue
        dimension.sku_code = (dimension.code or "SKU").strip().upper()[:20]
        dimension.save(update_fields=["sku_code"])


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0013_user_tenant_child_and_permissions"),
    ]

    operations = [
        migrations.AddField(
            model_name="dimension",
            name="sku_code",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.RunPython(backfill_dimension_sku_codes, migrations.RunPython.noop),
    ]
