from django.db import migrations, models


def seed_dimensions(apps, schema_editor):
    Dimension = apps.get_model("accounts", "Dimension")
    defaults = (
        {"code": "SAMS_TRADERS", "name": "SAMS Traders"},
        {"code": "AM_TRADERS", "name": "AM Traders"},
    )
    for item in defaults:
        Dimension.objects.get_or_create(
            code=item["code"],
            defaults={"name": item["name"], "is_active": True},
        )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0007_alter_journalentry_source_type"),
    ]

    operations = [
        migrations.CreateModel(
            name="Dimension",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=50, unique=True)),
                ("name", models.CharField(max_length=255, unique=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        migrations.RunPython(seed_dimensions, migrations.RunPython.noop),
    ]
