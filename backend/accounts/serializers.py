from rest_framework import serializers

from accounts.dimensions import build_dimension_code, get_user_active_dimension_codes
from accounts.models import Account, Dimension, Expense, Inquiry, User
from common.tenancy import get_request_tenant_ids


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


class AdminLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()


class DimensionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dimension
        fields = [
            "id",
            "code",
            "name",
            "sku_code",
            "address",
            "phone_number",
            "ntn_number",
            "email",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {
            "code": {"required": False, "allow_blank": True},
            "sku_code": {"required": False, "allow_blank": True},
            "address": {"required": False, "allow_blank": True},
            "phone_number": {"required": False, "allow_blank": True},
            "ntn_number": {"required": False, "allow_blank": True},
            "email": {"required": False, "allow_blank": True},
        }

    def validate(self, attrs):
        existing_code = self.instance.code if self.instance else ""
        name = (attrs.get("name") or getattr(self.instance, "name", "") or "").strip()
        requested_code = str(attrs.get("code", existing_code if self.instance else "") or "").strip()
        code = existing_code if self.instance else build_dimension_code(name, requested_code)

        if not name:
            raise serializers.ValidationError({"name": "Dimension name is required."})
        if not code:
            raise serializers.ValidationError({"code": "Dimension code could not be generated."})
        if self.instance and requested_code and requested_code != existing_code:
            raise serializers.ValidationError({"code": "Dimension code cannot be changed."})

        queryset = Dimension.objects.all()
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.filter(code=code).exists():
            raise serializers.ValidationError({"code": "A dimension with this code already exists."})

        if queryset.filter(name__iexact=name).exists():
            raise serializers.ValidationError({"name": "A dimension with this name already exists."})

        existing_sku_code = self.instance.sku_code if self.instance else ""
        sku_code = str(attrs.get("sku_code") or existing_sku_code or code).strip().upper()
        if not sku_code:
            raise serializers.ValidationError({"sku_code": "SKU code is required."})
        if len(sku_code) > 20:
            raise serializers.ValidationError({"sku_code": "SKU code cannot exceed 20 characters."})
        if sku_code and not sku_code.replace("_", "").replace("-", "").isalnum():
            raise serializers.ValidationError({"sku_code": "SKU code can contain letters, numbers, hyphens, and underscores only."})

        attrs["name"] = name
        attrs["code"] = code
        attrs["sku_code"] = sku_code
        attrs["address"] = str(attrs.get("address") or getattr(self.instance, "address", "") or "").strip()
        attrs["phone_number"] = str(
            attrs.get("phone_number") or getattr(self.instance, "phone_number", "") or ""
        ).strip()
        attrs["ntn_number"] = str(
            attrs.get("ntn_number") or getattr(self.instance, "ntn_number", "") or ""
        ).strip()
        attrs["email"] = str(attrs.get("email") or getattr(self.instance, "email", "") or "").strip()
        return attrs


class AdminUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6, required=False)
    parent_user_id = serializers.UUIDField(read_only=True, allow_null=True)
    parent_email = serializers.SerializerMethodField()
    account_kind = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "phone_number",
            "business_name",
            "tenant_limit",
            "tenant_id",
            "password",
            "is_active",
            "date_joined",
            "parent_user_id",
            "parent_email",
            "tenant_role",
            "ui_permissions",
            "account_kind",
        ]
        read_only_fields = ["id", "date_joined", "tenant_role", "ui_permissions"]
        extra_kwargs = {
            "tenant_id": {"read_only": True},
        }

    def get_parent_email(self, obj):
        if obj.parent_user_id and getattr(obj, "parent_user", None):
            return obj.parent_user.email or ""
        return ""

    def get_account_kind(self, obj):
        return "child" if obj.parent_user_id else "tenant_admin"

    def validate(self, attrs):
        is_create = self.instance is None
        if is_create and not attrs.get("password"):
            raise serializers.ValidationError({"password": "Password is required for new users."})

        tenant_limit = attrs.get("tenant_limit", getattr(self.instance, "tenant_limit", 1))
        if tenant_limit < 1:
            raise serializers.ValidationError({"tenant_limit": "Tenant limit must be at least 1."})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=password,
            tenant_id="",
            phone_number=validated_data.get("phone_number", ""),
            business_name=validated_data.get("business_name", ""),
            tenant_limit=validated_data.get("tenant_limit", 1),
            is_active=validated_data.get("is_active", True),
        )
        return user

    def update(self, instance, validated_data):
        validated_data.pop("password", None)
        for field in ["username", "email", "phone_number", "business_name", "tenant_limit", "is_active"]:
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.save()
        return instance


