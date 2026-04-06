from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.exceptions import AuthenticationFailed

VALID_TENANTS = ["SAMS_TRADERS", "AM_TRADERS"]

class TenantJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)

        if result is None:
            return None

        user, token = result

        tenant_id = token.get("tenant_id")
        requested_tenant = request.headers.get("x-tenant-id")

        if not tenant_id or tenant_id not in VALID_TENANTS:
            raise AuthenticationFailed("Invalid tenant_id in token")

        if requested_tenant and requested_tenant != tenant_id:
            raise AuthenticationFailed("Tenant mismatch")

        request.tenant_id = tenant_id

        return (user, token)