# Generated manually for Journal Voucher feature

import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0022_auditlog"),
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
                    ("SALESMAN_COMMISSION_PAYMENT", "Salesman Commission Payment"),
                    ("EXPENSE", "Expense"),
                    ("PARTY_OPENING_BALANCE", "Party Opening Balance"),
                    ("BANK_TRANSFER", "Bank Transfer"),
                    ("JOURNAL_VOUCHER", "Journal Voucher"),
                ],
                max_length=40,
            ),
        ),
        migrations.CreateModel(
            name="JournalVoucher",
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
                ("voucher_number", models.CharField(max_length=50)),
                ("date", models.DateField()),
                (
                    "amount",
                    models.DecimalField(decimal_places=2, default=0, max_digits=12),
                ),
                ("remarks", models.TextField(blank=True, default="")),
            ],
            options={
                "ordering": ["-date", "-created_at"],
            },
        ),
        migrations.CreateModel(
            name="JournalVoucherLine",
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
                    "debit",
                    models.DecimalField(decimal_places=2, default=0, max_digits=12),
                ),
                (
                    "credit",
                    models.DecimalField(decimal_places=2, default=0, max_digits=12),
                ),
                ("description", models.CharField(blank=True, default="", max_length=255)),
                (
                    "account",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="journal_voucher_lines",
                        to="accounts.account",
                    ),
                ),
                (
                    "voucher",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="lines",
                        to="accounts.journalvoucher",
                    ),
                ),
            ],
            options={
                "ordering": ["created_at", "id"],
            },
        ),
        migrations.AddConstraint(
            model_name="journalvoucher",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("tenant_id", "voucher_number"),
                name="unique_active_journal_voucher_number_per_tenant",
            ),
        ),
    ]
