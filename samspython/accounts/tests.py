from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from accounts.journal import (
    sync_purchase_bank_payment_journal,
    sync_purchase_invoice_journal,
    sync_sales_bank_receipt_journal,
    sync_sales_invoice_journal,
)
from accounts.models import JournalEntry
from accounts.models import Account, User
from accounts.views import AccountViewSet
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
