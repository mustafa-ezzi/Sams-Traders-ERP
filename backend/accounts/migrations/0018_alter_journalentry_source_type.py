from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0017_banktransfer"),
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
                    ("SALESMAN_COMMISSION_PAYMENT", "Salesman Commission Payment"),
                    ("EXPENSE", "Expense"),
                    ("PARTY_OPENING_BALANCE", "Party Opening Balance"),
                    ("BANK_TRANSFER", "Bank Transfer"),
                ],
                max_length=40,
            ),
        ),
    ]
