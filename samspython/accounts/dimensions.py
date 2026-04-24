from django.utils.text import slugify

from accounts.management.commands.seed_coa import Command as SeedCoaCommand
from accounts.models import Account, Dimension


DEFAULT_DIMENSIONS = (
    {"code": "SAMS_TRADERS", "name": "SAMS Traders"},
    {"code": "AM_TRADERS", "name": "AM Traders"},
)


def ensure_default_dimensions():
    for item in DEFAULT_DIMENSIONS:
        Dimension.objects.get_or_create(
            code=item["code"],
            defaults={"name": item["name"], "is_active": True},
        )


def get_active_dimension_codes():
    ensure_default_dimensions()
    return list(
        Dimension.objects.filter(is_active=True).order_by("name").values_list("code", flat=True)
    )


def build_dimension_code(name, explicit_code=""):
    if explicit_code:
        return explicit_code.strip().upper().replace(" ", "_")

    generated = slugify(name).replace("-", "_").upper()
    return generated[:50]


def seed_default_coa_for_dimension(dimension_code):
    code_map = {}

    for item in SeedCoaCommand.COA_DATA:
        parent = code_map.get(item["parent"]) if item["parent"] else None
        defaults = {
            "code": item["code"],
            "name": item["name"],
            "parent": parent,
            "account_group": item["group"],
            "account_nature": item["nature"],
            "level": item["level"],
            "is_postable": item["postable"],
            "is_active": True,
            "sort_order": item["sort_order"],
            "deleted_at": None,
        }

        obj = (
            Account.objects.filter(
                tenant_id=dimension_code,
                code=item["code"],
            )
            .order_by("created_at")
            .first()
        )

        if obj is None:
            obj = Account.objects.create(
                tenant_id=dimension_code,
                **defaults,
            )
        else:
            has_changes = False
            for field, value in defaults.items():
                if getattr(obj, field) != value:
                    setattr(obj, field, value)
                    has_changes = True

            if has_changes:
                obj.save()

        code_map[item["code"]] = obj
