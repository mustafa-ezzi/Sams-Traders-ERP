def get_user_allowed_salesman_ids(user):
    if not getattr(user, "parent_user_id", None):
        return []

    data_access = getattr(user, "data_access", None) or {}
    salesman_ids = data_access.get("salesman_ids") or []
    return [str(item) for item in salesman_ids if item]


def filter_queryset_by_allowed_salesmen(queryset, user, field_name="salesman_id"):
    salesman_ids = get_user_allowed_salesman_ids(user)
    if not salesman_ids:
        return queryset
    return queryset.filter(**{f"{field_name}__in": salesman_ids})


def user_can_access_salesman(user, salesman_id):
    salesman_ids = get_user_allowed_salesman_ids(user)
    if not salesman_ids:
        return True
    return str(salesman_id or "") in salesman_ids
