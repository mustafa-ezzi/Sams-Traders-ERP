from rest_framework import serializers

from accounts.dimensions import build_dimension_code
from accounts.models import Account, Dimension, Expense


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
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

        if parent and parent.is_postable:
            raise serializers.ValidationError("Cannot assign a postable account as parent.")

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
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "code" in validated_data and instance.code != validated_data["code"]:
            raise serializers.ValidationError("Account code cannot be changed.")

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
