from django.db import migrations


def backfill_user_allowed_dimensions(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    Dimension = apps.get_model("accounts", "Dimension")

    dimension_ids_by_code = {
        item["code"]: item["id"]
        for item in Dimension.objects.values("id", "code")
    }

    through = User.allowed_dimensions.through
    for user in User.objects.all():
        dimension_id = dimension_ids_by_code.get(user.tenant_id)
        if not dimension_id:
            continue
        through.objects.get_or_create(user_id=user.id, dimension_id=dimension_id)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0009_user_allowed_dimensions_user_business_name_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_user_allowed_dimensions, migrations.RunPython.noop),
    ]
