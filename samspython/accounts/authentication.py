from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.exceptions import AuthenticationFailed

VALID_TENANTS = ["SAMS_TRADERS", "AM_TRADERS"]


class TenantJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)

        if result is None:
            return None

        user, token = result

        requested_tenant = request.headers.get("x-tenant-id") or "SAMS_TRADERS"

        if requested_tenant not in VALID_TENANTS:
            raise AuthenticationFailed("Invalid tenant selection")

        request.tenant_id = requested_tenant
        user.tenant_id = requested_tenant

        return (user, token)
