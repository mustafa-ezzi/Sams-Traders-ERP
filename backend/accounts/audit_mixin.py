from accounts.audit import log_action
from accounts.models import AuditLog


class AuditedModelMixin:
    """
    Logs CREATE/UPDATE/DELETE via finalize_response so it works even when
    subclasses override create/update/destroy and skip perform_*.
    """

    audit_entity_type = "record"
    audit_summary_fields = ("name", "code", "invoice_number", "receipt_number", "payment_number", "expense_number", "transfer_number", "username", "business_name")

    def get_object(self):
        obj = super().get_object()
        if getattr(self, "action", None) == "destroy":
            self._audit_destroy_snapshot = {
                "entity_id": str(getattr(obj, "pk", "") or ""),
                "summary": self._summary_for_instance(obj, AuditLog.Action.DELETE),
                "metadata": self._metadata_for_instance(obj),
            }
        return obj

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        try:
            action_name = getattr(self, "action", None)
            if action_name not in {"create", "update", "partial_update", "destroy"}:
                return response
            status_code = getattr(response, "status_code", 500)
            if status_code < 200 or status_code >= 300:
                return response

            if action_name == "destroy":
                snapshot = getattr(self, "_audit_destroy_snapshot", None) or {}
                log_action(
                    request,
                    action=AuditLog.Action.DELETE,
                    entity_type=self.audit_entity_type,
                    entity_id=snapshot.get("entity_id", ""),
                    summary=snapshot.get("summary")
                    or f"Deleted {self.audit_entity_type}",
                    metadata=snapshot.get("metadata") or {},
                )
                return response

            audit_action = (
                AuditLog.Action.CREATE
                if action_name == "create"
                else AuditLog.Action.UPDATE
            )
            payload = self._payload_from_response(response)
            entity_id = str(payload.get("id") or "")
            log_action(
                request,
                action=audit_action,
                entity_type=self.audit_entity_type,
                entity_id=entity_id,
                summary=self._summary_from_payload(audit_action, payload),
                metadata=self._metadata_from_payload(payload),
            )
        except Exception:
            pass
        return response

    def _payload_from_response(self, response):
        data = getattr(response, "data", None)
        if not isinstance(data, dict):
            return {}
        nested = data.get("data")
        if isinstance(nested, dict):
            return nested
        return data

    def _summary_from_payload(self, action, payload):
        label = self._label_from_mapping(payload)
        verb = "Created" if action == AuditLog.Action.CREATE else "Updated"
        if label:
            return f"{verb} {self.audit_entity_type.replace('_', ' ')} {label}"
        entity_id = payload.get("id")
        if entity_id:
            return f"{verb} {self.audit_entity_type.replace('_', ' ')} ({entity_id})"
        return f"{verb} {self.audit_entity_type.replace('_', ' ')}"

    def _summary_for_instance(self, instance, action):
        label = self._label_from_instance(instance)
        verb = {
            AuditLog.Action.CREATE: "Created",
            AuditLog.Action.UPDATE: "Updated",
            AuditLog.Action.DELETE: "Deleted",
        }.get(action, action)
        if label:
            return f"{verb} {self.audit_entity_type.replace('_', ' ')} {label}"
        return f"{verb} {self.audit_entity_type.replace('_', ' ')} ({getattr(instance, 'pk', '')})"

    def _label_from_mapping(self, payload):
        for field in self.audit_summary_fields:
            value = payload.get(field)
            if value not in (None, ""):
                return str(value)
        return ""

    def _label_from_instance(self, instance):
        for field in self.audit_summary_fields:
            value = getattr(instance, field, None)
            if value not in (None, ""):
                return str(value)
        return ""

    def _metadata_from_payload(self, payload):
        meta = {}
        for field in self.audit_summary_fields:
            if field in payload and payload[field] not in (None, ""):
                meta[field] = payload[field]
        return meta

    def _metadata_for_instance(self, instance):
        meta = {}
        for field in self.audit_summary_fields:
            value = getattr(instance, field, None)
            if value not in (None, ""):
                meta[field] = str(value)
        return meta
