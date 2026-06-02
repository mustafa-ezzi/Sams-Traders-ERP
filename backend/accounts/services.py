from django.contrib.auth import get_user_model
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.dimensions import get_user_active_dimension_codes
from accounts.models import Dimension

User = get_user_model()


def login_service(data):
    email = data.get("email")
    password = data.get("password")

    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        raise AuthenticationFailed("Invalid credentials")

    if not user.check_password(password):
        raise AuthenticationFailed("Invalid credentials")

    if user.parent_user_id:
        parent = (
            User.objects.filter(id=user.parent_user_id, is_active=True)
            .only("id", "is_active", "tenant_id")
            .first()
        )
        if not parent:
            raise AuthenticationFailed("Invalid credentials")
        if not (user.tenant_id or "").strip() and (parent.tenant_id or "").strip():
            user.tenant_id = parent.tenant_id
            user.save(update_fields=["tenant_id"])

    allowed_codes = get_user_active_dimension_codes(user)
    if allowed_codes and user.tenant_id not in allowed_codes:
        user.tenant_id = allowed_codes[0]
        user.save(update_fields=["tenant_id"])
    elif not allowed_codes and user.tenant_id:
        user.tenant_id = ""
        user.save(update_fields=["tenant_id"])

    allowed_dimensions = list(
        Dimension.objects.filter(code__in=allowed_codes, is_active=True)
        .order_by("name")
        .values("code", "name")
    )

    is_tenant_child = bool(user.parent_user_id)
    child_ui_permissions = list(user.ui_permissions or []) if is_tenant_child else []
    child_tenant_role = (user.tenant_role or "") if is_tenant_child else ""

    refresh = RefreshToken.for_user(user)
    refresh["is_tenant_child"] = is_tenant_child
    refresh["ui_permissions"] = child_ui_permissions
    refresh["tenant_role"] = child_tenant_role
    access = refresh.access_token
    access["is_tenant_child"] = is_tenant_child
    access["ui_permissions"] = child_ui_permissions
    access["tenant_role"] = child_tenant_role

    return {
        "access": str(access),
        "refresh": str(refresh),
        "user": {
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
            "phone_number": user.phone_number,
            "business_name": user.business_name,
            "tenant_limit": user.tenant_limit,
            "tenant_id": user.tenant_id or "",
            "allowed_dimensions": allowed_dimensions,
            "is_tenant_child": is_tenant_child,
            "ui_permissions": child_ui_permissions,
            "tenant_role": child_tenant_role,
        },
    }


def admin_login_service(data):
    username = data.get("username")
    password = data.get("password")

    try:
        user = User.objects.get(username=username, is_staff=True, is_active=True)
    except User.DoesNotExist:
        raise AuthenticationFailed("Invalid admin credentials")

    if not user.check_password(password):
        raise AuthenticationFailed("Invalid admin credentials")

    refresh = RefreshToken.for_user(user)
    refresh["is_admin"] = True
    access = refresh.access_token
    access["is_admin"] = True

    return {
        "access": str(access),
        "refresh": str(refresh),
        "admin": {
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
            "is_god": bool(user.is_superuser),
        },
    }
