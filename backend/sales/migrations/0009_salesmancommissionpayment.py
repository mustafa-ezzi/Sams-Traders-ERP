from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0017_banktransfer"),
        ("sales", "0008_salesinvoice_order_reference_salesorder_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="SalesmanCommissionPayment",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("tenant_id", models.CharField(max_length=50)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("voucher_number", models.CharField(max_length=50)),
                ("date", models.DateField()),
                ("payment", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("remarks", models.TextField(blank=True, default="")),
                (
                    "payable_account",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="salesman_commission_payments",
                        to="accounts.account",
                    ),
                ),
                (
                    "sales_invoice",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="salesman_commission_payments",
                        to="sales.salesinvoice",
                    ),
                ),
                (
                    "salesman",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="commission_payments",
                        to="inventory.salesman",
                    ),
                ),
            ],
            options={
                "ordering": ["-date", "-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="salesmancommissionpayment",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("tenant_id", "voucher_number"),
                name="unique_active_salesman_commission_voucher_per_tenant",
            ),
        ),
    ]
