from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_account"),
        ("inventory", "0006_productstock_production"),
        ("sales", "0002_salesreturn_salesreturnline_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="SalesBankReceipt",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("tenant_id", models.CharField(max_length=50)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("receipt_number", models.CharField(max_length=50)),
                ("date", models.DateField()),
                ("amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("remarks", models.TextField(blank=True, default="")),
                (
                    "bank_account",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="sales_bank_receipts",
                        to="accounts.account",
                    ),
                ),
                (
                    "customer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="sales_bank_receipts",
                        to="inventory.customer",
                    ),
                ),
                (
                    "sales_invoice",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="bank_receipts",
                        to="sales.salesinvoice",
                    ),
                ),
            ],
            options={
                "ordering": ["-date", "-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="salesbankreceipt",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("tenant_id", "receipt_number"),
                name="unique_active_sales_bank_receipt_number_per_tenant",
            ),
        ),
    ]
