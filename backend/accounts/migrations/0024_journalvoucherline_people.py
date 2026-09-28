from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0023_journalvoucher"),
    ]

    operations = [
        migrations.AddField(
            model_name="journalvoucherline",
            name="people_type",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.AddField(
            model_name="journalvoucherline",
            name="people_name",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
