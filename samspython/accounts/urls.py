from django.urls import path, include
from .views import (
    AccountViewSet,
    AdminDimensionViewSet,
    AdminInquiryViewSet,
    AdminLoginView,
    AdminUserViewSet,
    DimensionViewSet,
    ExpenseViewSet,
    InquiryViewSet,
    LoginView,
)
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register(r"accounts", AccountViewSet, basename="accounts")
router.register(r"expenses", ExpenseViewSet, basename="expenses")
router.register(r"dimensions", DimensionViewSet, basename="dimensions")
router.register(r"inquiries", InquiryViewSet, basename="inquiries")
router.register(r"admin/users", AdminUserViewSet, basename="admin-users")
router.register(r"admin/dimensions", AdminDimensionViewSet, basename="admin-dimensions")
router.register(r"admin/inquiries", AdminInquiryViewSet, basename="admin-inquiries")

urlpatterns = [
    path("login/", LoginView.as_view()),  # ✅ FIX HERE
    path("admin/login/", AdminLoginView.as_view()),
    path(
        "accounts/balance-sheet-report/",
        AccountViewSet.as_view({"get": "balance_sheet_report"}),
        name="accounts-balance-sheet-report",
    ),
    path("", include(router.urls)),
]
