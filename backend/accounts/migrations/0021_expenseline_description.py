from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0020_expense_lines"),
    ]

    operations = [
        migrations.AddField(
            model_name="expenseline",
            name="description",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
