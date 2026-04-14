from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.viewsets import ModelViewSet

from accounts.models import Account

from .serializers import AccountSerializer, LoginSerializer
from .services import login_service


class LoginView(APIView):
    def post(self, request):
        try:
            serializer = LoginSerializer(data=request.data)
            
            if not serializer.is_valid():
                raise ValidationError(serializer.errors)

            response = login_service(serializer.validated_data)

            return Response(response, status=status.HTTP_200_OK)

        except ValidationError as e:
            return Response({
                "error": True,
                "message": "Validation failed",
                "details": e.detail
            }, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response({
                "error": True,
                "message": str(e),
                "details": {}
            }, status=status.HTTP_401_UNAUTHORIZED)


class AccountViewSet(ModelViewSet):
    serializer_class = AccountSerializer

    # 🔒 tenant isolation + soft delete
    def get_queryset(self):
        return Account.objects.filter(
            tenant_id=self.request.tenant_id,
            deleted_at__isnull=True
        ).select_related("parent").prefetch_related("children").order_by("code")

    # 🔥 attach tenant automatically
    def perform_create(self, serializer):
        serializer.save(tenant_id=self.request.tenant_id)

    # 🔥 safe update (tenant protected)
    def perform_update(self, serializer):
        serializer.save()

    # 🧹 soft delete instead of hard delete
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        # ❌ prevent delete if has children
        if instance.children.filter(deleted_at__isnull=True).exists():
            return Response(
                {"detail": "Cannot delete account with children."},
                status=status.HTTP_400_BAD_REQUEST
            )

        instance.delete()  # soft delete
        return Response(status=status.HTTP_204_NO_CONTENT)