from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from accounts.models import Account, User
from accounts.views import AccountViewSet
from inventory.models import Customer, Supplier, Warehouse
from purchase.models import PurchaseBankPayment, PurchaseInvoice
from sales.models import SalesBankReceipt, SalesInvoice


class LedgerReportTests(TestCase):
    def setUp(self):
        self.tenant_id = "SAMS_TRADERS"
        self.user = User.objects.create_user(
            username="ledger-user",
            password="secret",
            tenant_id=self.tenant_id,
        )
        self.factory = APIRequestFactory()

        self.assets = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1000",
            name="Assets",
            account_group=Account.AccountGroup.ASSET,
            account_nature=Account.AccountNature.DEBIT,
            level=1,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        self.bank = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1110",
            name="Main Bank",
            parent=self.assets,
            account_group=Account.AccountGroup.ASSET,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.liabilities = Account.objects.create(
            tenant_id=self.tenant_id,
            code="2000",
            name="Liabilities",
            account_group=Account.AccountGroup.LIABILITY,
            account_nature=Account.AccountNature.CREDIT,
            level=1,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        self.payables = Account.objects.create(
            tenant_id=self.tenant_id,
            code="2130",
            name="Payables",
            parent=self.liabilities,
            account_group=Account.AccountGroup.LIABILITY,
            account_nature=Account.AccountNature.CREDIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.customer_account = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1120",
            name="Receivables",
            parent=self.assets,
            account_group=Account.AccountGroup.ASSET,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )

        self.supplier = Supplier.objects.create(
            tenant_id=self.tenant_id,
            name="Supp",
            business_name="Supp",
            phone_number="123",
            address="A",
            account=self.payables,
        )
        self.customer = Customer.objects.create(
            tenant_id=self.tenant_id,
            name="Cust",
            business_name="Cust",
            phone_number="321",
            address="B",
            account=self.customer_account,
        )
        self.warehouse = Warehouse.objects.create(
            tenant_id=self.tenant_id,
            name="Main",
            location="Karachi",
        )

    def test_supplier_ledger_report(self):
        invoice = PurchaseInvoice.objects.create(
            tenant_id=self.tenant_id,
            invoice_number="PINV-00001",
            date="2026-04-01",
            supplier=self.supplier,
            warehouse=self.warehouse,
            net_amount=Decimal("2000.00"),
            gross_amount=Decimal("2000.00"),
        )
        PurchaseBankPayment.objects.create(
            tenant_id=self.tenant_id,
            payment_number="PBP-00001",
            date="2026-04-02",
            supplier=self.supplier,
            purchase_invoice=invoice,
            bank_account=self.bank,
            amount=Decimal("1000.00"),
        )

        request = self.factory.get(
            "/api/accounts/accounts/ledger-report/",
            {
                "head_account_id": str(self.liabilities.id),
                "ledger_type": "supplier",
                "ledger_id": str(self.supplier.id),
                "from_date": "2026-04-01",
                "to_date": "2026-04-30",
            },
        )
        force_authenticate(request, user=self.user)
        response = AccountViewSet.as_view({"get": "ledger_report"})(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["data"]["rows"]), 2)
        self.assertEqual(response.data["data"]["total_debit"], "1000.00")
        self.assertEqual(response.data["data"]["total_credit"], "2000.00")

    def test_bank_account_ledger_report(self):
        invoice = SalesInvoice.objects.create(
            tenant_id=self.tenant_id,
            invoice_number="SINV-00001",
            date="2026-04-01",
            customer=self.customer,
            warehouse=self.warehouse,
            net_amount=Decimal("1200.00"),
            gross_amount=Decimal("1200.00"),
        )
        SalesBankReceipt.objects.create(
            tenant_id=self.tenant_id,
            receipt_number="SBR-00001",
            date="2026-04-03",
            customer=self.customer,
            sales_invoice=invoice,
            bank_account=self.bank,
            amount=Decimal("500.00"),
        )

        request = self.factory.get(
            "/api/accounts/accounts/ledger-report/",
            {
                "head_account_id": str(self.assets.id),
                "ledger_type": "account",
                "ledger_id": str(self.bank.id),
                "from_date": "2026-04-01",
                "to_date": "2026-04-30",
            },
        )
        force_authenticate(request, user=self.user)
        response = AccountViewSet.as_view({"get": "ledger_report"})(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["data"]["rows"]), 1)
        self.assertEqual(response.data["data"]["total_debit"], "500.00")
        self.assertEqual(response.data["data"]["total_credit"], "0.00")

# Create your tests here.
