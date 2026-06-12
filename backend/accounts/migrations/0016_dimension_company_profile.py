from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0015_alter_journalentry_source_type_party_opening"),
    ]

    operations = [
        migrations.AddField(
            model_name="dimension",
            name="address",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="dimension",
            name="phone_number",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
        migrations.AddField(
            model_name="dimension",
            name="ntn_number",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
        migrations.AddField(
            model_name="dimension",
            name="email",
            field=models.EmailField(blank=True, default="", max_length=254),
        ),
    ]
