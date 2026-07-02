from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0018_alter_journalentry_source_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="data_access",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