class TenantStaffSerializer(serializers.ModelSerializer):
    """Child users under a tenant org admin (not God panel)."""

    password = serializers.CharField(write_only=True, min_length=6, required=False)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "password",
            "tenant_role",
            "ui_permissions",
            "is_active",
            "date_joined",
        ]
        read_only_fields = ["id", "date_joined"]

    def validate(self, attrs):
        if self.instance is None and not attrs.get("password"):
            raise serializers.ValidationError({"password": "Password is required for new staff users."})
        return attrs

    def validate_ui_permissions(self, value):
        from accounts.tenant_ui_permissions import normalize_ui_permissions

        normalized = normalize_ui_permissions(value)
        if not normalized:
            raise serializers.ValidationError("Select at least one allowed module.")
        return normalized

    def create(self, validated_data):
        from accounts.tenant_ui_permissions import normalize_ui_permissions

        parent = self.context["parent_user"]
        password = validated_data.pop("password")
        perms = normalize_ui_permissions(validated_data.pop("ui_permissions", []))
        if not perms:
            raise serializers.ValidationError({"ui_permissions": "Select at least one allowed module."})
        child = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=password,
            tenant_id=parent.tenant_id or "",
            phone_number="",
            business_name="",
            tenant_limit=1,
            parent_user=parent,
            tenant_role=(validated_data.get("tenant_role") or "").strip(),
            ui_permissions=perms,
            is_active=validated_data.get("is_active", True),
        )
        child.allowed_dimensions.set(parent.allowed_dimensions.all())
        return child

    def update(self, instance, validated_data):
        from accounts.tenant_ui_permissions import normalize_ui_permissions

        password = validated_data.pop("password", None)
        if "ui_permissions" in validated_data:
            perms = normalize_ui_permissions(validated_data.pop("ui_permissions"))
            if not perms:
                raise serializers.ValidationError({"ui_permissions": "Select at least one allowed module."})
            instance.ui_permissions = perms
        for field in ["username", "email", "tenant_role", "is_active"]:
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class AccountSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField(read_only=True)
    SHARED_DISPLAY_LEVEL = 3

    class Meta:
        model = Account
        fields = [
            "id",
            "code",
            "name",
            "parent",
            "account_group",
            "account_type",
            "account_nature",
            "level",
            "is_postable",
            "is_active",
            "sort_order",
            "children",
        ]
        read_only_fields = ["tenant_id", "level"]
        extra_kwargs = {
            "code": {"required": False, "allow_blank": True},
        }

    @staticmethod
    def _normalize_code_for_generation(code):
        code_str = str(code or "").strip()
        if not code_str.isdigit():
            raise serializers.ValidationError({"code": "Account code must contain only digits."})
        return code_str

    def _generate_next_child_code(self, parent, tenant_id):
        normalized_parent_code = self._normalize_code_for_generation(parent.code)

        parent_level = parent.level or 1
        parent_code_value = int(normalized_parent_code)
        if parent_level <= 1:
            child_code_width = len(normalized_parent_code)
            step = 100
            first_code_value = parent_code_value + step
            branch_limit = parent_code_value + 1000
        elif parent_level == 2:
            child_code_width = len(normalized_parent_code)
            step = 10
            first_code_value = parent_code_value + step
            branch_limit = parent_code_value + 100
        elif parent_level == 3:
            child_code_width = len(normalized_parent_code)
            step = 1
            first_code_value = parent_code_value + step
            branch_limit = parent_code_value + 10
        else:
            child_code_width = len(normalized_parent_code) + 1
            step = 1
            first_code_value = parent_code_value * 10
            branch_limit = first_code_value + 10

        request = self.context.get("request")
        scoped_tenant_ids = [tenant_id]
        if parent_level >= 3 and request:
            scoped_tenant_ids = get_user_active_dimension_codes(request.user) or [
                tenant_id
            ]

        direct_child_filter = {
            "tenant_id__in": scoped_tenant_ids,
            "deleted_at__isnull": True,
        }
        if parent_level >= 3:
            direct_child_filter["parent__code"] = parent.code
            direct_child_filter["parent__level"] = parent.level
        else:
            direct_child_filter["tenant_id"] = tenant_id
            direct_child_filter["parent"] = parent

        direct_child_codes = Account.objects.filter(
            **direct_child_filter
        ).values_list("code", flat=True)
        tenant_codes = set(
            Account.objects.filter(
                tenant_id__in=scoped_tenant_ids,
                deleted_at__isnull=True,
            ).values_list("code", flat=True)
        )

        normalized_existing_codes = []
        for code in direct_child_codes:
            normalized_child_code = self._normalize_code_for_generation(code)
            child_code_value = int(normalized_child_code)
            if (
                len(normalized_child_code) == child_code_width
                and first_code_value <= child_code_value < branch_limit
            ):
                normalized_existing_codes.append(child_code_value)

        next_code_value = (
            max(normalized_existing_codes) + step
            if normalized_existing_codes
            else first_code_value
        )

        while next_code_value < branch_limit and str(next_code_value).zfill(child_code_width) in tenant_codes:
            next_code_value += step

        if next_code_value >= branch_limit:
            raise serializers.ValidationError(
                {"code": f"No more child account codes are available under parent {parent.code}."}
            )

        return str(next_code_value).zfill(child_code_width)

    def _ensure_parent_is_header(self, parent):
        if parent and parent.is_postable:
            parent.is_postable = False
            parent.save(update_fields=["is_postable", "updated_at"])

    def _get_display_tenant_ids(self):
        request = self.context.get("request")
        if not request:
            return []

        tenant_ids = get_request_tenant_ids(request)
        if tenant_ids:
            return tenant_ids

        tenant_ids = get_user_active_dimension_codes(request.user)
        tenant_id = getattr(request, "tenant_id", None) or request.user.tenant_id
        if tenant_id and tenant_id not in tenant_ids:
            tenant_ids.append(tenant_id)
        return tenant_ids

    @staticmethod
    def _is_opening_bank_header(account):
        return (
            account.level == 4
            and account.parent is not None
            and account.parent.code == "1110"
        )

    def _dedupe_shared_display_accounts(self, accounts):
        deduped = []
        seen_codes = set()

        for account in accounts:
            if account.code in seen_codes:
                continue
            seen_codes.add(account.code)
            deduped.append(account)

        return deduped

    def get_children(self, obj):
        if self._is_opening_bank_header(obj):
            bank_parents = Account.objects.filter(
                tenant_id__in=self._get_display_tenant_ids(),
                code=obj.code,
                parent__code="1110",
                deleted_at__isnull=True,
            )
            accounts = list(
                Account.objects.filter(
                    parent__in=bank_parents,
                    deleted_at__isnull=True,
                ).order_by("code", "tenant_id", "created_at")
            )
        else:
            parent_queryset = Account.objects.filter(
                tenant_id__in=self._get_display_tenant_ids(),
                code=obj.code,
                level=obj.level,
                deleted_at__isnull=True,
            )
            queryset = Account.objects.filter(
                parent__in=parent_queryset,
                deleted_at__isnull=True,
            ).order_by("code", "tenant_id", "created_at")
            accounts = self._dedupe_shared_display_accounts(list(queryset))

        return AccountSerializer(accounts, many=True, context=self.context).data

    def validate(self, data):
        request = self.context["request"]
        tenant_id = self.instance.tenant_id if self.instance is not None else request.tenant_id

        parent_provided = "parent" in data
        parent = data.get("parent")
        if not parent_provided and self.instance is not None:
            parent = self.instance.parent

        if parent and parent.tenant_id != tenant_id:
            # The chart of accounts is shared across the user's dimensions,
            # so the chosen parent may come from a different tenant than the
            # one currently selected. Prefer a same-tenant clone of the
            # parent (typical for seeded headers like 1100, 1110), but if
            # none exists - which is normal for a custom level-4+ branch
            # that was created in another dimension - fall back to the
            # original parent and let the child inherit its tenant on save.
            same_tenant_parent = (
                Account.objects.filter(
                    tenant_id=tenant_id,
                    code=parent.code,
                    deleted_at__isnull=True,
                )
                .order_by("level", "code")
                .first()
            )
            if same_tenant_parent:
                parent = same_tenant_parent
                data["parent"] = parent

        if parent and parent.deleted_at is not None:
            raise serializers.ValidationError("Parent account cannot be soft deleted.")

        if parent:
            data["account_group"] = parent.account_group
            data["account_nature"] = parent.account_nature
            if parent.account_type != Account.AccountType.GENERAL:
                data["account_type"] = parent.account_type

        code = (data.get("code") or "").strip()
        if self.instance is None:
            if parent:
                data["code"] = self._generate_next_child_code(parent, tenant_id)
            elif not code:
                raise serializers.ValidationError({"code": "Code is required for a root account."})
            elif not code.isdigit():
                raise serializers.ValidationError({"code": "Account code must contain only digits."})
        elif "code" in data and code and not code.isdigit():
            raise serializers.ValidationError({"code": "Account code must contain only digits."})

        account_group = data.get("account_group", getattr(self.instance, "account_group", None))
        account_type = data.get("account_type", getattr(self.instance, "account_type", None))
        allowed_group_by_type = {
            Account.AccountType.BANK: Account.AccountGroup.ASSET,
            Account.AccountType.CASH: Account.AccountGroup.ASSET,
            Account.AccountType.RECEIVABLE: Account.AccountGroup.ASSET,
            Account.AccountType.INVENTORY: Account.AccountGroup.ASSET,
            Account.AccountType.PAYABLE: Account.AccountGroup.LIABILITY,
            Account.AccountType.REVENUE: Account.AccountGroup.REVENUE,
            Account.AccountType.COGS: Account.AccountGroup.COGS,
        }
        expected_group = allowed_group_by_type.get(account_type)
        if expected_group and account_group != expected_group:
            raise serializers.ValidationError(
                {"account_type": f"Account type {account_type} requires account group {expected_group}."}
            )

        return data

    def validate_is_postable(self, value):
        instance = getattr(self, "instance", None)

        if instance and value and instance.children.filter(deleted_at__isnull=True).exists():
            raise serializers.ValidationError("Account with children cannot be postable.")

        return value

    def _resolve_parent_for_dimension(self, parent, tenant_id):
        if not parent:
            return None
        return (
            Account.objects.filter(
                tenant_id=tenant_id,
                code=parent.code,
                deleted_at__isnull=True,
            )
            .order_by("level", "code")
            .first()
        )

    def _is_dimension_specific_opening_account_parent(self, parent, is_postable):
        return bool(parent and self._is_opening_bank_header(parent) and is_postable)

    def create(self, validated_data):
        request = self.context["request"]
        parent = validated_data.get("parent")
        tenant_ids = sorted(
            get_user_active_dimension_codes(request.user) or [request.tenant_id]
        )
        is_postable = validated_data.get("is_postable", False)

        self._ensure_parent_is_header(parent)

        if self._is_dimension_specific_opening_account_parent(parent, is_postable):
            dim_parent = self._resolve_parent_for_dimension(parent, request.tenant_id) or parent
            validated_data["parent"] = dim_parent
            validated_data["tenant_id"] = dim_parent.tenant_id
            return super().create(validated_data)

        if parent:
            validated_data.setdefault(
                "code",
                self._generate_next_child_code(parent, tenant_ids[0]),
            )

        code = validated_data["code"]
        primary = None

        for dim_tenant in tenant_ids:
            if Account.objects.filter(
                tenant_id=dim_tenant,
                code=code,
                deleted_at__isnull=True,
            ).exists():
                existing = Account.objects.filter(
                    tenant_id=dim_tenant,
                    code=code,
                    deleted_at__isnull=True,
                ).first()
                if primary is None:
                    primary = existing
                continue

            dim_parent = self._resolve_parent_for_dimension(parent, dim_tenant)
            if parent and not dim_parent:
                continue

            payload = dict(validated_data)
            payload["tenant_id"] = dim_tenant
            payload["parent"] = dim_parent
            instance = Account.objects.create(**payload)
            if primary is None:
                primary = instance

        if primary is None:
            raise serializers.ValidationError(
                {"code": f"Account {code} already exists in all dimensions."}
            )
        return primary

    def update(self, instance, validated_data):
        if "code" in validated_data and instance.code != validated_data["code"]:
            raise serializers.ValidationError("Account code cannot be changed.")

        request = self.context["request"]
        parent = validated_data.get("parent", instance.parent)
        self._ensure_parent_is_header(parent)

        if self._is_dimension_specific_opening_account_parent(
            instance.parent,
            instance.is_postable,
        ):
            return super().update(instance, validated_data)

        tenant_ids = get_user_active_dimension_codes(request.user) or [instance.tenant_id]
        siblings = Account.objects.filter(
            tenant_id__in=tenant_ids,
            code=instance.code,
            deleted_at__isnull=True,
        )

        sync_fields = {
            key: value
            for key, value in validated_data.items()
            if key not in {"parent", "tenant_id", "code"}
        }

        for sibling in siblings:
            for field, value in sync_fields.items():
                setattr(sibling, field, value)
            if "parent" in validated_data and validated_data["parent"]:
                dim_parent = self._resolve_parent_for_dimension(
                    validated_data["parent"],
                    sibling.tenant_id,
                )
                if dim_parent:
                    sibling.parent = dim_parent
            sibling.save()

        instance.refresh_from_db()
        return instance


class AccountMiniSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    code = serializers.CharField()
    name = serializers.CharField()


class ExpenseSerializer(serializers.ModelSerializer):
    bank_account = AccountMiniSerializer(read_only=True)
    bank_account_id = serializers.UUIDField(write_only=True)
    expense_account = AccountMiniSerializer(read_only=True)
    expense_account_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = Expense
        fields = [
            "id",
            "expense_number",
            "date",
            "bank_account",
            "bank_account_id",
            "expense_account",
            "expense_account_id",
            "amount",
            "remarks",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "expense_number",
            "created_at",
            "updated_at",
        ]

    def _allowed_account_tenant_ids(self):
        # COA is shared across every dimension the user owns, so any of
        # them is a valid source for a bank / expense account.
        request = self.context["request"]
        tenant_ids = get_user_active_dimension_codes(request.user)
        current = getattr(request, "tenant_id", "") or request.user.tenant_id
        if current and current not in tenant_ids:
            tenant_ids.append(current)
        return tenant_ids

    def validate_bank_account_id(self, value):
        tenant_ids = self._allowed_account_tenant_ids()
        try:
            account = Account.objects.get(
                id=value,
                tenant_id__in=tenant_ids,
                deleted_at__isnull=True,
            )
        except Account.DoesNotExist:
            raise serializers.ValidationError("Bank account not found")

        if not account.is_active:
            raise serializers.ValidationError("Selected bank account is inactive")
        if not account.is_postable:
            raise serializers.ValidationError("Selected bank account must be postable")
        if account.account_group != Account.AccountGroup.ASSET:
            raise serializers.ValidationError("Selected bank account must belong to asset group")
        if account.account_type != Account.AccountType.BANK:
            raise serializers.ValidationError("Selected account must have account type BANK")
        return value

    def validate_expense_account_id(self, value):
        tenant_ids = self._allowed_account_tenant_ids()
        try:
            account = Account.objects.get(
                id=value,
                tenant_id__in=tenant_ids,
                deleted_at__isnull=True,
            )
        except Account.DoesNotExist:
            raise serializers.ValidationError("Expense account not found")

        if not account.is_active:
            raise serializers.ValidationError("Selected expense account is inactive")
        if not account.is_postable:
            raise serializers.ValidationError("Selected expense account must be postable")
        if account.account_group != Account.AccountGroup.EXPENSE:
            raise serializers.ValidationError("Selected expense account must belong to expense group")
        return value

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than 0")
        return value

    def _generate_expense_number(self, tenant_id):
        count = Expense.objects.filter(tenant_id=tenant_id).count() + 1
        return f"EXP-{count:05d}"

    def create(self, validated_data):
        tenant_id = self.context["request"].user.tenant_id
        bank_account_id = validated_data.pop("bank_account_id")
        expense_account_id = validated_data.pop("expense_account_id")
        return Expense.objects.create(
            tenant_id=tenant_id,
            expense_number=self._generate_expense_number(tenant_id),
            bank_account_id=bank_account_id,
            expense_account_id=expense_account_id,
            **validated_data,
        )

    def update(self, instance, validated_data):
        instance.bank_account_id = validated_data.pop("bank_account_id", instance.bank_account_id)
        instance.expense_account_id = validated_data.pop("expense_account_id", instance.expense_account_id)
        instance.date = validated_data.get("date", instance.date)
        instance.amount = validated_data.get("amount", instance.amount)
        instance.remarks = validated_data.get("remarks", instance.remarks)
        instance.save()
        return instance


class InquirySerializer(serializers.ModelSerializer):
    class Meta:
        model = Inquiry
        fields = [
            "id",
            "user",
            "user_name",
            "subject",
            "message",
            "admin_reply",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user", "status", "created_at", "updated_at"]
        extra_kwargs = {
            "user_name": {"read_only": True},
            "admin_reply": {"read_only": True},
        }

    def create(self, validated_data):
        request = self.context["request"]
        validated_data["tenant_id"] = request.tenant_id
        validated_data["user"] = request.user
        return super().create(validated_data)


class AdminInquirySerializer(serializers.ModelSerializer):
    class Meta:
        model = Inquiry
        fields = [
            "id",
            "tenant_id",
            "user_name",
            "subject",
            "message",
            "admin_reply",
            "status",
            "created_at",
        ]
        read_only_fields = ["id", "tenant_id", "user_name", "subject", "message", "created_at"]
