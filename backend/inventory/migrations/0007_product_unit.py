import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0006_productstock_production"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="unit",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                to="inventory.unit",
            ),
        ),
    ]
