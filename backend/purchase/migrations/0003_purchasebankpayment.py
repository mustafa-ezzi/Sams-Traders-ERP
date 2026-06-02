from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_account"),
        ("inventory", "0006_productstock_production"),
        ("purchase", "0002_purchasereturn_and_lines"),
    ]

    operations = [
        migrations.CreateModel(
            name="PurchaseBankPayment",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("tenant_id", models.CharField(max_length=50)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("payment_number", models.CharField(max_length=50)),
                ("date", models.DateField()),
                ("amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("remarks", models.TextField(blank=True, default="")),
                (
                    "bank_account",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="purchase_bank_payments",
                        to="accounts.account",
                    ),
                ),
                (
                    "purchase_invoice",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="bank_payments",
                        to="purchase.purchaseinvoice",
                    ),
                ),
                (
                    "supplier",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="purchase_bank_payments",
                        to="inventory.supplier",
                    ),
                ),
            ],
            options={
                "ordering": ["-date", "-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="purchasebankpayment",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("tenant_id", "payment_number"),
                name="unique_active_purchase_bank_payment_number_per_tenant",
            ),
        ),
    ]
