from django.urls import include, path
from rest_framework.routers import DefaultRouter

from sales.views import SalesBankReceiptViewSet, SalesInvoiceViewSet, SalesReturnViewSet


router = DefaultRouter()
router.register(r"sales-invoices", SalesInvoiceViewSet, basename="sales-invoice")
router.register(r"sales-returns", SalesReturnViewSet, basename="sales-return")
router.register(r"sales-bank-receipts", SalesBankReceiptViewSet, basename="sales-bank-receipt")

urlpatterns = [
    path("", include(router.urls)),
]
