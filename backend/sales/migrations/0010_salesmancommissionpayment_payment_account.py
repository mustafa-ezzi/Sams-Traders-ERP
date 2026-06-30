from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0018_alter_journalentry_source_type"),
        ("sales", "0009_salesmancommissionpayment"),
    ]

    operations = [
        migrations.AddField(
            model_name="salesmancommissionpayment",
            name="payment_account",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="salesman_commission_paid_vouchers",
                to="accounts.account",
            ),
        ),
    ]
