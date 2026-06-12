"""Default control accounts for customers (receivable) and suppliers (payable)."""

from rest_framework.exceptions import ValidationError

from accounts.dimensions import get_user_active_dimension_codes
from accounts.models import Account
from inventory.models import Customer, Supplier

CUSTOMER_RECEIVABLE_CODE = "1140"
SUPPLIER_PAYABLE_CODE = "2130"
OPENING_EQUITY_CODE = "3100"


def _tenant_id_from_request(request):
    return getattr(request, "tenant_id", None) or request.user.tenant_id


def _allowed_tenant_ids_from_request(request):
    """Chart of Accounts is shared across every dimension the user owns,
    so any of them is a valid source for a control account. The currently
    selected tenant is preferred (returned first) when resolving."""

    current = _tenant_id_from_request(request)
    tenant_ids = []
    if current:
        tenant_ids.append(current)
    if getattr(request, "user", None):
        for code in get_user_active_dimension_codes(request.user):
            if code and code not in tenant_ids:
                tenant_ids.append(code)
    return tenant_ids


def resolve_default_receivable_account(tenant_ids):
    return _resolve_party_control_account(
        tenant_ids,
        account_type=Account.AccountType.RECEIVABLE,
        preferred_code=CUSTOMER_RECEIVABLE_CODE,
        name_hint="receivable",
        label="A/c Receivables",
    )


def resolve_default_payable_account(tenant_ids):
    return _resolve_party_control_account(
        tenant_ids,
        account_type=Account.AccountType.PAYABLE,
        preferred_code=SUPPLIER_PAYABLE_CODE,
        name_hint="payable",
        label="A/c Payables",
    )


def _resolve_party_control_account(
    tenant_ids,
    *,
    account_type,
    preferred_code,
    name_hint,
    label,
):
    if isinstance(tenant_ids, str):
        tenant_ids = [tenant_ids]
    tenant_ids = list(tenant_ids or [])

    # Walk the user's dimensions in priority order so the currently selected
    # tenant is preferred when several dimensions still have a seeded copy
    # of the control account.
    for tenant_id in tenant_ids:
        base_qs = Account.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
            is_active=True,
            is_postable=True,
            account_type=account_type,
        )

        account = base_qs.filter(code=preferred_code).first()
        if account:
            return account

        account = base_qs.filter(name__icontains=name_hint).order_by("code").first()
        if account:
            return account

        account = base_qs.order_by("code").first()
        if account:
            return account

    raise ValidationError(
        {
            "account": (
                f"No postable {label} account found. "
                f"Add account {preferred_code} ({label}) in Chart of Accounts first."
            )
        }
    )


def resolve_opening_equity_account(tenant_ids):
    if isinstance(tenant_ids, str):
        tenant_ids = [tenant_ids]
    tenant_ids = list(tenant_ids or [])

    for tenant_id in tenant_ids:
        account = Account.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
            is_active=True,
            is_postable=True,
            account_group=Account.AccountGroup.EQUITY,
            code=OPENING_EQUITY_CODE,
        ).first()
        if account:
            return account

        account = (
            Account.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
                is_active=True,
                is_postable=True,
                account_group=Account.AccountGroup.EQUITY,
            )
            .filter(name__icontains="equity")
            .order_by("code")
            .first()
        )
        if account:
            return account

    raise ValidationError(
        {
            "account": (
                "No postable Owners Equity account found. "
                f"Add account {OPENING_EQUITY_CODE} in Chart of Accounts first."
            )
        }
    )


def assign_default_party_account(party_model, attrs, request):
    tenant_ids = _allowed_tenant_ids_from_request(request)
    if party_model is Customer:
        attrs["account"] = resolve_default_receivable_account(tenant_ids)
    elif party_model is Supplier:
        attrs["account"] = resolve_default_payable_account(tenant_ids)
    return attrs
