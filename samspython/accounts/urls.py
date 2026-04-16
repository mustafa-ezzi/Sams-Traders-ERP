from django.urls import path, include
from .views import AccountViewSet, LoginView
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register(r"accounts", AccountViewSet, basename="accounts")

urlpatterns = [
    path("login/", LoginView.as_view()),  # ✅ FIX HERE
    path("", include(router.urls)),
]
