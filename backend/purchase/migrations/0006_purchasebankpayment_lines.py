import django.db.models.deletion
import uuid
from django.db import migrations, models


def migrate_payment_lines(apps, schema_editor):
    PurchaseBankPayment = apps.get_model("purchase", "PurchaseBankPayment")
    PurchaseBankPaymentLine = apps.get_model("purchase", "PurchaseBankPaymentLine")

    for payment in PurchaseBankPayment.objects.all().iterator():
        if PurchaseBankPaymentLine.objects.filter(payment_id=payment.id).exists():
            continue
        if not payment.supplier_id or not payment.purchase_invoice_id:
            continue
        PurchaseBankPaymentLine.objects.create(
            tenant_id=payment.tenant_id,
            payment_id=payment.id,
            supplier_id=payment.supplier_id,
            purchase_invoice_id=payment.purchase_invoice_id,
            amount=payment.amount,
            deleted_at=payment.deleted_at,
        )


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0012_customer_supplier_phone_optional"),
        ("purchase", "0005_purchaseinvoice_due_date"),
    ]

    operations = [
        migrations.CreateModel(
            name="PurchaseBankPaymentLine",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("tenant_id", models.CharField(max_length=50)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                (
                    "payment",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="lines",
                        to="purchase.purchasebankpayment",
                    ),
                ),
                (
                    "purchase_invoice",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="bank_payment_lines",
                        to="purchase.purchaseinvoice",
                    ),
                ),
                (
                    "supplier",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="purchase_bank_payment_lines",
                        to="inventory.supplier",
                    ),
                ),
            ],
            options={
                "ordering": ["created_at"],
            },
        ),
        migrations.RunPython(migrate_payment_lines, migrations.RunPython.noop),
        migrations.RemoveField(model_name="purchasebankpayment", name="purchase_invoice"),
        migrations.RemoveField(model_name="purchasebankpayment", name="supplier"),
    ]
