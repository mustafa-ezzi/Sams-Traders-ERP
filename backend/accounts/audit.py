import logging

from accounts.models import AuditLog

logger = logging.getLogger(__name__)


def _client_ip(request):
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    return request.META.get("REMOTE_ADDR") or None


def log_action(
    request=None,
    *,
    action,
    entity_type="",
    entity_id=None,
    summary="",
    metadata=None,
    user=None,
    tenant_id=None,
):
    """Persist an audit row. Never raises into the caller."""
    try:
        actor = user
        if actor is None and request is not None:
            actor = getattr(request, "user", None)
            if actor is not None and not getattr(actor, "is_authenticated", False):
                actor = None

        resolved_tenant = (tenant_id or "").strip()
        if not resolved_tenant and request is not None:
            resolved_tenant = (
                getattr(request, "tenant_id", None)
                or (getattr(actor, "tenant_id", None) if actor else None)
                or ""
            )
        if not resolved_tenant and actor is not None:
            resolved_tenant = (getattr(actor, "tenant_id", None) or "").strip()
        if not resolved_tenant:
            resolved_tenant = "SYSTEM"

        username = ""
        if actor is not None:
            username = (
                getattr(actor, "username", None)
                or getattr(actor, "email", None)
                or str(getattr(actor, "pk", ""))
            )

        AuditLog.objects.create(
            tenant_id=resolved_tenant,
            actor=actor if actor is not None and getattr(actor, "pk", None) else None,
            actor_username=str(username or "")[:150],
            action=action,
            entity_type=str(entity_type or "")[:80],
            entity_id=str(entity_id or "")[:64],
            summary=str(summary or "")[:500],
            metadata=metadata if isinstance(metadata, dict) else {},
            ip_address=_client_ip(request),
        )
    except Exception:
        logger.exception("Failed to write audit log action=%s entity=%s", action, entity_type)
