from rest_framework import serializers

from accounts.models import Account

VALID_TENANTS = ["SAMS_TRADERS", "AM_TRADERS"]


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


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
