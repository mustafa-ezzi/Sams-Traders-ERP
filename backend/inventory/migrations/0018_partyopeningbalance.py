import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0017_salesman"),
    ]

    operations = [
        migrations.CreateModel(
            name="PartyOpeningBalance",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("tenant_id", models.CharField(max_length=50)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                (
                    "party_type",
                    models.CharField(
                        choices=[("CUSTOMER", "Customer"), ("SUPPLIER", "Supplier")],
                        max_length=20,
                    ),
                ),
                ("date", models.DateField()),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("remarks", models.TextField(blank=True, default="")),
                (
                    "customer",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="opening_balances",
                        to="inventory.customer",
                    ),
                ),
                (
                    "supplier",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="opening_balances",
                        to="inventory.supplier",
                    ),
                ),
            ],
            options={
                "ordering": ["-date", "-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="partyopeningbalance",
            constraint=models.UniqueConstraint(
                condition=models.Q(("customer__isnull", False), ("deleted_at__isnull", True)),
                fields=("tenant_id", "customer"),
                name="unique_active_customer_opening_balance",
            ),
        ),
        migrations.AddConstraint(
            model_name="partyopeningbalance",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True), ("supplier__isnull", False)),
                fields=("tenant_id", "supplier"),
                name="unique_active_supplier_opening_balance",
            ),
        ),
    ]
