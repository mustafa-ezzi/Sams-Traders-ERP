from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from accounts.journal import (
    sync_expense_journal,
    sync_purchase_bank_payment_journal,
    sync_purchase_invoice_journal,
    sync_sales_bank_receipt_journal,
    sync_sales_invoice_journal,
)
from accounts.models import JournalEntry
from accounts.models import Account, Dimension, Expense, JournalLine, User
from accounts.views import AccountViewSet, DimensionViewSet, ExpenseViewSet
from inventory.models import (
    Brand,
    Category,
    Customer,
    OpeningStock,
    Product,
    ProductStock,
    RawMaterial,
    Size,
    Stock,
    Supplier,
    Unit,
    Warehouse,
)
from purchase.models import PurchaseBankPayment, PurchaseInvoice, PurchaseInvoiceLine
from sales.models import SalesBankReceipt, SalesInvoice, SalesInvoiceLine


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
            account_type=Account.AccountType.BANK,
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
            account_type=Account.AccountType.PAYABLE,
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
            account_type=Account.AccountType.RECEIVABLE,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.inventory = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1150",
            name="Inventory",
            parent=self.assets,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.INVENTORY,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.revenue_root = Account.objects.create(
            tenant_id=self.tenant_id,
            code="4000",
            name="Revenue",
            account_group=Account.AccountGroup.REVENUE,
            account_nature=Account.AccountNature.CREDIT,
            level=1,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        self.revenue = Account.objects.create(
            tenant_id=self.tenant_id,
            code="4100",
            name="Sales Revenue",
            parent=self.revenue_root,
            account_group=Account.AccountGroup.REVENUE,
            account_type=Account.AccountType.REVENUE,
            account_nature=Account.AccountNature.CREDIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.cogs_root = Account.objects.create(
            tenant_id=self.tenant_id,
            code="5000",
            name="COGS",
            account_group=Account.AccountGroup.COGS,
            account_nature=Account.AccountNature.DEBIT,
            level=1,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        self.cogs = Account.objects.create(
            tenant_id=self.tenant_id,
            code="5100",
            name="COGS Main",
            parent=self.cogs_root,
            account_group=Account.AccountGroup.COGS,
            account_type=Account.AccountType.COGS,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.category = Category.objects.create(
            tenant_id=self.tenant_id,
            name="Category",
            inventory_account=self.inventory,
            cogs_account=self.cogs,
            revenue_account=self.revenue,
        )
        self.product = Product.objects.create(
            tenant_id=self.tenant_id,
            name="Product",
            product_type="READY_MADE",
            packaging_cost=Decimal("0.00"),
            net_amount=Decimal("600.00"),
            category=self.category,
            inventory_account=self.inventory,
            cogs_account=self.cogs,
            revenue_account=self.revenue,
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
        PurchaseInvoiceLine.objects.create(
            tenant_id=self.tenant_id,
            invoice=invoice,
            product=self.product,
            quantity=Decimal("3.33"),
            rate=Decimal("600.60"),
            amount=Decimal("2000.00"),
            discount=Decimal("0.00"),
            total_amount=Decimal("2000.00"),
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
        sync_purchase_invoice_journal(invoice)
        sync_purchase_bank_payment_journal(
            PurchaseBankPayment.objects.get(payment_number="PBP-00001")
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
        SalesInvoiceLine.objects.create(
            tenant_id=self.tenant_id,
            invoice=invoice,
            product=self.product,
            quantity=Decimal("2.00"),
            rate=Decimal("600.00"),
            amount=Decimal("1200.00"),
            discount=Decimal("0.00"),
            total_amount=Decimal("1200.00"),
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
        sync_sales_invoice_journal(invoice)
        sync_sales_bank_receipt_journal(
            SalesBankReceipt.objects.get(receipt_number="SBR-00001")
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

    def test_customer_party_ledger_report_with_open_dates(self):
        sales_entry = JournalEntry.objects.create(
            tenant_id=self.tenant_id,
            date="2026-04-01",
            reference="SINV-00001",
            source_type=JournalEntry.SourceType.SALES_INVOICE,
            source_id="11111111-1111-1111-1111-111111111111",
            document_type="Sales Invoice",
            description="Invoice created",
            people_type="Customer",
            people_name=self.customer.business_name,
        )
        JournalLine.objects.create(
            tenant_id=self.tenant_id,
            journal_entry=sales_entry,
            account=self.customer_account,
            debit=Decimal("2000.00"),
            credit=Decimal("0.00"),
            people_type="Customer",
            people_name=self.customer.business_name,
            line_description="Invoice created",
        )

        receipt_entry = JournalEntry.objects.create(
            tenant_id=self.tenant_id,
            date="2026-04-02",
            reference="SBR-00001",
            source_type=JournalEntry.SourceType.SALES_BANK_RECEIPT,
            source_id="22222222-2222-2222-2222-222222222222",
            document_type="Bank Receipt",
            description="Receipt posted",
            people_type="Customer",
            people_name=self.customer.business_name,
        )
        JournalLine.objects.create(
            tenant_id=self.tenant_id,
            journal_entry=receipt_entry,
            account=self.customer_account,
            debit=Decimal("0.00"),
            credit=Decimal("500.00"),
            people_type="Customer",
            people_name=self.customer.business_name,
            line_description="Receipt posted",
        )

        request = self.factory.get(
            "/api/accounts/accounts/party-ledger-report/",
            {
                "partner_type": "customer",
                "partner_id": str(self.customer.id),
            },
        )
        force_authenticate(request, user=self.user)
        response = AccountViewSet.as_view({"get": "party_ledger_report"})(request)

        self.assertEqual(response.status_code, 200)
        payload = response.data["data"]
        self.assertEqual(payload["from_date"], "")
        self.assertEqual(payload["to_date"], "")
        self.assertEqual(len(payload["rows"]), 2)
        self.assertEqual(payload["rows"][0]["credit"], "2000.00")
        self.assertEqual(payload["rows"][0]["debit"], "0.00")
        self.assertEqual(payload["rows"][1]["credit"], "0.00")
        self.assertEqual(payload["rows"][1]["debit"], "500.00")
        self.assertEqual(payload["summary"]["grand_total"], "1500.00")
        totals = {item["label"]: item["amount"] for item in payload["summary"]["document_totals"]}
        self.assertEqual(totals["Sales Invoice"], "2000.00")
        self.assertEqual(totals["Bank Receipt"], "500.00")

    def test_customer_party_ledger_report_uses_invoice_return_receipt_formula(self):
        sales_entry = JournalEntry.objects.create(
            tenant_id=self.tenant_id,
            date="2026-04-01",
            reference="SINV-00002",
            source_type=JournalEntry.SourceType.SALES_INVOICE,
            source_id="33333333-3333-3333-3333-333333333333",
            document_type="Sales Invoice",
            description="Invoice created",
            people_type="Customer",
            people_name=self.customer.business_name,
        )
        JournalLine.objects.create(
            tenant_id=self.tenant_id,
            journal_entry=sales_entry,
            account=self.customer_account,
            debit=Decimal("2000.00"),
            credit=Decimal("0.00"),
            people_type="Customer",
            people_name=self.customer.business_name,
        )

        return_entry = JournalEntry.objects.create(
            tenant_id=self.tenant_id,
            date="2026-04-03",
            reference="SRET-00001",
            source_type=JournalEntry.SourceType.SALES_RETURN,
            source_id="44444444-4444-4444-4444-444444444444",
            document_type="Sales Return",
            description="Goods returned",
            people_type="Customer",
            people_name=self.customer.business_name,
        )
        JournalLine.objects.create(
            tenant_id=self.tenant_id,
            journal_entry=return_entry,
            account=self.customer_account,
            debit=Decimal("0.00"),
            credit=Decimal("300.00"),
            people_type="Customer",
            people_name=self.customer.business_name,
        )

        receipt_entry = JournalEntry.objects.create(
            tenant_id=self.tenant_id,
            date="2026-04-04",
            reference="SBR-00002",
            source_type=JournalEntry.SourceType.SALES_BANK_RECEIPT,
            source_id="55555555-5555-5555-5555-555555555555",
            document_type="Bank Receipt",
            description="Amount received",
            people_type="Customer",
            people_name=self.customer.business_name,
        )
        JournalLine.objects.create(
            tenant_id=self.tenant_id,
            journal_entry=receipt_entry,
            account=self.customer_account,
            debit=Decimal("0.00"),
            credit=Decimal("700.00"),
            people_type="Customer",
            people_name=self.customer.business_name,
        )

        request = self.factory.get(
            "/api/accounts/accounts/party-ledger-report/",
            {
                "partner_type": "customer",
                "partner_id": str(self.customer.id),
            },
        )
        force_authenticate(request, user=self.user)
        response = AccountViewSet.as_view({"get": "party_ledger_report"})(request)

        self.assertEqual(response.status_code, 200)
        payload = response.data["data"]
        totals = {item["label"]: item["amount"] for item in payload["summary"]["document_totals"]}
        self.assertEqual(totals["Sales Invoice"], "2000.00")
        self.assertEqual(totals["Sales Return"], "300.00")
        self.assertEqual(totals["Bank Receipt"], "700.00")
        self.assertEqual(payload["summary"]["grand_total"], "1000.00")


class AccountSoftDeleteProtectionTests(TestCase):
    def setUp(self):
        self.tenant_id = "SAMS_TRADERS"
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
            account_type=Account.AccountType.BANK,
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
            account_type=Account.AccountType.PAYABLE,
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
            account_type=Account.AccountType.RECEIVABLE,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.user = User.objects.create_user(
            username="delete-user",
            password="secret",
            tenant_id=self.tenant_id,
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

    def test_cannot_delete_bank_account_used_in_purchase_bank_payment(self):
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

        with self.assertRaises(ValidationError):
            self.bank.delete()

    def test_cannot_delete_bank_account_used_in_sales_bank_receipt(self):
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

        with self.assertRaises(ValidationError):
            self.bank.delete()


class OpeningAccountsStructureTests(TestCase):
    def setUp(self):
        self.tenant_id = "SAMS_TRADERS"
        self.user = User.objects.create_user(
            username="opening-accounts-user",
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
        self.current_asset = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1100",
            name="Current Asset",
            parent=self.assets,
            account_group=Account.AccountGroup.ASSET,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        self.bank_root = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1110",
            name="Bank",
            parent=self.current_asset,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.BANK,
            account_nature=Account.AccountNature.DEBIT,
            level=3,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )

    def _build_request(self, method, path, data=None):
        request_factory = getattr(self.factory, method)
        request = request_factory(path, data=data or {}, format="json")
        force_authenticate(request, user=self.user)
        request.tenant_id = self.tenant_id
        return request

    def test_can_create_opening_bank_under_1110(self):
        request = self._build_request(
            "post",
            "/accounts/accounts/opening-banks/",
            {"name": "Bank Alfalah", "is_active": True},
        )

        response = AccountViewSet.as_view({"post": "create_opening_bank"})(request)

        self.assertEqual(response.status_code, 201)
        created = Account.objects.get(name="Bank Alfalah")
        self.assertEqual(created.code, "1111")
        self.assertEqual(created.parent_id, self.bank_root.id)
        self.assertFalse(created.is_postable)
        self.assertEqual(created.account_type, Account.AccountType.BANK)
        self.assertEqual(created.level, 4)

    def test_create_opening_bank_normalizes_postable_1110_root(self):
        self.bank_root.is_postable = True
        self.bank_root.save()

        request = self._build_request(
            "post",
            "/accounts/accounts/opening-banks/",
            {"name": "Bank Al Habib", "is_active": True},
        )

        response = AccountViewSet.as_view({"post": "create_opening_bank"})(request)

        self.assertEqual(response.status_code, 201)
        self.bank_root.refresh_from_db()
        self.assertFalse(self.bank_root.is_postable)
        created = Account.objects.get(name="Bank Al Habib")
        self.assertEqual(created.code, "1111")

    def test_can_create_opening_account_under_opening_bank(self):
        bank = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1111",
            name="Bank Alfalah",
            parent=self.bank_root,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.BANK,
            account_nature=Account.AccountNature.DEBIT,
            level=3,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )

        request = self._build_request(
            "post",
            "/accounts/accounts/opening-account-items/",
            {"bank_id": str(bank.id), "name": "Current Account", "is_active": True},
        )

        response = AccountViewSet.as_view({"post": "create_opening_account_item"})(request)

        self.assertEqual(response.status_code, 201)
        created = Account.objects.get(name="Current Account")
        self.assertEqual(created.code, "11111")
        self.assertEqual(created.parent_id, bank.id)
        self.assertTrue(created.is_postable)
        self.assertEqual(created.level, 5)

    def test_opening_accounts_endpoint_returns_banks_with_children(self):
        bank = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1111",
            name="Bank Alfalah",
            parent=self.bank_root,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.BANK,
            account_nature=Account.AccountNature.DEBIT,
            level=3,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        Account.objects.create(
            tenant_id=self.tenant_id,
            code="11111",
            name="Current Account",
            parent=bank,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.BANK,
            account_nature=Account.AccountNature.DEBIT,
            level=4,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )

        request = self._build_request("get", "/accounts/accounts/opening-accounts/")
        response = AccountViewSet.as_view({"get": "opening_accounts"})(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["root"]["code"], "1110")
        self.assertEqual(response.data["data"]["banks"][0]["code"], "1111")
        self.assertEqual(response.data["data"]["banks"][0]["children"][0]["code"], "11111")


class DimensionManagementTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="dimension-admin",
            email="dimension-admin@test.com",
            password="secret123",
            tenant_id="SAMS_TRADERS",
        )
        self.factory = APIRequestFactory()

    def test_can_create_dimension_and_seed_default_coa(self):
        request = self.factory.post(
            "/api/accounts/dimensions/",
            {"name": "North Division", "code": "NORTH_DIVISION", "is_active": True},
            format="json",
        )
        force_authenticate(request, user=self.user)

        response = DimensionViewSet.as_view({"post": "create"})(request)

        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            Dimension.objects.filter(code="NORTH_DIVISION", name="North Division", is_active=True).exists()
        )
        self.assertTrue(
            Account.objects.filter(tenant_id="NORTH_DIVISION", code="1000", deleted_at__isnull=True).exists()
        )
        self.assertTrue(
            Account.objects.filter(tenant_id="NORTH_DIVISION", code="1110", deleted_at__isnull=True).exists()
        )

    def test_dimension_code_can_be_generated_from_name(self):
        request = self.factory.post(
            "/api/accounts/dimensions/",
            {"name": "South Zone", "code": "", "is_active": True},
            format="json",
        )
        force_authenticate(request, user=self.user)

        response = DimensionViewSet.as_view({"post": "create"})(request)

        self.assertEqual(response.status_code, 201)
        self.assertTrue(Dimension.objects.filter(code="SOUTH_ZONE").exists())

    def test_can_delete_unused_dimension_and_seeded_accounts(self):
        dimension = Dimension.objects.create(code="TEMP_DIM", name="Temp Dimension", is_active=True)
        Account.objects.create(
            tenant_id="TEMP_DIM",
            code="1000",
            name="Asset",
            account_group=Account.AccountGroup.ASSET,
            account_nature=Account.AccountNature.DEBIT,
            level=1,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )

        request = self.factory.delete(f"/api/accounts/dimensions/{dimension.id}/")
        force_authenticate(request, user=self.user)

        response = DimensionViewSet.as_view({"delete": "destroy"})(request, pk=dimension.id)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(Dimension.objects.filter(id=dimension.id).exists())
        self.assertFalse(Account.objects.filter(tenant_id="TEMP_DIM").exists())

    def test_cannot_delete_dimension_with_active_users(self):
        dimension = Dimension.objects.create(code="LOCKED_DIM", name="Locked Dimension", is_active=True)
        User.objects.create_user(
            username="locked-user",
            email="locked@test.com",
            password="secret123",
            tenant_id="LOCKED_DIM",
        )

        request = self.factory.delete(f"/api/accounts/dimensions/{dimension.id}/")
        force_authenticate(request, user=self.user)

        response = DimensionViewSet.as_view({"delete": "destroy"})(request, pk=dimension.id)

        self.assertEqual(response.status_code, 400)
        self.assertTrue(Dimension.objects.filter(id=dimension.id).exists())


class CoaCompletenessReportTests(TestCase):
    def setUp(self):
        self.tenant_id = "SAMS_TRADERS"
        self.user = User.objects.create_user(
            username="coa-report-user",
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
        self.inventory_account = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1150",
            name="Inventory",
            parent=self.assets,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.INVENTORY,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.other_inventory_account = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1151",
            name="Other Inventory",
            parent=self.assets,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.INVENTORY,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.revenue_root = Account.objects.create(
            tenant_id=self.tenant_id,
            code="4000",
            name="Revenue",
            account_group=Account.AccountGroup.REVENUE,
            account_nature=Account.AccountNature.CREDIT,
            level=1,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        self.revenue_account = Account.objects.create(
            tenant_id=self.tenant_id,
            code="4100",
            name="Sales Revenue",
            parent=self.revenue_root,
            account_group=Account.AccountGroup.REVENUE,
            account_type=Account.AccountType.REVENUE,
            account_nature=Account.AccountNature.CREDIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.other_revenue_account = Account.objects.create(
            tenant_id=self.tenant_id,
            code="4101",
            name="Other Sales Revenue",
            parent=self.revenue_root,
            account_group=Account.AccountGroup.REVENUE,
            account_type=Account.AccountType.REVENUE,
            account_nature=Account.AccountNature.CREDIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.cogs_root = Account.objects.create(
            tenant_id=self.tenant_id,
            code="5000",
            name="COGS",
            account_group=Account.AccountGroup.COGS,
            account_nature=Account.AccountNature.DEBIT,
            level=1,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        self.cogs_account = Account.objects.create(
            tenant_id=self.tenant_id,
            code="5100",
            name="COGS Main",
            parent=self.cogs_root,
            account_group=Account.AccountGroup.COGS,
            account_type=Account.AccountType.COGS,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )

        from inventory.models import Category, Product, RawMaterial, Brand, Size, Unit

        self.category_missing = Category.objects.create(
            tenant_id=self.tenant_id,
            name="Category Missing",
            inventory_account=self.inventory_account,
        )
        self.category_full = Category.objects.create(
            tenant_id=self.tenant_id,
            name="Category Full",
            inventory_account=self.inventory_account,
            cogs_account=self.cogs_account,
            revenue_account=self.revenue_account,
        )
        brand = Brand.objects.create(tenant_id=self.tenant_id, name="Brand")
        size = Size.objects.create(tenant_id=self.tenant_id, name="Size")
        unit = Unit.objects.create(tenant_id=self.tenant_id, name="Unit")

        RawMaterial.objects.create(
            tenant_id=self.tenant_id,
            name="Raw Missing",
            brand=brand,
            category=self.category_full,
            size=size,
            purchase_unit=unit,
            selling_unit=unit,
            purchase_price=Decimal("10.00"),
            selling_price=Decimal("12.00"),
        )
        Product.objects.create(
            tenant_id=self.tenant_id,
            name="Product Missing",
            product_type="READY_MADE",
            packaging_cost=Decimal("5.00"),
            net_amount=Decimal("5.00"),
            category=self.category_full,
        )
        Product.objects.create(
            tenant_id=self.tenant_id,
            name="Product Mismatch",
            product_type="READY_MADE",
            packaging_cost=Decimal("8.00"),
            net_amount=Decimal("8.00"),
            category=self.category_full,
            inventory_account=self.other_inventory_account,
            cogs_account=self.cogs_account,
            revenue_account=self.other_revenue_account,
        )

    def test_coa_completeness_report_returns_missing_and_mismatch_rows(self):
        request = self.factory.get("/api/accounts/accounts/coa-completeness-report/")
        force_authenticate(request, user=self.user)
        response = AccountViewSet.as_view({"get": "coa_completeness_report"})(request)

        self.assertEqual(response.status_code, 200)
        payload = response.data["data"]
        self.assertEqual(payload["summary"]["categories_missing_count"], 1)
        self.assertEqual(payload["summary"]["raw_materials_missing_count"], 1)
        self.assertEqual(payload["summary"]["products_missing_count"], 1)
        self.assertEqual(payload["summary"]["product_mismatch_count"], 2)


class JournalPostingTests(TestCase):
    def setUp(self):
        self.tenant_id = "SAMS_TRADERS"
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
        self.inventory = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1150",
            name="Inventory",
            parent=self.assets,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.INVENTORY,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.bank = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1110",
            name="Main Bank",
            parent=self.assets,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.BANK,
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
            account_type=Account.AccountType.PAYABLE,
            account_nature=Account.AccountNature.CREDIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.revenue_root = Account.objects.create(
            tenant_id=self.tenant_id,
            code="4000",
            name="Revenue",
            account_group=Account.AccountGroup.REVENUE,
            account_nature=Account.AccountNature.CREDIT,
            level=1,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        self.revenue = Account.objects.create(
            tenant_id=self.tenant_id,
            code="4100",
            name="Sales Revenue",
            parent=self.revenue_root,
            account_group=Account.AccountGroup.REVENUE,
            account_type=Account.AccountType.REVENUE,
            account_nature=Account.AccountNature.CREDIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.cogs_root = Account.objects.create(
            tenant_id=self.tenant_id,
            code="5000",
            name="COGS",
            account_group=Account.AccountGroup.COGS,
            account_nature=Account.AccountNature.DEBIT,
            level=1,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        self.cogs = Account.objects.create(
            tenant_id=self.tenant_id,
            code="5100",
            name="COGS Main",
            parent=self.cogs_root,
            account_group=Account.AccountGroup.COGS,
            account_type=Account.AccountType.COGS,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.receivable = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1120",
            name="Receivables",
            parent=self.assets,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.RECEIVABLE,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )

    def test_purchase_invoice_creates_balanced_journal_entry(self):
        from inventory.models import Category, Product, Supplier, Warehouse
        from purchase.models import PurchaseInvoice, PurchaseInvoiceLine

        category = Category.objects.create(
            tenant_id=self.tenant_id,
            name="Cat",
            inventory_account=self.inventory,
            cogs_account=self.cogs,
            revenue_account=self.revenue,
        )
        product = Product.objects.create(
            tenant_id=self.tenant_id,
            name="Prod",
            product_type="READY_MADE",
            packaging_cost=Decimal("0.00"),
            net_amount=Decimal("50.00"),
            category=category,
        )
        supplier = Supplier.objects.create(
            tenant_id=self.tenant_id,
            name="Supp",
            business_name="Supp",
            phone_number="123",
            address="Addr",
            account=self.payables,
        )
        warehouse = Warehouse.objects.create(
            tenant_id=self.tenant_id,
            name="Main",
            location="Karachi",
        )
        invoice = PurchaseInvoice.objects.create(
            tenant_id=self.tenant_id,
            invoice_number="PINV-10001",
            date="2026-04-21",
            supplier=supplier,
            warehouse=warehouse,
            gross_amount=Decimal("100.00"),
            net_amount=Decimal("90.00"),
            invoice_discount=Decimal("10.00"),
        )
        PurchaseInvoiceLine.objects.create(
            tenant_id=self.tenant_id,
            invoice=invoice,
            product=product,
            quantity=Decimal("2.00"),
            rate=Decimal("50.00"),
            amount=Decimal("100.00"),
            discount=Decimal("0.00"),
            total_amount=Decimal("100.00"),
        )

        sync_purchase_invoice_journal(invoice)

        entry = JournalEntry.objects.get(
            tenant_id=self.tenant_id,
            source_type=JournalEntry.SourceType.PURCHASE_INVOICE,
            source_id=invoice.id,
            deleted_at__isnull=True,
        )
        self.assertEqual(entry.lines.filter(deleted_at__isnull=True).count(), 2)
        self.assertEqual(
            sum(line.debit for line in entry.lines.filter(deleted_at__isnull=True)),
            Decimal("90.00"),
        )
        self.assertEqual(
            sum(line.credit for line in entry.lines.filter(deleted_at__isnull=True)),
            Decimal("90.00"),
        )


class DashboardOverviewTests(TestCase):
    def setUp(self):
        self.tenant_id = "SAMS_TRADERS"
        self.user = User.objects.create_user(
            username="dashboard-user",
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
        self.inventory = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1150",
            name="Inventory",
            parent=self.assets,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.INVENTORY,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.bank = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1110",
            name="Bank",
            parent=self.assets,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.BANK,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.receivable = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1120",
            name="Receivables",
            parent=self.assets,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.RECEIVABLE,
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
        self.payable = Account.objects.create(
            tenant_id=self.tenant_id,
            code="2130",
            name="Payables",
            parent=self.liabilities,
            account_group=Account.AccountGroup.LIABILITY,
            account_type=Account.AccountType.PAYABLE,
            account_nature=Account.AccountNature.CREDIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.revenue_root = Account.objects.create(
            tenant_id=self.tenant_id,
            code="4000",
            name="Revenue",
            account_group=Account.AccountGroup.REVENUE,
            account_nature=Account.AccountNature.CREDIT,
            level=1,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        self.revenue = Account.objects.create(
            tenant_id=self.tenant_id,
            code="4100",
            name="Sales Revenue",
            parent=self.revenue_root,
            account_group=Account.AccountGroup.REVENUE,
            account_type=Account.AccountType.REVENUE,
            account_nature=Account.AccountNature.CREDIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.cogs_root = Account.objects.create(
            tenant_id=self.tenant_id,
            code="5000",
            name="COGS",
            account_group=Account.AccountGroup.COGS,
            account_nature=Account.AccountNature.DEBIT,
            level=1,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        self.cogs = Account.objects.create(
            tenant_id=self.tenant_id,
            code="5100",
            name="COGS Main",
            parent=self.cogs_root,
            account_group=Account.AccountGroup.COGS,
            account_type=Account.AccountType.COGS,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )

        category = Category.objects.create(
            tenant_id=self.tenant_id,
            name="Category",
            inventory_account=self.inventory,
            cogs_account=self.cogs,
            revenue_account=self.revenue,
        )
        self.product = Product.objects.create(
            tenant_id=self.tenant_id,
            name="Product",
            product_type="READY_MADE",
            packaging_cost=Decimal("0.00"),
            net_amount=Decimal("50.00"),
            category=category,
            inventory_account=self.inventory,
            cogs_account=self.cogs,
            revenue_account=self.revenue,
        )
        unit = Unit.objects.create(tenant_id=self.tenant_id, name="Unit")
        self.raw_material = RawMaterial.objects.create(
            tenant_id=self.tenant_id,
            name="Raw",
            brand=Brand.objects.create(tenant_id=self.tenant_id, name="Brand"),
            category=category,
            size=Size.objects.create(tenant_id=self.tenant_id, name="Size"),
            purchase_unit=unit,
            selling_unit=unit,
            inventory_account=self.inventory,
            purchase_price=Decimal("10.00"),
            selling_price=Decimal("12.00"),
        )
        self.customer = Customer.objects.create(
            tenant_id=self.tenant_id,
            name="Cust",
            business_name="Cust",
            phone_number="123",
            address="Addr",
            account=self.receivable,
        )
        self.supplier = Supplier.objects.create(
            tenant_id=self.tenant_id,
            name="Supp",
            business_name="Supp",
            phone_number="123",
            address="Addr",
            account=self.payable,
        )
        self.warehouse = Warehouse.objects.create(
            tenant_id=self.tenant_id,
            name="Main",
            location="Karachi",
        )
        Stock.objects.create(
            tenant_id=self.tenant_id,
            warehouse=self.warehouse,
            raw_material=self.raw_material,
            quantity=Decimal("5.00"),
        )
        ProductStock.objects.create(
            tenant_id=self.tenant_id,
            warehouse=self.warehouse,
            product=self.product,
            quantity=Decimal("4.00"),
        )
        OpeningStock.objects.create(
            tenant_id=self.tenant_id,
            date="2026-04-01",
            warehouse=self.warehouse,
            raw_material=self.raw_material,
            quantity=Decimal("5.00"),
        )
        JournalEntry.objects.create(
            tenant_id=self.tenant_id,
            date="2026-04-21",
            reference="JR-1",
            source_type=JournalEntry.SourceType.PURCHASE_BANK_PAYMENT,
            source_id="11111111-1111-1111-1111-111111111111",
            document_type="Bank Payment",
            description="Demo journal",
            people_type="Supplier",
            people_name="Supp",
        )

    def test_dashboard_overview_returns_expected_sections(self):
        request = self.factory.get("/api/accounts/accounts/dashboard-overview/")
        force_authenticate(request, user=self.user)
        response = AccountViewSet.as_view({"get": "dashboard_overview"})(request)

        self.assertEqual(response.status_code, 200)
        data = response.data["data"]
        self.assertIn("counts", data)
        self.assertIn("kpis", data)
        self.assertIn("monthly_trends", data)
        self.assertIn("stock_mix", data)
        self.assertIn("journal_health", data)
        self.assertEqual(data["counts"]["products"], 1)
        self.assertEqual(data["counts"]["raw_materials"], 1)
        self.assertEqual(data["counts"]["customers"], 1)
        self.assertEqual(data["counts"]["suppliers"], 1)


class ExpenseTests(TestCase):
    def setUp(self):
        self.tenant_id = "SAMS_TRADERS"
        self.user = User.objects.create_user(
            username="expense-user",
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
            account_type=Account.AccountType.BANK,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.expense_root = Account.objects.create(
            tenant_id=self.tenant_id,
            code="6000",
            name="Expenses",
            account_group=Account.AccountGroup.EXPENSE,
            account_nature=Account.AccountNature.DEBIT,
            level=1,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        self.expense_account = Account.objects.create(
            tenant_id=self.tenant_id,
            code="6100",
            name="Utilities Expense",
            parent=self.expense_root,
            account_group=Account.AccountGroup.EXPENSE,
            account_type=Account.AccountType.GENERAL,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )

    def test_expense_viewset_creates_and_posts_journal(self):
        request = self.factory.post(
            "/api/accounts/expenses/",
            {
                "date": "2026-04-22",
                "bank_account_id": str(self.bank.id),
                "expense_account_id": str(self.expense_account.id),
                "amount": "1500.00",
                "remarks": "Electricity bill",
            },
            format="json",
        )
        force_authenticate(request, user=self.user)
        response = ExpenseViewSet.as_view({"post": "create"})(request)

        self.assertEqual(response.status_code, 201)
        expense = Expense.objects.get(
            tenant_id=self.tenant_id,
            deleted_at__isnull=True,
        )
        self.assertEqual(expense.amount, Decimal("1500.00"))
        self.assertEqual(expense.bank_account_id, self.bank.id)
        self.assertEqual(expense.expense_account_id, self.expense_account.id)
        self.assertTrue(
            JournalEntry.objects.filter(
                tenant_id=self.tenant_id,
                source_type=JournalEntry.SourceType.EXPENSE,
                source_id=expense.id,
                deleted_at__isnull=True,
            ).exists()
        )

    def test_expense_journal_posts_debit_expense_credit_bank(self):
        expense = Expense.objects.create(
            tenant_id=self.tenant_id,
            expense_number="EXP-00001",
            date="2026-04-22",
            bank_account=self.bank,
            expense_account=self.expense_account,
            amount=Decimal("1500.00"),
            remarks="Electricity bill",
        )

        sync_expense_journal(expense)

        entry = JournalEntry.objects.get(
            tenant_id=self.tenant_id,
            source_type=JournalEntry.SourceType.EXPENSE,
            source_id=expense.id,
            deleted_at__isnull=True,
        )
        lines = list(entry.lines.filter(deleted_at__isnull=True).order_by("created_at"))
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[0].account_id, self.expense_account.id)
        self.assertEqual(lines[0].debit, Decimal("1500.00"))
        self.assertEqual(lines[1].account_id, self.bank.id)
        self.assertEqual(lines[1].credit, Decimal("1500.00"))
