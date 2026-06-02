from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0011_productmaterial_component_product_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="customer",
            name="phone_number",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
        migrations.AlterField(
            model_name="supplier",
            name="phone_number",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
    ]
