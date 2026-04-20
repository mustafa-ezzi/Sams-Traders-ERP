from datetime import date

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from accounts.models import Account
from accounts.reporting import build_ledger_report, get_descendant_account_ids
from inventory.models import Customer, Supplier

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

    @action(detail=False, methods=["get"], url_path="ledger-report")
    def ledger_report(self, request):
        tenant_id = request.user.tenant_id
        head_account_id = request.query_params.get("head_account_id")
        ledger_type = request.query_params.get("ledger_type")
        ledger_id = request.query_params.get("ledger_id")
        from_date_raw = request.query_params.get("from_date")
        to_date_raw = request.query_params.get("to_date")

        if not head_account_id:
            raise ValidationError({"head_account_id": "Account head is required."})
        if ledger_type not in {"account", "supplier", "customer"}:
            raise ValidationError({"ledger_type": "Valid ledger type is required."})
        if not ledger_id:
            raise ValidationError({"ledger_id": "COA selection is required."})
        if not from_date_raw or not to_date_raw:
            raise ValidationError({"date": "From date and to date are required."})

        try:
            from_date = date.fromisoformat(from_date_raw)
            to_date = date.fromisoformat(to_date_raw)
        except ValueError:
            raise ValidationError({"date": "Dates must be in YYYY-MM-DD format."})

        if from_date > to_date:
            raise ValidationError({"date": "From date cannot be greater than to date."})

        try:
            head_account = Account.objects.get(
                id=head_account_id,
                tenant_id=tenant_id,
                deleted_at__isnull=True,
            )
        except Account.DoesNotExist:
            raise ValidationError({"head_account_id": "Account head not found for this tenant."})

        descendant_ids = set(str(account_id) for account_id in get_descendant_account_ids(head_account))

        if ledger_type == "account":
            if ledger_id not in descendant_ids:
                raise ValidationError({"ledger_id": "Selected COA does not belong to the chosen head."})
        elif ledger_type == "supplier":
            try:
                supplier = Supplier.objects.get(
                    id=ledger_id,
                    tenant_id=tenant_id,
                    deleted_at__isnull=True,
                )
            except Supplier.DoesNotExist:
                raise ValidationError({"ledger_id": "Supplier not found for this tenant."})
            if not supplier.account_id or str(supplier.account_id) not in descendant_ids:
                raise ValidationError({"ledger_id": "Selected supplier does not belong to the chosen head."})
        else:
            try:
                customer = Customer.objects.get(
                    id=ledger_id,
                    tenant_id=tenant_id,
                    deleted_at__isnull=True,
                )
            except Customer.DoesNotExist:
                raise ValidationError({"ledger_id": "Customer not found for this tenant."})
            if not customer.account_id or str(customer.account_id) not in descendant_ids:
                raise ValidationError({"ledger_id": "Selected customer does not belong to the chosen head."})

        payload = build_ledger_report(
            tenant_id=tenant_id,
            ledger_type=ledger_type,
            ledger_id=ledger_id,
            from_date=from_date,
            to_date=to_date,
        )

        return Response(
            {
                "data": {
                    "head_account_id": head_account_id,
                    "ledger_type": ledger_type,
                    "ledger_id": ledger_id,
                    "from_date": from_date.isoformat(),
                    "to_date": to_date.isoformat(),
                    **payload,
                }
            }
        )
