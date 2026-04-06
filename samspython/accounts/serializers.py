from rest_framework import serializers

VALID_TENANTS = ["SAMS_TRADERS", "AM_TRADERS"]

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()
    tenant_id = serializers.ChoiceField(choices=VALID_TENANTS)