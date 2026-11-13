from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
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
            defaults={
                "name": item["name"],
                "sku_code": item["code"],
                "is_active": True,
            },
        )


def get_active_dimension_codes():
    ensure_default_dimensions()
    return list(
        Dimension.objects.filter(is_active=True).order_by("name").values_list("code", flat=True)
    )


def get_user_active_dimension_codes(user):
    user_codes = list(user.allowed_dimensions.values_list("code", flat=True))
    if not user_codes and user.parent_user_id:
        user_codes = list(
            user.parent_user.allowed_dimensions.values_list("code", flat=True)
        )
    return list(
        Dimension.objects.filter(
            code__in=user_codes,
            is_active=True,
        ).order_by("name").values_list("code", flat=True)
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
            "account_type": item.get("type", "GENERAL"),
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


def _account_by_code(tenant_id, code):
    return (
        Account.objects.filter(
            tenant_id=tenant_id,
            code=code,
            deleted_at__isnull=True,
        )
        .order_by("-is_active", "level", "code")
        .first()
    )


def ensure_account_in_dimension(account, tenant_id):
    """Return the same-code COA row in tenant_id, cloning the parent chain if needed."""
    if account is None or not tenant_id:
        return account
    if account.tenant_id == tenant_id:
        return account

    existing = _account_by_code(tenant_id, account.code)
    if existing:
        return existing

    parent = None
    if account.parent_id:
        parent = ensure_account_in_dimension(account.parent, tenant_id)
        if parent is None or parent.tenant_id != tenant_id:
            return account

    payload = {
        "tenant_id": tenant_id,
        "code": account.code,
        "name": account.name,
        "parent": parent,
        "account_group": account.account_group,
        "account_type": account.account_type,
        "account_nature": account.account_nature,
        "level": (parent.level + 1) if parent else (account.level or 1),
        "is_postable": account.is_postable,
        "is_active": True,
        "sort_order": account.sort_order,
    }

    try:
        with transaction.atomic():
            return Account.objects.create(**payload)
    except (DjangoValidationError, IntegrityError):
        existing = _account_by_code(tenant_id, account.code)
        if existing:
            return existing

    if payload["name"] == account.name:
        payload["name"] = f"{account.name} ({account.code})"
        try:
            with transaction.atomic():
                return Account.objects.create(**payload)
        except (DjangoValidationError, IntegrityError):
            existing = _account_by_code(tenant_id, account.code)
            if existing:
                return existing

    return account


def copy_coa_into_dimension(source_tenant_id, target_tenant_id):
    if not source_tenant_id or not target_tenant_id or source_tenant_id == target_tenant_id:
        return 0

    copied = 0
    sources = (
        Account.objects.filter(
            tenant_id=source_tenant_id,
            deleted_at__isnull=True,
            is_active=True,
        )
        .select_related("parent")
        .order_by("level", "code")
    )
    for account in sources:
        ensured = ensure_account_in_dimension(account, target_tenant_id)
        if ensured and ensured.tenant_id == target_tenant_id and ensured.id != account.id:
            copied += 1
    return copied
