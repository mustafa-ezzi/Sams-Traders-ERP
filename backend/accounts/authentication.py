from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.exceptions import AuthenticationFailed

from accounts.dimensions import get_user_active_dimension_codes


class TenantJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)

        if result is None:
            return None

        user, token = result

        allowed_dimensions = get_user_active_dimension_codes(user)
        if not allowed_dimensions:
            if "/api/accounts/dimensions/" in request.path:
                request.tenant_id = ""
                user.tenant_id = ""
                return (user, token)
            raise AuthenticationFailed("Create your first tenant before using other modules.")

        requested_tenant = request.headers.get("x-tenant-id") or (
            user.tenant_id if user.tenant_id in allowed_dimensions else (allowed_dimensions[0] if allowed_dimensions else "")
        )

        if requested_tenant not in allowed_dimensions:
            raise AuthenticationFailed("Invalid dimension selection")

        requested_tenants_header = request.headers.get("x-tenant-ids") or ""
        requested_tenants = [
            item.strip()
            for item in requested_tenants_header.split(",")
            if item.strip()
        ]
        if requested_tenants:
            invalid_tenants = [
                tenant_id
                for tenant_id in requested_tenants
                if tenant_id not in allowed_dimensions
            ]
            if invalid_tenants:
                raise AuthenticationFailed("Invalid dimension selection")
        else:
            requested_tenants = [requested_tenant]

        request.tenant_id = requested_tenant
        request.tenant_ids = requested_tenants
        user.tenant_id = requested_tenant

        return (user, token)


class AdminJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None

        user, token = result
        if not bool(token.get("is_admin")) or not user.is_staff:
            raise AuthenticationFailed("Admin authentication required")
        return (user, token)
