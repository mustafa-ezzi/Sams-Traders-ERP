from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0014_product_sku"),
    ]

    operations = [
        migrations.AlterField(
            model_name="product",
            name="sku",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
    ]
