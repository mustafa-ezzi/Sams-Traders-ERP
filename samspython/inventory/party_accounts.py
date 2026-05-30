"""Default control accounts for customers (receivable) and suppliers (payable)."""

from rest_framework.exceptions import ValidationError

from accounts.models import Account
from inventory.models import Customer, Supplier

CUSTOMER_RECEIVABLE_CODE = "1140"
SUPPLIER_PAYABLE_CODE = "2130"


def _tenant_id_from_request(request):
    return getattr(request, "tenant_id", None) or request.user.tenant_id


def resolve_default_receivable_account(tenant_id):
    return _resolve_party_control_account(
        tenant_id,
        account_type=Account.AccountType.RECEIVABLE,
        preferred_code=CUSTOMER_RECEIVABLE_CODE,
        name_hint="receivable",
        label="A/c Receivables",
    )


def resolve_default_payable_account(tenant_id):
    return _resolve_party_control_account(
        tenant_id,
        account_type=Account.AccountType.PAYABLE,
        preferred_code=SUPPLIER_PAYABLE_CODE,
        name_hint="payable",
        label="A/c Payables",
    )


def _resolve_party_control_account(
    tenant_id,
    *,
    account_type,
    preferred_code,
    name_hint,
    label,
):
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
                f"No postable {label} account found for this dimension. "
                f"Add account {preferred_code} ({label}) in Chart of Accounts first."
            )
        }
    )


def assign_default_party_account(party_model, attrs, request):
    tenant_id = _tenant_id_from_request(request)
    if party_model is Customer:
        attrs["account"] = resolve_default_receivable_account(tenant_id)
    elif party_model is Supplier:
        attrs["account"] = resolve_default_payable_account(tenant_id)
    return attrs
