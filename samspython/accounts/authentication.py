from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.exceptions import AuthenticationFailed

from accounts.dimensions import get_active_dimension_codes


class TenantJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)

        if result is None:
            return None

        user, token = result

        active_dimensions = get_active_dimension_codes()
        requested_tenant = request.headers.get("x-tenant-id") or (active_dimensions[0] if active_dimensions else "SAMS_TRADERS")

        if requested_tenant not in active_dimensions:
            raise AuthenticationFailed("Invalid dimension selection")

        request.tenant_id = requested_tenant
        user.tenant_id = requested_tenant

        return (user, token)
