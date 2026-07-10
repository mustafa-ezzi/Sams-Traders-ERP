from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0018_partyopeningbalance"),
        ("sales", "0011_salesbankreceipt_recovery_commission"),
    ]

    operations = [
        migrations.AddField(
            model_name="salesbankreceipt",
            name="party_opening_balance",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="sales_bank_receipts",
                to="inventory.partyopeningbalance",
            ),
        ),
        migrations.AddField(
            model_name="salesbankreceipt",
            name="receipt_against",
            field=models.CharField(
                choices=[("INVOICE", "Invoice"), ("OPENING_BALANCE", "Opening Balance")],
                default="INVOICE",
                max_length=30,
            ),
        ),
        migrations.AlterField(
            model_name="salesbankreceipt",
            name="sales_invoice",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="bank_receipts",
                to="sales.salesinvoice",
            ),
        ),
    ]

