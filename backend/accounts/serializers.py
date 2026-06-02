from rest_framework import serializers

from accounts.dimensions import build_dimension_code
from accounts.models import Account, Dimension, Expense, Inquiry, User


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


class AdminLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()


class DimensionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dimension
        fields = ["id", "code", "name", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {
            "code": {"required": False, "allow_blank": True},
        }

    def validate(self, attrs):
        name = (attrs.get("name") or "").strip()
        code = build_dimension_code(name, attrs.get("code", ""))

        if not name:
            raise serializers.ValidationError({"name": "Dimension name is required."})
        if not code:
            raise serializers.ValidationError({"code": "Dimension code could not be generated."})

        queryset = Dimension.objects.all()
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.filter(code=code).exists():
            raise serializers.ValidationError({"code": "A dimension with this code already exists."})

        if queryset.filter(name__iexact=name).exists():
            raise serializers.ValidationError({"name": "A dimension with this name already exists."})

        attrs["name"] = name
        attrs["code"] = code
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

        child_codes = Account.objects.filter(
            tenant_id=tenant_id,
            parent=parent,
            deleted_at__isnull=True,
        ).values_list("code", flat=True)

        normalized_existing_codes = []
        child_code_width = len(normalized_parent_code)
        for code in child_codes:
            normalized_child_code = self._normalize_code_for_generation(code)
            normalized_existing_codes.append(int(normalized_child_code))
            child_code_width = max(child_code_width, len(normalized_child_code))

        if normalized_existing_codes:
            step = 10 ** max(child_code_width - len(normalized_parent_code), 0)
            if child_code_width == len(normalized_parent_code):
                step = max(1, 10 ** max(3 - parent.level, 0))
            base_code = int(normalized_parent_code) * (
                10 ** max(child_code_width - len(normalized_parent_code), 0)
            )
            branch_limit = base_code + (step * 10)
        else:
            if parent.level <= 1:
                step = 100
                branch_limit = int(normalized_parent_code) + 1000
            elif parent.level == 2:
                step = 10
                branch_limit = int(normalized_parent_code) + 100
            else:
                step = 1
                branch_limit = int(normalized_parent_code) + 10

        next_code_value = (
            max(normalized_existing_codes) + step
            if normalized_existing_codes
            else int(normalized_parent_code) + step
        )

        if next_code_value >= branch_limit:
            raise serializers.ValidationError(
                {"code": f"No more child account codes are available under parent {parent.code}."}
            )

        return str(next_code_value).zfill(child_code_width)

    def _ensure_parent_is_header(self, parent):
        if parent and parent.is_postable:
            parent.is_postable = False
            parent.save(update_fields=["is_postable", "updated_at"])

    def get_children(self, obj):
        queryset = obj.children.filter(deleted_at__isnull=True).order_by("code")
        return AccountSerializer(queryset, many=True, context=self.context).data

    def validate(self, data):
        request = self.context["request"]
        tenant_id = request.tenant_id

        parent_provided = "parent" in data
        parent = data.get("parent")
        if not parent_provided and self.instance is not None:
            parent = self.instance.parent

        if parent and parent.tenant_id != tenant_id:
            raise serializers.ValidationError("Invalid parent for this tenant.")

        if parent and parent.deleted_at is not None:
            raise serializers.ValidationError("Parent account cannot be soft deleted.")

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

    def create(self, validated_data):
        request = self.context["request"]
        validated_data["tenant_id"] = request.tenant_id
        self._ensure_parent_is_header(validated_data.get("parent"))
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "code" in validated_data and instance.code != validated_data["code"]:
            raise serializers.ValidationError("Account code cannot be changed.")

        self._ensure_parent_is_header(validated_data.get("parent"))
        return super().update(instance, validated_data)


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

    def validate_bank_account_id(self, value):
        tenant_id = self.context["request"].user.tenant_id
        try:
            account = Account.objects.get(
                id=value,
                tenant_id=tenant_id,
                deleted_at__isnull=True,
            )
        except Account.DoesNotExist:
            raise serializers.ValidationError("Bank account not found for this tenant")

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
        tenant_id = self.context["request"].user.tenant_id
        try:
            account = Account.objects.get(
                id=value,
                tenant_id=tenant_id,
                deleted_at__isnull=True,
            )
        except Account.DoesNotExist:
            raise serializers.ValidationError("Expense account not found for this tenant")

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
