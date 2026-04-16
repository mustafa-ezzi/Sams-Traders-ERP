from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
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
            return Response(
                {
                    "error": True,
                    "message": "Validation failed",
                    "details": e.detail,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        except Exception as e:
            return Response(
                {
                    "error": True,
                    "message": str(e),
                    "details": {},
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )


class AccountViewSet(ModelViewSet):
    serializer_class = AccountSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = (
            Account.objects.filter(
                tenant_id=self.request.tenant_id,
                deleted_at__isnull=True,
            )
            .select_related("parent")
            .prefetch_related("children")
            .order_by("code")
        )

        if self.action == "list":
            queryset = queryset.filter(parent__isnull=True)

        return queryset

    def perform_create(self, serializer):
        serializer.save(tenant_id=self.request.tenant_id)

    def perform_update(self, serializer):
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        try:
            instance.delete()
        except DjangoValidationError as exc:
            return Response(
                {"detail": exc.messages[0]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)
