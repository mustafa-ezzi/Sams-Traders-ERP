from rest_framework.routers import DefaultRouter

from purchase.views import (
    PurchaseBankPaymentViewSet,
    PurchaseInvoiceViewSet,
    PurchaseReturnViewSet,
)


router = DefaultRouter()
router.register(r"purchase-invoices", PurchaseInvoiceViewSet, basename="purchase-invoice")
router.register(r"purchase-returns", PurchaseReturnViewSet, basename="purchase-return")
router.register(r"purchase-bank-payments", PurchaseBankPaymentViewSet, basename="purchase-bank-payment")

urlpatterns = router.urls
