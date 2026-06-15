import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0016_dimension_company_profile"),
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
                    ("EXPENSE", "Expense"),
                    ("PARTY_OPENING_BALANCE", "Party Opening Balance"),
                    ("BANK_TRANSFER", "Bank Transfer"),
                ],
                max_length=40,
            ),
        ),
        migrations.CreateModel(
            name="BankTransfer",
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
                ("transfer_number", models.CharField(max_length=50)),
                ("date", models.DateField()),
                ("amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("remarks", models.TextField(blank=True, default="")),
                (
                    "from_bank_account",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="outgoing_bank_transfers",
                        to="accounts.account",
                    ),
                ),
                (
                    "to_bank_account",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="incoming_bank_transfers",
                        to="accounts.account",
                    ),
                ),
            ],
            options={
                "ordering": ["-date", "-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="banktransfer",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("tenant_id", "transfer_number"),
                name="unique_active_bank_transfer_number_per_tenant",
            ),
        ),
    ]
