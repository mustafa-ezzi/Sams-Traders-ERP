from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0012_customer_supplier_phone_optional"),
    ]

    operations = [
        migrations.AlterField(
            model_name="productmaterial",
            name="component_type",
            field=models.CharField(
                choices=[
                    ("RAW_MATERIAL", "Raw Material"),
                    ("FINISHED_GOOD", "Finished Good"),
                    ("ASSEMBLY_PRODUCT", "Assembly Product"),
                ],
                default="RAW_MATERIAL",
                max_length=20,
            ),
        ),
    ]
