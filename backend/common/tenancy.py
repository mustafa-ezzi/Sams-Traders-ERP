def get_request_tenant_ids(request):
    tenant_ids = getattr(request, "tenant_ids", None) or []
    if tenant_ids:
        return tenant_ids

    tenant_id = getattr(request, "tenant_id", None) or getattr(request.user, "tenant_id", "")
    return [tenant_id] if tenant_id else []


def get_request_tenant_filter(request):
    return {"tenant_id__in": get_request_tenant_ids(request)}
