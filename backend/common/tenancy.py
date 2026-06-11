def get_request_tenant_ids(request):
    tenant_ids = getattr(request, "tenant_ids", None) or []
    if tenant_ids:
        return tenant_ids

    tenant_id = getattr(request, "tenant_id", None) or getattr(request.user, "tenant_id", "")
    return [tenant_id] if tenant_id else []


def get_request_tenant_filter(request):
    return {"tenant_id__in": get_request_tenant_ids(request)}


def get_shared_tenant_ids(request):
    """All dimension codes where company-wide master records may live."""
    from accounts.dimensions import get_user_active_dimension_codes

    tenant_ids = list(get_user_active_dimension_codes(request.user))
    tenant_id = getattr(request, "tenant_id", None) or getattr(request.user, "tenant_id", "")
    if tenant_id and tenant_id not in tenant_ids:
        tenant_ids.append(tenant_id)
    return tenant_ids


def get_shared_tenant_filter(request):
    """Filter for records shared across the company (not scoped by view checkboxes)."""
    return {"tenant_id__in": get_shared_tenant_ids(request)}


def shared_master_exists(model, request, pk):
    if not pk:
        return False
    return model.objects.filter(
        id=pk,
        tenant_id__in=get_shared_tenant_ids(request),
        deleted_at__isnull=True,
    ).exists()
