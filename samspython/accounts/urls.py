from django.urls import path
from .views import AccountViewSet, LoginView
from rest_framework.routers import DefaultRouter


router = DefaultRouter()
router.register('login', LoginView)
router.register(r'accounts', AccountViewSet, basename="accounts")

urlpatterns = router.urls