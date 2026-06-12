from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0014_dimension_sku_code"),
    ]

    operations = [
        migrations.AlterField(
            model_name="journalentry",
            name="source_type",
            field=models.CharField(
                choices=[
                    ("PURCHASE_INVOICE", "Purchase Invoice"),
                    ("PURCHASE_RETURN", "Purchase Return"),
                    ("PURCHASE_BANK_PAYMENT", "Purchase Bank Payment"),
                    ("SALES_INVOICE", "Sales Invoice"),
                    ("SALES_RETURN", "Sales Return"),
                    ("SALES_BANK_RECEIPT", "Sales Bank Receipt"),
                    ("EXPENSE", "Expense"),
                    ("PARTY_OPENING_BALANCE", "Party Opening Balance"),
                ],
                max_length=40,
            ),
        ),
    ]
