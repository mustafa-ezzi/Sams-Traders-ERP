import django.db.models.deletion
import uuid
from django.db import migrations, models


def migrate_receipt_lines(apps, schema_editor):
    SalesBankReceipt = apps.get_model("sales", "SalesBankReceipt")
    SalesBankReceiptLine = apps.get_model("sales", "SalesBankReceiptLine")

    for receipt in SalesBankReceipt.objects.all().iterator():
        if SalesBankReceiptLine.objects.filter(receipt_id=receipt.id).exists():
            continue
        if not receipt.customer_id:
            continue
        SalesBankReceiptLine.objects.create(
            tenant_id=receipt.tenant_id,
            receipt_id=receipt.id,
            customer_id=receipt.customer_id,
            receipt_against=receipt.receipt_against or "INVOICE",
            sales_invoice_id=receipt.sales_invoice_id,
            party_opening_balance_id=receipt.party_opening_balance_id,
            salesman_id=receipt.salesman_id,
            amount=receipt.amount,
            recovery_commission_rate=receipt.recovery_commission_rate,
            recovery_commission_amount=receipt.recovery_commission_amount,
            deleted_at=receipt.deleted_at,
        )


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0018_partyopeningbalance"),
        ("sales", "0012_salesbankreceipt_opening_balance"),
    ]

    operations = [
        migrations.CreateModel(
            name="SalesBankReceiptLine",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("tenant_id", models.CharField(max_length=50)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                (
                    "receipt_against",
                    models.CharField(
                        choices=[
                            ("INVOICE", "Invoice"),
                            ("OPENING_BALANCE", "Opening Balance"),
                        ],
                        default="INVOICE",
                        max_length=30,
                    ),
                ),
                ("amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                (
                    "recovery_commission_rate",
                    models.DecimalField(decimal_places=2, default=0, max_digits=5),
                ),
                (
                    "recovery_commission_amount",
                    models.DecimalField(decimal_places=2, default=0, max_digits=12),
                ),
                (
                    "customer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="sales_bank_receipt_lines",
                        to="inventory.customer",
                    ),
                ),
                (
                    "party_opening_balance",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="sales_bank_receipt_lines",
                        to="inventory.partyopeningbalance",
                    ),
                ),
                (
                    "receipt",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="lines",
                        to="sales.salesbankreceipt",
                    ),
                ),
                (
                    "sales_invoice",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="bank_receipt_lines",
                        to="sales.salesinvoice",
                    ),
                ),
                (
                    "salesman",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="recovery_bank_receipt_lines",
                        to="inventory.salesman",
                    ),
                ),
            ],
            options={
                "ordering": ["created_at"],
            },
        ),
        migrations.RunPython(migrate_receipt_lines, migrations.RunPython.noop),
        migrations.RemoveField(model_name="salesbankreceipt", name="customer"),
        migrations.RemoveField(model_name="salesbankreceipt", name="party_opening_balance"),
        migrations.RemoveField(model_name="salesbankreceipt", name="receipt_against"),
        migrations.RemoveField(model_name="salesbankreceipt", name="recovery_commission_amount"),
        migrations.RemoveField(model_name="salesbankreceipt", name="recovery_commission_rate"),
        migrations.RemoveField(model_name="salesbankreceipt", name="sales_invoice"),
        migrations.RemoveField(model_name="salesbankreceipt", name="salesman"),
    ]
