import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchase", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="PurchaseReturn",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("tenant_id", models.CharField(max_length=50)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("return_number", models.CharField(max_length=50)),
                ("date", models.DateField()),
                ("remarks", models.TextField(blank=True, default="")),
                ("gross_amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                (
                    "purchase_invoice",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="returns",
                        to="purchase.purchaseinvoice",
                    ),
                ),
                (
                    "supplier",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="purchase_returns",
                        to="inventory.supplier",
                    ),
                ),
            ],
            options={
                "ordering": ["-date", "-created_at"],
            },
        ),
        migrations.CreateModel(
            name="PurchaseReturnLine",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("tenant_id", models.CharField(max_length=50)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("quantity", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("rate", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                (
                    "product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="purchase_return_lines",
                        to="inventory.product",
                    ),
                ),
                (
                    "purchase_invoice_line",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="return_lines",
                        to="purchase.purchaseinvoiceline",
                    ),
                ),
                (
                    "purchase_return",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="lines",
                        to="purchase.purchasereturn",
                    ),
                ),
            ],
            options={
                "ordering": ["created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="purchasereturn",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("tenant_id", "return_number"),
                name="unique_active_purchase_return_number_per_tenant",
            ),
        ),
    ]
