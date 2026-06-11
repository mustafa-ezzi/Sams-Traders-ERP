from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0005_sales_invoice_salesman_commission"),
    ]

    operations = [
        migrations.AddField(
            model_name="salesinvoice",
            name="dc_number",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
    ]
