from django.urls import path, include
from .views import AccountViewSet, DimensionViewSet, ExpenseViewSet, LoginView
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register(r"accounts", AccountViewSet, basename="accounts")
router.register(r"expenses", ExpenseViewSet, basename="expenses")
router.register(r"dimensions", DimensionViewSet, basename="dimensions")

urlpatterns = [
    path("login/", LoginView.as_view()),  # ✅ FIX HERE
    path("", include(router.urls)),
]
