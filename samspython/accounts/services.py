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

    refresh = RefreshToken.for_user(user)

    return {
        "access": str(refresh.access_token),
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
        },
    }
