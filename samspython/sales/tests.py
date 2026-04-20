from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from accounts.models import Account, User
from inventory.models import Customer, Product, Warehouse
from sales.models import SalesBankReceipt, SalesInvoice, SalesReturn
from sales.serializers import SalesBankReceiptSerializer
from sales.services import get_sales_invoice_financials


class SalesBankReceiptTests(TestCase):
    def setUp(self):
        self.tenant_id = "SAMS_TRADERS"
        self.user = User.objects.create_user(
            username="sales-tester",
            password="secret",
            tenant_id=self.tenant_id,
        )
        self.factory = APIRequestFactory()

        self.bank_account = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1111",
            name="Main Bank",
            account_group=Account.AccountGroup.ASSET,
            account_nature=Account.AccountNature.DEBIT,
            level=1,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.receivable_account = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1120",
            name="Customers Receivable",
            account_group=Account.AccountGroup.ASSET,
            account_nature=Account.AccountNature.DEBIT,
            level=1,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.customer = Customer.objects.create(
            tenant_id=self.tenant_id,
            name="Customer One",
            business_name="Customer One",
            phone_number="123",
            address="Main road",
            account=self.receivable_account,
        )
        self.warehouse = Warehouse.objects.create(
            tenant_id=self.tenant_id,
            name="Main Warehouse",
            location="Karachi",
        )
        self.product = Product.objects.create(
            tenant_id=self.tenant_id,
            name="Sales Product",
            product_type="READY_MADE",
            packaging_cost=Decimal("0.00"),
            net_amount=Decimal("0.00"),
        )
        self.invoice = SalesInvoice.objects.create(
            tenant_id=self.tenant_id,
            invoice_number="SINV-00001",
            date="2026-04-20",
            customer=self.customer,
            warehouse=self.warehouse,
            gross_amount=Decimal("2000.00"),
            net_amount=Decimal("2000.00"),
        )

    def _get_request(self):
        request = self.factory.post("/api/sales/sales-bank-receipts/")
        request.user = self.user
        return request

    def test_invoice_financials_subtract_returns_and_receipts(self):
        SalesReturn.objects.create(
            tenant_id=self.tenant_id,
            return_number="SRET-00001",
            date="2026-04-20",
            customer=self.customer,
            sales_invoice=self.invoice,
            gross_amount=Decimal("300.00"),
        )
        SalesBankReceipt.objects.create(
            tenant_id=self.tenant_id,
            receipt_number="SBR-00001",
            date="2026-04-20",
            customer=self.customer,
            sales_invoice=self.invoice,
            bank_account=self.bank_account,
            amount=Decimal("700.00"),
        )

        financials = get_sales_invoice_financials(self.invoice)

        self.assertEqual(financials["net_amount"], Decimal("2000.00"))
        self.assertEqual(financials["returned_amount"], Decimal("300.00"))
        self.assertEqual(financials["received_amount"], Decimal("700.00"))
        self.assertEqual(financials["balance_amount"], Decimal("1000.00"))

    def test_serializer_blocks_receipt_above_remaining_balance(self):
        SalesBankReceipt.objects.create(
            tenant_id=self.tenant_id,
            receipt_number="SBR-00001",
            date="2026-04-20",
            customer=self.customer,
            sales_invoice=self.invoice,
            bank_account=self.bank_account,
            amount=Decimal("1000.00"),
        )

        serializer = SalesBankReceiptSerializer(
            data={
                "date": "2026-04-20",
                "customer_id": str(self.customer.id),
                "sales_invoice_id": str(self.invoice.id),
                "bank_account_id": str(self.bank_account.id),
                "amount": "1500.00",
                "remarks": "Second receipt",
            },
            context={"request": self._get_request()},
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("amount", serializer.errors)
