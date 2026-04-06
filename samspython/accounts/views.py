from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import ValidationError

from .serializers import LoginSerializer
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