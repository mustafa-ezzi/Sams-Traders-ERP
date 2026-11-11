from django.db import migrations, models


def backfill_paid_dates_and_resync(apps, schema_editor):
    SalesmanCommissionPayment = apps.get_model("sales", "SalesmanCommissionPayment")
    SalesmanCommissionPayment.objects.filter(
        deleted_at__isnull=True,
        payment_account_id__isnull=False,
        paid_date__isnull=True,
    ).update(paid_date=models.F("date"))

    try:
        from accounts.journal import sync_salesman_commission_payment_journal
        from sales.models import SalesmanCommissionPayment as LivePayment
    except Exception:
        return

    for payment in LivePayment.objects.filter(deleted_at__isnull=True).select_related(
        "salesman",
        "payable_account",
        "payment_account",
    ):
        try:
            sync_salesman_commission_payment_journal(payment)
        except Exception:
            continue


def noop(apps, schema_editor):
    return None


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0025_journalentry_commission_settlement"),
        ("sales", "0015_commission_voucher_lines_and_per_day"),
    ]

    operations = [
        migrations.AddField(
            model_name="salesmancommissionpayment",
            name="paid_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_paid_dates_and_resync, noop),
    ]
