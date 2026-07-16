import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0018_partyopeningbalance"),
        ("purchase", "0006_purchasebankpayment_lines"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchasebankpaymentline",
            name="payment_against",
            field=models.CharField(
                choices=[("INVOICE", "Invoice"), ("OPENING_BALANCE", "Opening Balance")],
                default="INVOICE",
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name="purchasebankpaymentline",
            name="party_opening_balance",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="purchase_bank_payment_lines",
                to="inventory.partyopeningbalance",
            ),
        ),
        migrations.AlterField(
            model_name="purchasebankpaymentline",
            name="purchase_invoice",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="bank_payment_lines",
                to="purchase.purchaseinvoice",
            ),
        ),
    ]
