from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0008_product_confirmed_unit_cost_product_direct_price_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="rawmaterial",
            name="size",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                to="inventory.size",
            ),
        ),
    ]
