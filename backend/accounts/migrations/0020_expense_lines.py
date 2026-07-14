import django.db.models.deletion
import uuid
from django.db import migrations, models


def migrate_expense_lines(apps, schema_editor):
    Expense = apps.get_model("accounts", "Expense")
    ExpenseLine = apps.get_model("accounts", "ExpenseLine")

    for expense in Expense.objects.all().iterator():
        if ExpenseLine.objects.filter(expense_id=expense.id).exists():
            continue
        if not expense.bank_account_id or not expense.expense_account_id:
            continue
        ExpenseLine.objects.create(
            tenant_id=expense.tenant_id,
            expense_id=expense.id,
            bank_account_id=expense.bank_account_id,
            expense_account_id=expense.expense_account_id,
            amount=expense.amount,
            deleted_at=expense.deleted_at,
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0019_user_data_access"),
    ]

    operations = [
        migrations.CreateModel(
            name="ExpenseLine",
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
                    "bank_account",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="expense_line_banks",
                        to="accounts.account",
                    ),
                ),
                (
                    "expense",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="lines",
                        to="accounts.expense",
                    ),
                ),
                (
                    "expense_account",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="expense_line_accounts",
                        to="accounts.account",
                    ),
                ),
            ],
            options={
                "ordering": ["created_at"],
            },
        ),
        migrations.RunPython(migrate_expense_lines, noop_reverse),
        migrations.RemoveField(
            model_name="expense",
            name="bank_account",
        ),
        migrations.RemoveField(
            model_name="expense",
            name="expense_account",
        ),
        migrations.AlterField(
            model_name="expenseline",
            name="bank_account",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="expense_bank_entries",
                to="accounts.account",
            ),
        ),
        migrations.AlterField(
            model_name="expenseline",
            name="expense_account",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="expense_entries",
                to="accounts.account",
            ),
        ),
    ]
