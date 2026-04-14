from rest_framework import serializers

from accounts.models import Account

VALID_TENANTS = ["SAMS_TRADERS", "AM_TRADERS"]


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()
    tenant_id = serializers.ChoiceField(choices=VALID_TENANTS)


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
            "account_nature",
            "level",
            "is_postable",
            "is_active",
            "sort_order",
            "children",
        ]
        read_only_fields = ["tenant_id", "level"]

    # 🔥 show nested children (optional but ERP vibes)
    def get_children(self, obj):
        queryset = obj.children.filter(deleted_at__isnull=True).order_by("code")
        return AccountSerializer(queryset, many=True, context=self.context).data

    # 🔒 enforce tenant + validation rules
    def validate(self, data):
        request = self.context["request"]
        tenant_id = request.tenant_id

        parent = data.get("parent")

        # ❌ Cross-tenant parent
        if parent and parent.tenant_id != tenant_id:
            raise serializers.ValidationError("Invalid parent for this tenant.")

        return data

    # 🔒 enforce leaf/postable rule at API level too
    def validate_is_postable(self, value):
        instance = getattr(self, "instance", None)

        if instance and value:
            if instance.children.filter(deleted_at__isnull=True).exists():
                raise serializers.ValidationError(
                    "Account with children cannot be postable."
                )

        return value

    # 🔥 auto attach tenant (never trust payload)
    def create(self, validated_data):
        request = self.context["request"]
        validated_data["tenant_id"] = request.tenant_id
        return super().create(validated_data)

    def update(self, instance, validated_data):
        # ❌ prevent changing code if needed later (safe ERP rule)
        if "code" in validated_data and instance.code != validated_data["code"]:
            raise serializers.ValidationError("Account code cannot be changed.")

        return super().update(instance, validated_data)
