import uuid
from collections import defaultdict

from django.db import migrations, models
import django.db.models.deletion
from django.utils import timezone


def backfill_commission_lines(apps, schema_editor):
    Payment = apps.get_model("sales", "SalesmanCommissionPayment")
    Line = apps.get_model("sales", "SalesmanCommissionPaymentLine")
    for payment in Payment.objects.filter(
        deleted_at__isnull=True,
        sales_invoice_id__isnull=False,
    ).iterator():
        if Line.objects.filter(payment_id=payment.id, deleted_at__isnull=True).exists():
            continue
        Line.objects.create(
            id=uuid.uuid4(),
            tenant_id=payment.tenant_id,
            payment_id=payment.id,
            sales_invoice_id=payment.sales_invoice_id,
            amount=payment.payment,
        )


def dedupe_salesman_day_vouchers(apps, schema_editor):
    """Keep one active voucher per salesman/date; soft-delete the rest."""
    Payment = apps.get_model("sales", "SalesmanCommissionPayment")
    groups = defaultdict(list)
    for payment in Payment.objects.filter(deleted_at__isnull=True).order_by(
        "created_at", "voucher_number"
    ):
        key = (payment.tenant_id, str(payment.salesman_id), str(payment.date))
        groups[key].append(payment)

    now = timezone.now()
    for payments in groups.values():
        if len(payments) <= 1:
            continue
        # Keep the first (oldest); remove later duplicates from the same day.
        for payment in payments[1:]:
            payment.deleted_at = now
            payment.save(update_fields=["deleted_at", "updated_at"])


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0019_user_data_access"),
        ("sales", "0014_salesbankreceiptline_bank_account"),
    ]

    operations = [
        migrations.CreateModel(
            name="SalesmanCommissionPaymentLine",
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
                    "amount",
                    models.DecimalField(decimal_places=2, default=0, max_digits=12),
                ),
                (
                    "payment",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="lines",
                        to="sales.salesmancommissionpayment",
                    ),
                ),
                (
                    "sales_invoice",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="salesman_commission_payment_lines",
                        to="sales.salesinvoice",
                    ),
                ),
            ],
            options={
                "ordering": ["created_at"],
            },
        ),
        migrations.AlterField(
            model_name="salesmancommissionpayment",
            name="sales_invoice",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="salesman_commission_payments",
                to="sales.salesinvoice",
            ),
        ),
        migrations.RunPython(backfill_commission_lines, migrations.RunPython.noop),
        migrations.RunPython(dedupe_salesman_day_vouchers, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="salesmancommissionpaymentline",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("payment", "sales_invoice"),
                name="unique_active_commission_line_per_invoice",
            ),
        ),
        migrations.AddConstraint(
            model_name="salesmancommissionpayment",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("tenant_id", "salesman", "date"),
                name="unique_active_salesman_commission_voucher_per_day",
            ),
        ),
    ]
