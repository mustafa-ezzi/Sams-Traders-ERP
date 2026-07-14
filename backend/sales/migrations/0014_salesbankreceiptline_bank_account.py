import django.db.models.deletion
from django.db import migrations, models


def move_bank_to_lines(apps, schema_editor):
    SalesBankReceipt = apps.get_model("sales", "SalesBankReceipt")
    SalesBankReceiptLine = apps.get_model("sales", "SalesBankReceiptLine")

    for receipt in SalesBankReceipt.objects.all().iterator():
        bank_id = receipt.bank_account_id
        if not bank_id:
            continue
        SalesBankReceiptLine.objects.filter(receipt_id=receipt.id).update(
            bank_account_id=bank_id,
        )
        # Keep line tenant aligned with header when it was copied from header.
        SalesBankReceiptLine.objects.filter(
            receipt_id=receipt.id,
            tenant_id="",
        ).update(tenant_id=receipt.tenant_id)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0019_user_data_access"),
        ("sales", "0013_salesbankreceipt_lines"),
    ]

    operations = [
        migrations.AddField(
            model_name="salesbankreceiptline",
            name="bank_account",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="sales_bank_receipt_lines",
                to="accounts.account",
            ),
        ),
        migrations.RunPython(move_bank_to_lines, noop_reverse),
        migrations.AlterField(
            model_name="salesbankreceiptline",
            name="bank_account",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="sales_bank_receipt_lines",
                to="accounts.account",
            ),
        ),
        migrations.RemoveField(
            model_name="salesbankreceipt",
            name="bank_account",
        ),
    ]
