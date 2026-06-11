from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0006_salesinvoice_dc_number"),
    ]

    operations = [
        migrations.AddField(
            model_name="salesinvoice",
            name="due_date",
            field=models.DateField(blank=True, null=True),
        ),
    ]
