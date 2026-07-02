from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0017_salesman"),
        ("sales", "0010_salesmancommissionpayment_payment_account"),
    ]

    operations = [
        migrations.AddField(
            model_name="salesbankreceipt",
            name="salesman",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="recovery_bank_receipts",
                to="inventory.salesman",
            ),
        ),
        migrations.AddField(
            model_name="salesbankreceipt",
            name="recovery_commission_rate",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=5),
        ),
        migrations.AddField(
            model_name="salesbankreceipt",
            name="recovery_commission_amount",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
    ]
