from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from accounts.models import Account, User
from inventory.models import Product, Supplier, Unit, Warehouse
from purchase.models import PurchaseBankPayment, PurchaseInvoice, PurchaseReturn
from purchase.serializers import PurchaseBankPaymentSerializer
from purchase.views import PurchaseInvoiceViewSet
from purchase.services import get_purchase_invoice_financials


class PurchaseBankPaymentTests(TestCase):
    def setUp(self):
        self.tenant_id = "SAMS_TRADERS"
        self.user = User.objects.create_user(
            username="tester",
            password="secret",
            tenant_id=self.tenant_id,
        )
        self.factory = APIRequestFactory()

        self.bank_account = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1110",
            name="Bank",
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.BANK,
            account_nature=Account.AccountNature.DEBIT,
            level=1,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.payable_account = Account.objects.create(
            tenant_id=self.tenant_id,
            code="2130",
            name="Suppliers Payable",
            account_group=Account.AccountGroup.LIABILITY,
            account_nature=Account.AccountNature.CREDIT,
            level=1,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.supplier = Supplier.objects.create(
            tenant_id=self.tenant_id,
            name="Supplier One",
            business_name="Supplier One",
            phone_number="123",
            address="Main road",
            account=self.payable_account,
        )
        self.warehouse = Warehouse.objects.create(
            tenant_id=self.tenant_id,
            name="Main Warehouse",
            location="Karachi",
        )
        self.unit = Unit.objects.create(tenant_id=self.tenant_id, name="Carton")
        self.product = Product.objects.create(
            tenant_id=self.tenant_id,
            name="Test Product",
            product_type="READY_MADE",
            packaging_cost=Decimal("0.00"),
            net_amount=Decimal("0.00"),
            unit=self.unit,
        )
        self.invoice = PurchaseInvoice.objects.create(
            tenant_id=self.tenant_id,
            invoice_number="PINV-00001",
            date="2026-04-20",
            supplier=self.supplier,
            warehouse=self.warehouse,
            gross_amount=Decimal("2000.00"),
            net_amount=Decimal("2000.00"),
        )

    def _get_request(self):
        request = self.factory.post("/api/purchase/purchase-bank-payments/")
        request.user = self.user
        return request

    def test_invoice_financials_subtract_returns_and_payments(self):
        PurchaseReturn.objects.create(
            tenant_id=self.tenant_id,
            return_number="PRET-00001",
            date="2026-04-20",
            supplier=self.supplier,
            purchase_invoice=self.invoice,
            gross_amount=Decimal("300.00"),
        )
        PurchaseBankPayment.objects.create(
            tenant_id=self.tenant_id,
            payment_number="PBP-00001",
            date="2026-04-20",
            supplier=self.supplier,
            purchase_invoice=self.invoice,
            bank_account=self.bank_account,
            amount=Decimal("700.00"),
        )

        financials = get_purchase_invoice_financials(self.invoice)

        self.assertEqual(financials["net_amount"], Decimal("2000.00"))
        self.assertEqual(financials["returned_amount"], Decimal("300.00"))
        self.assertEqual(financials["paid_amount"], Decimal("700.00"))
        self.assertEqual(financials["balance_amount"], Decimal("1000.00"))

    def test_serializer_blocks_payment_above_remaining_balance(self):
        PurchaseBankPayment.objects.create(
            tenant_id=self.tenant_id,
            payment_number="PBP-00001",
            date="2026-04-20",
            supplier=self.supplier,
            purchase_invoice=self.invoice,
            bank_account=self.bank_account,
            amount=Decimal("1000.00"),
        )

        serializer = PurchaseBankPaymentSerializer(
            data={
                "date": "2026-04-20",
                "supplier_id": str(self.supplier.id),
                "purchase_invoice_id": str(self.invoice.id),
                "bank_account_id": str(self.bank_account.id),
                "amount": "1500.00",
                "remarks": "Second payment",
            },
            context={"request": self._get_request()},
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("amount", serializer.errors)

    def test_serializer_requires_bank_account_type_bank(self):
        cash_account = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1112",
            name="Cash In Hand",
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.CASH,
            account_nature=Account.AccountNature.DEBIT,
            level=1,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )

        serializer = PurchaseBankPaymentSerializer(
            data={
                "date": "2026-04-20",
                "supplier_id": str(self.supplier.id),
                "purchase_invoice_id": str(self.invoice.id),
                "bank_account_id": str(cash_account.id),
                "amount": "500.00",
                "remarks": "Cash is not valid here",
            },
            context={"request": self._get_request()},
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("bank_account_id", serializer.errors)

    def test_product_options_include_product_unit(self):
        request = self.factory.get(
            "/api/purchase/purchase-invoices/product-options/",
            {"warehouse_id": str(self.warehouse.id)},
        )
        force_authenticate(request, user=self.user)

        response = PurchaseInvoiceViewSet.as_view({"get": "product_options"})(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"][0]["unit"], "Carton")
