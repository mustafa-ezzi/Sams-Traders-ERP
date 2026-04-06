from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.exceptions import AuthenticationFailed

User = get_user_model()

def login_service(data):
    email = data.get("email")
    password = data.get("password")
    tenant_id = data.get("tenant_id")

    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        raise AuthenticationFailed("Invalid credentials")

    if not user.check_password(password):
        raise AuthenticationFailed("Invalid credentials")

    if user.tenant_id != tenant_id:
        raise AuthenticationFailed("Tenant mismatch")

    refresh = RefreshToken.for_user(user)

    # 🔥 Inject tenant into token
    refresh["tenant_id"] = user.tenant_id

    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": {
            "id": str(user.id),
            "email": user.email,
            "tenant_id": user.tenant_id,
        },
    }