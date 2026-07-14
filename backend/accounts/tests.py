from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate
from rest_framework_simplejwt.tokens import RefreshToken

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
    Salesman,
    Size,
    Stock,
    Supplier,
    Unit,
    Warehouse,
)
from purchase.models import PurchaseBankPayment, PurchaseBankPaymentLine, PurchaseInvoice, PurchaseInvoiceLine
from sales.models import SalesBankReceipt, SalesBankReceiptLine, SalesInvoice, SalesInvoiceLine


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
        payment = PurchaseBankPayment.objects.create(
            tenant_id=self.tenant_id,
            payment_number="PBP-00001",
            date="2026-04-02",
            bank_account=self.bank,
            amount=Decimal("1000.00"),
        )
        PurchaseBankPaymentLine.objects.create(
            tenant_id=self.tenant_id,
            payment=payment,
            supplier=self.supplier,
            purchase_invoice=invoice,
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
        receipt = SalesBankReceipt.objects.create(
            tenant_id=self.tenant_id,
            receipt_number="SBR-00001",
            date="2026-04-03",
            amount=Decimal("500.00"),
        )
        SalesBankReceiptLine.objects.create(
            tenant_id=self.tenant_id,
            receipt=receipt,
            customer=self.customer,
            sales_invoice=invoice,
            receipt_against="INVOICE",
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

    def test_balance_sheet_report_uses_actual_coa_balances_without_forcing_balance(self):
        equity_root = Account.objects.create(
            tenant_id=self.tenant_id,
            code="3000",
            name="Equity",
            account_group=Account.AccountGroup.EQUITY,
            account_nature=Account.AccountNature.CREDIT,
            level=1,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        capital = Account.objects.create(
            tenant_id=self.tenant_id,
            code="3100",
            name="Capital",
            parent=equity_root,
            account_group=Account.AccountGroup.EQUITY,
            account_nature=Account.AccountNature.CREDIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )

        capital_entry = JournalEntry.objects.create(
            tenant_id=self.tenant_id,
            date="2026-04-01",
            reference="JV-00001",
            source_type=JournalEntry.SourceType.EXPENSE,
            source_id="66666666-6666-6666-6666-666666666666",
            document_type="Journal Voucher",
            description="Capital introduced",
        )
        JournalLine.objects.create(
            tenant_id=self.tenant_id,
            journal_entry=capital_entry,
            account=self.bank,
            debit=Decimal("1000.00"),
            credit=Decimal("0.00"),
        )
        JournalLine.objects.create(
            tenant_id=self.tenant_id,
            journal_entry=capital_entry,
            account=capital,
            debit=Decimal("0.00"),
            credit=Decimal("1000.00"),
        )

        sales_entry = JournalEntry.objects.create(
            tenant_id=self.tenant_id,
            date="2026-04-05",
            reference="JV-00002",
            source_type=JournalEntry.SourceType.SALES_INVOICE,
            source_id="77777777-7777-7777-7777-777777777777",
            document_type="Sales Invoice",
            description="Revenue posted",
        )
        JournalLine.objects.create(
            tenant_id=self.tenant_id,
            journal_entry=sales_entry,
            account=self.bank,
            debit=Decimal("500.00"),
            credit=Decimal("0.00"),
        )
        JournalLine.objects.create(
            tenant_id=self.tenant_id,
            journal_entry=sales_entry,
            account=self.revenue,
            debit=Decimal("0.00"),
            credit=Decimal("500.00"),
        )

        request = self.factory.get(
            "/api/accounts/accounts/balance-sheet-report/",
            {
                "tenant_scope": self.tenant_id,
                "as_of_date": "2026-04-30",
            },
        )
        force_authenticate(request, user=self.user)
        response = AccountViewSet.as_view({"get": "balance_sheet_report"})(request)

        self.assertEqual(response.status_code, 200)
        payload = response.data["data"]
        self.assertEqual(payload["summary"]["total_assets"], "1500.00")
        self.assertEqual(payload["summary"]["total_liabilities"], "0.00")
        self.assertEqual(payload["summary"]["total_equity"], "1000.00")
        self.assertEqual(payload["summary"]["total_liabilities_and_equity"], "1000.00")
        self.assertEqual(payload["summary"]["unclosed_profit_loss"], "500.00")
        self.assertEqual(payload["summary"]["difference"], "500.00")
        self.assertFalse(payload["summary"]["is_balanced"])

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

    def test_customer_party_ledger_includes_opening_balance_in_range(self):
        opening_entry = JournalEntry.objects.create(
            tenant_id=self.tenant_id,
            date="2026-03-01",
            reference="OB-CUST-TEST01",
            source_type=JournalEntry.SourceType.PARTY_OPENING_BALANCE,
            source_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            document_type="Opening Balance",
            description="Customer opening",
            people_type="Customer",
            people_name=self.customer.business_name,
        )
        JournalLine.objects.create(
            tenant_id=self.tenant_id,
            journal_entry=opening_entry,
            account=self.customer_account,
            debit=Decimal("1500.00"),
            credit=Decimal("0.00"),
            people_type="Customer",
            people_name=self.customer.business_name,
            line_description="Customer Opening Balance",
        )

        sales_entry = JournalEntry.objects.create(
            tenant_id=self.tenant_id,
            date="2026-04-01",
            reference="SINV-OB-00001",
            source_type=JournalEntry.SourceType.SALES_INVOICE,
            source_id="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            document_type="Sales Invoice",
            description="Invoice after opening",
            people_type="Customer",
            people_name=self.customer.business_name,
        )
        JournalLine.objects.create(
            tenant_id=self.tenant_id,
            journal_entry=sales_entry,
            account=self.customer_account,
            debit=Decimal("500.00"),
            credit=Decimal("0.00"),
            people_type="Customer",
            people_name=self.customer.business_name,
        )

        request = self.factory.get(
            "/api/accounts/accounts/party-ledger-report/",
            {
                "partner_type": "customer",
                "partner_id": str(self.customer.id),
                "from_date": "2026-03-01",
                "to_date": "2026-04-30",
            },
        )
        force_authenticate(request, user=self.user)
        response = AccountViewSet.as_view({"get": "party_ledger_report"})(request)

        self.assertEqual(response.status_code, 200)
        payload = response.data["data"]
        self.assertEqual(len(payload["rows"]), 2)
        self.assertEqual(payload["rows"][0]["document_type"], "Opening Balance")
        self.assertEqual(payload["rows"][0]["credit"], "1500.00")
        self.assertEqual(payload["rows"][0]["debit"], "0.00")
        totals = {item["label"]: item["amount"] for item in payload["summary"]["document_totals"]}
        self.assertEqual(totals["Opening Balance"], "1500.00")
        self.assertEqual(totals["Sales Invoice"], "500.00")
        self.assertEqual(payload["summary"]["grand_total"], "2000.00")

    def test_customer_party_ledger_brings_forward_opening_before_from_date(self):
        opening_entry = JournalEntry.objects.create(
            tenant_id=self.tenant_id,
            date="2026-01-15",
            reference="OB-CUST-TEST02",
            source_type=JournalEntry.SourceType.PARTY_OPENING_BALANCE,
            source_id="cccccccc-cccc-cccc-cccc-cccccccccccc",
            document_type="Opening Balance",
            description="Prior opening",
            people_type="Customer",
            people_name=self.customer.business_name,
        )
        JournalLine.objects.create(
            tenant_id=self.tenant_id,
            journal_entry=opening_entry,
            account=self.customer_account,
            debit=Decimal("800.00"),
            credit=Decimal("0.00"),
            people_type="Customer",
            people_name=self.customer.business_name,
            line_description="Customer Opening Balance",
        )

        sales_entry = JournalEntry.objects.create(
            tenant_id=self.tenant_id,
            date="2026-04-10",
            reference="SINV-OB-00002",
            source_type=JournalEntry.SourceType.SALES_INVOICE,
            source_id="dddddddd-dddd-dddd-dddd-dddddddddddd",
            document_type="Sales Invoice",
            description="Period invoice",
            people_type="Customer",
            people_name=self.customer.business_name,
        )
        JournalLine.objects.create(
            tenant_id=self.tenant_id,
            journal_entry=sales_entry,
            account=self.customer_account,
            debit=Decimal("200.00"),
            credit=Decimal("0.00"),
            people_type="Customer",
            people_name=self.customer.business_name,
        )

        request = self.factory.get(
            "/api/accounts/accounts/party-ledger-report/",
            {
                "partner_type": "customer",
                "partner_id": str(self.customer.id),
                "from_date": "2026-04-01",
                "to_date": "2026-04-30",
            },
        )
        force_authenticate(request, user=self.user)
        response = AccountViewSet.as_view({"get": "party_ledger_report"})(request)

        self.assertEqual(response.status_code, 200)
        payload = response.data["data"]
        self.assertEqual(len(payload["rows"]), 2)
        self.assertEqual(payload["rows"][0]["id"], "BF-OPENING")
        self.assertEqual(payload["rows"][0]["document_type"], "Opening Balance")
        self.assertEqual(payload["rows"][0]["remarks"], "Brought forward")
        self.assertEqual(payload["rows"][0]["credit"], "800.00")
        self.assertEqual(payload["rows"][0]["debit"], "0.00")
        self.assertEqual(payload["rows"][1]["document_type"], "Sales Invoice")
        totals = {item["label"]: item["amount"] for item in payload["summary"]["document_totals"]}
        self.assertEqual(totals["Opening Balance"], "800.00")
        self.assertEqual(totals["Sales Invoice"], "200.00")
        self.assertEqual(payload["summary"]["grand_total"], "1000.00")

    def test_supplier_ledger_report_includes_opening_balance_brought_forward(self):
        opening_entry = JournalEntry.objects.create(
            tenant_id=self.tenant_id,
            date="2026-02-01",
            reference="OB-SUP-TEST01",
            source_type=JournalEntry.SourceType.PARTY_OPENING_BALANCE,
            source_id="eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
            document_type="Opening Balance",
            description="Supplier opening",
            people_type="Supplier",
            people_name=self.supplier.business_name,
        )
        JournalLine.objects.create(
            tenant_id=self.tenant_id,
            journal_entry=opening_entry,
            account=self.payables,
            debit=Decimal("0.00"),
            credit=Decimal("1200.00"),
            people_type="Supplier",
            people_name=self.supplier.business_name,
            line_description="Supplier Opening Balance",
        )

        invoice = PurchaseInvoice.objects.create(
            tenant_id=self.tenant_id,
            invoice_number="PINV-OB-00001",
            date="2026-04-05",
            supplier=self.supplier,
            warehouse=self.warehouse,
            net_amount=Decimal("300.00"),
            gross_amount=Decimal("300.00"),
        )
        PurchaseInvoiceLine.objects.create(
            tenant_id=self.tenant_id,
            invoice=invoice,
            product=self.product,
            quantity=Decimal("0.50"),
            rate=Decimal("600.00"),
            amount=Decimal("300.00"),
            discount=Decimal("0.00"),
            total_amount=Decimal("300.00"),
        )
        sync_purchase_invoice_journal(invoice)

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
        payload = response.data["data"]
        self.assertEqual(payload["rows"][0]["id"], "BF-OPENING")
        self.assertEqual(payload["rows"][0]["document_type"], "Opening Balance")
        self.assertEqual(payload["rows"][0]["credit"], "1200.00")
        self.assertEqual(payload["rows"][0]["debit"], "0.00")
        self.assertEqual(payload["total_credit"], "1500.00")
        self.assertEqual(payload["total_debit"], "0.00")


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
        payment = PurchaseBankPayment.objects.create(
            tenant_id=self.tenant_id,
            payment_number="PBP-00001",
            date="2026-04-02",
            bank_account=self.bank,
            amount=Decimal("1000.00"),
        )
        PurchaseBankPaymentLine.objects.create(
            tenant_id=self.tenant_id,
            payment=payment,
            supplier=self.supplier,
            purchase_invoice=invoice,
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
        receipt = SalesBankReceipt.objects.create(
            tenant_id=self.tenant_id,
            receipt_number="SBR-00001",
            date="2026-04-03",
            amount=Decimal("500.00"),
        )
        SalesBankReceiptLine.objects.create(
            tenant_id=self.tenant_id,
            receipt=receipt,
            customer=self.customer,
            sales_invoice=invoice,
            receipt_against="INVOICE",
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

    def test_can_create_second_opening_account_with_next_code(self):
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
            level=5,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )

        request = self._build_request(
            "post",
            "/accounts/accounts/opening-account-items/",
            {"bank_code": bank.code, "name": "Savings Account", "is_active": True},
        )

        response = AccountViewSet.as_view({"post": "create_opening_account_item"})(request)

        self.assertEqual(response.status_code, 201)
        created = Account.objects.get(name="Savings Account")
        self.assertEqual(created.code, "11112")
        self.assertEqual(created.parent_id, bank.id)

    def test_opening_account_code_skips_codes_used_elsewhere_in_dimension(self):
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
            code="11112",
            name="Legacy Account",
            parent=self.current_asset,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.BANK,
            account_nature=Account.AccountNature.DEBIT,
            level=3,
            is_postable=True,
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
            level=5,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )

        request = self._build_request(
            "post",
            "/accounts/accounts/opening-account-items/",
            {"bank_code": bank.code, "name": "Savings Account", "is_active": True},
        )

        response = AccountViewSet.as_view({"post": "create_opening_account_item"})(request)

        self.assertEqual(response.status_code, 201)
        created = Account.objects.get(name="Savings Account")
        self.assertEqual(created.code, "11113")

    def test_nested_chart_account_appends_digit_after_level_three(self):
        inventory = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1150",
            name="Inventory",
            parent=self.current_asset,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.INVENTORY,
            account_nature=Account.AccountNature.DEBIT,
            level=3,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        finished_products = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1151",
            name="Finished Products",
            parent=inventory,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.INVENTORY,
            account_nature=Account.AccountNature.DEBIT,
            level=4,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        request = self._build_request(
            "post",
            "/accounts/accounts/",
            {
                "name": "Finished Product Batch",
                "parent": str(finished_products.id),
                "account_group": Account.AccountGroup.ASSET,
                "account_type": Account.AccountType.INVENTORY,
                "account_nature": Account.AccountNature.DEBIT,
                "is_postable": True,
                "is_active": True,
            },
        )

        response = AccountViewSet.as_view({"post": "create"})(request)

        self.assertEqual(response.status_code, 201)
        created = Account.objects.get(name="Finished Product Batch")
        self.assertEqual(created.code, "11510")
        self.assertEqual(created.parent_id, finished_products.id)
        self.assertEqual(created.level, 5)
        finished_products.refresh_from_db()
        self.assertFalse(finished_products.is_postable)

    def test_custom_chart_codes_are_shared_across_dimensions_after_level_three(self):
        sams_dimension, _ = Dimension.objects.get_or_create(
            code=self.tenant_id,
            defaults={"name": "SAMS Traders", "sku_code": "SAMS", "is_active": True},
        )
        am_dimension, _ = Dimension.objects.get_or_create(
            code="AM_TRADERS",
            defaults={"name": "AM Traders", "sku_code": "AM", "is_active": True},
        )
        self.user.allowed_dimensions.add(sams_dimension, am_dimension)
        sams_inventory = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1150",
            name="Inventory",
            parent=self.current_asset,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.INVENTORY,
            account_nature=Account.AccountNature.DEBIT,
            level=3,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        Account.objects.create(
            tenant_id=self.tenant_id,
            code="1151",
            name="PI Household",
            parent=sams_inventory,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.INVENTORY,
            account_nature=Account.AccountNature.DEBIT,
            level=4,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        am_assets = Account.objects.create(
            tenant_id="AM_TRADERS",
            code="1000",
            name="Assets",
            account_group=Account.AccountGroup.ASSET,
            account_nature=Account.AccountNature.DEBIT,
            level=1,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        am_current_asset = Account.objects.create(
            tenant_id="AM_TRADERS",
            code="1100",
            name="Current Asset",
            parent=am_assets,
            account_group=Account.AccountGroup.ASSET,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        am_inventory = Account.objects.create(
            tenant_id="AM_TRADERS",
            code="1150",
            name="Inventory",
            parent=am_current_asset,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.INVENTORY,
            account_nature=Account.AccountNature.DEBIT,
            level=3,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        request = self._build_request(
            "post",
            "/accounts/accounts/",
            {
                "name": "Finished Good",
                "parent": str(sams_inventory.id),
                "account_group": Account.AccountGroup.ASSET,
                "account_type": Account.AccountType.INVENTORY,
                "account_nature": Account.AccountNature.DEBIT,
                "is_postable": True,
                "is_active": True,
            },
        )
        request.tenant_id = "AM_TRADERS"

        response = AccountViewSet.as_view({"post": "create"})(request)

        self.assertEqual(response.status_code, 201)
        created = Account.objects.get(tenant_id="AM_TRADERS", name="Finished Good")
        self.assertEqual(created.code, "1152")
        self.assertEqual(created.parent_id, am_inventory.id)

    def test_account_list_collapses_top_three_tiers_across_dimensions(self):
        am_assets = Account.objects.create(
            tenant_id="AM_TRADERS",
            code="1000",
            name="Assets",
            account_group=Account.AccountGroup.ASSET,
            account_nature=Account.AccountNature.DEBIT,
            level=1,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        am_current_asset = Account.objects.create(
            tenant_id="AM_TRADERS",
            code="1100",
            name="Current Asset",
            parent=am_assets,
            account_group=Account.AccountGroup.ASSET,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        am_bank_root = Account.objects.create(
            tenant_id="AM_TRADERS",
            code="1110",
            name="Bank",
            parent=am_current_asset,
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
            code="1111",
            name="SAMS Bank",
            parent=self.bank_root,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.BANK,
            account_nature=Account.AccountNature.DEBIT,
            level=4,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        Account.objects.create(
            tenant_id="AM_TRADERS",
            code="1112",
            name="AM Bank",
            parent=am_bank_root,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.BANK,
            account_nature=Account.AccountNature.DEBIT,
            level=4,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )

        request = self._build_request("get", "/accounts/accounts/")
        request.tenant_ids = [self.tenant_id, "AM_TRADERS"]

        response = AccountViewSet.as_view({"get": "list"})(request)

        self.assertEqual(response.status_code, 200)
        root_codes = [account["code"] for account in response.data]
        self.assertEqual(root_codes.count("1000"), 1)

        assets = next(account for account in response.data if account["code"] == "1000")
        current_asset_codes = [account["code"] for account in assets["children"]]
        self.assertEqual(current_asset_codes.count("1100"), 1)

        current_asset = next(
            account for account in assets["children"] if account["code"] == "1100"
        )
        bank_root_codes = [account["code"] for account in current_asset["children"]]
        self.assertEqual(bank_root_codes.count("1110"), 1)

        bank_root = next(
            account for account in current_asset["children"] if account["code"] == "1110"
        )
        child_codes = [account["code"] for account in bank_root["children"]]
        self.assertEqual(child_codes, ["1111", "1112"])

    def test_can_update_account_when_request_tenant_differs_from_account_tenant(self):
        Dimension.objects.get_or_create(
            code=self.tenant_id,
            defaults={"name": "SAMS Traders", "sku_code": "SAMS", "is_active": True},
        )
        am_dimension, _ = Dimension.objects.get_or_create(
            code="AM_TRADERS",
            defaults={"name": "AM Traders", "sku_code": "AM", "is_active": True},
        )
        self.user.allowed_dimensions.add(am_dimension)
        am_assets = Account.objects.create(
            tenant_id="AM_TRADERS",
            code="1000",
            name="Assets",
            account_group=Account.AccountGroup.ASSET,
            account_nature=Account.AccountNature.DEBIT,
            level=1,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        am_inventory = Account.objects.create(
            tenant_id="AM_TRADERS",
            code="1150",
            name="Inventory",
            parent=am_assets,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.INVENTORY,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=False,
            is_active=True,
            sort_order=0,
        )
        am_child = Account.objects.create(
            tenant_id="AM_TRADERS",
            code="1151",
            name="Finished Good",
            parent=am_inventory,
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.INVENTORY,
            account_nature=Account.AccountNature.DEBIT,
            level=3,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        request = self._build_request(
            "put",
            f"/accounts/accounts/{am_child.id}/",
            {
                "code": am_child.code,
                "name": "Finished Good Updated",
                "parent": str(am_inventory.id),
                "account_group": Account.AccountGroup.ASSET,
                "account_type": Account.AccountType.INVENTORY,
                "account_nature": Account.AccountNature.DEBIT,
                "is_postable": True,
                "is_active": True,
                "sort_order": 0,
            },
        )
        request.tenant_id = self.tenant_id

        response = AccountViewSet.as_view({"put": "update"})(request, pk=am_child.id)

        self.assertEqual(response.status_code, 200)
        am_child.refresh_from_db()
        self.assertEqual(am_child.name, "Finished Good Updated")
        self.assertEqual(am_child.parent_id, am_inventory.id)

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
            tenant_limit=5,
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
            Dimension.objects.filter(code="NORTH_DIVISION", sku_code="NORTH_DIVISION").exists()
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

    def test_dimension_sku_code_can_be_set_for_product_numbering(self):
        request = self.factory.post(
            "/api/accounts/dimensions/",
            {"name": "West Traders", "code": "WEST_TRADERS", "sku_code": "WTE", "is_active": True},
            format="json",
        )
        force_authenticate(request, user=self.user)

        response = DimensionViewSet.as_view({"post": "create"})(request)

        self.assertEqual(response.status_code, 201)
        self.assertTrue(Dimension.objects.filter(code="WEST_TRADERS", sku_code="WTE").exists())

    def test_can_update_dimension_without_changing_code(self):
        dimension = Dimension.objects.create(
            code="EDIT_DIMENSION",
            name="Edit Dimension",
            sku_code="EDI",
            is_active=True,
        )
        self.user.allowed_dimensions.add(dimension)
        request = self.factory.patch(
            f"/api/accounts/dimensions/{dimension.id}/",
            {"name": "AM Traders Updated", "sku_code": "AMU", "is_active": False},
            format="json",
        )
        force_authenticate(request, user=self.user)

        response = DimensionViewSet.as_view({"patch": "partial_update"})(request, pk=dimension.id)

        self.assertEqual(response.status_code, 200)
        dimension.refresh_from_db()
        self.assertEqual(dimension.code, "EDIT_DIMENSION")
        self.assertEqual(dimension.name, "AM Traders Updated")
        self.assertEqual(dimension.sku_code, "AMU")
        self.assertFalse(dimension.is_active)

    def test_cannot_update_dimension_code(self):
        dimension = Dimension.objects.create(
            code="LOCK_CODE_DIMENSION",
            name="Lock Code Dimension",
            sku_code="LCD",
            is_active=True,
        )
        self.user.allowed_dimensions.add(dimension)
        request = self.factory.patch(
            f"/api/accounts/dimensions/{dimension.id}/",
            {"code": "NEW_CODE", "name": "Lock Code Dimension"},
            format="json",
        )
        force_authenticate(request, user=self.user)

        response = DimensionViewSet.as_view({"patch": "partial_update"})(request, pk=dimension.id)

        self.assertEqual(response.status_code, 400)
        dimension.refresh_from_db()
        self.assertEqual(dimension.code, "LOCK_CODE_DIMENSION")

    def test_can_delete_unused_dimension_and_seeded_accounts(self):
        dimension = Dimension.objects.create(code="TEMP_DIM", name="Temp Dimension", is_active=True)
        self.user.allowed_dimensions.add(dimension)
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
        self.user.allowed_dimensions.add(dimension)
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

    def test_dashboard_overview_uses_request_tenant_scope(self):
        request = self.factory.get("/api/accounts/accounts/dashboard-overview/")
        request.tenant_id = "AM_TRADERS"
        force_authenticate(request, user=self.user)

        response = AccountViewSet.as_view({"get": "dashboard_overview"})(request)

        self.assertEqual(response.status_code, 200)
        data = response.data["data"]
        self.assertEqual(data["tenant_id"], "AM_TRADERS")
        self.assertEqual(data["counts"]["products"], 0)
        self.assertEqual(data["counts"]["customers"], 0)
        self.assertEqual(data["counts"]["suppliers"], 0)


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


class SaasIsolationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.dim_a = Dimension.objects.create(code="TENANT_A", name="Tenant A", is_active=True)
        self.dim_b = Dimension.objects.create(code="TENANT_B", name="Tenant B", is_active=True)
        self.user = User.objects.create_user(
            username="tenant-user",
            email="tenant-user@test.com",
            password="secret123",
            tenant_id=self.dim_a.code,
            tenant_limit=1,
        )
        self.user.allowed_dimensions.add(self.dim_a)
        token = str(RefreshToken.for_user(self.user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_rejects_access_to_unassigned_tenant_header(self):
        response = self.client.get(
            "/api/accounts/accounts/dashboard-overview/",
            HTTP_X_TENANT_ID=self.dim_b.code,
        )
        self.assertEqual(response.status_code, 401)

    def test_dimension_creation_fails_when_limit_reached(self):
        response = self.client.post(
            "/api/accounts/dimensions/",
            {"name": "Tenant C", "code": "TENANT_C", "is_active": True},
            format="json",
            HTTP_X_TENANT_ID=self.dim_a.code,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("limit", str(response.data).lower())


class SalesmanPerformanceReportTests(TestCase):
    def setUp(self):
        self.sams_tenant = "REPORT_SAMS"
        self.other_tenant = "REPORT_OTHER"
        Dimension.objects.get_or_create(
            code=self.sams_tenant,
            defaults={"name": "Sams Traders", "is_active": True},
        )
        Dimension.objects.get_or_create(
            code=self.other_tenant,
            defaults={"name": "Other Dimension", "is_active": True},
        )

        self.warehouse = Warehouse.objects.create(
            tenant_id=self.sams_tenant,
            name="Main Warehouse",
            location="Karachi",
        )
        receivable_account = Account.objects.create(
            tenant_id=self.sams_tenant,
            code="1120",
            name="Receivables",
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.RECEIVABLE,
            account_nature=Account.AccountNature.DEBIT,
            level=1,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        self.customer = Customer.objects.create(
            tenant_id=self.sams_tenant,
            name="Customer One",
            business_name="Customer One",
            phone_number="123",
            address="Main road",
            account=receivable_account,
        )
        self.salesman = Salesman.objects.create(
            tenant_id=self.sams_tenant,
            code="TAHA",
            name="Taha",
            commission_on_sales=Decimal("10.00"),
            commission_on_recovery=Decimal("5.00"),
        )

    def test_report_includes_invoice_when_product_dimension_matches_scope(self):
        from accounts.reporting import build_salesman_performance_report
        from datetime import date

        invoice = SalesInvoice.objects.create(
            tenant_id=self.other_tenant,
            invoice_number="SI-00001",
            date=date(2026, 4, 22),
            customer=self.customer,
            warehouse=self.warehouse,
            salesman=self.salesman,
            gross_amount=Decimal("100.00"),
            net_amount=Decimal("100.00"),
            salesman_commission_rate=Decimal("10.00"),
            salesman_commission_amount=Decimal("10.00"),
        )
        SalesInvoiceLine.objects.create(
            tenant_id=self.sams_tenant,
            invoice=invoice,
            product_id=self._create_product().id,
            quantity=Decimal("1.00"),
            rate=Decimal("100.00"),
            amount=Decimal("100.00"),
            discount=Decimal("0.00"),
            total_amount=Decimal("100.00"),
        )

        scoped_report = build_salesman_performance_report(
            tenant_ids=[self.sams_tenant],
            from_date=date(2026, 1, 1),
            to_date=date(2026, 12, 31),
        )
        header_only_report = build_salesman_performance_report(
            tenant_ids=[self.other_tenant],
            from_date=date(2026, 1, 1),
            to_date=date(2026, 12, 31),
        )

        self.assertEqual(scoped_report["summary"]["invoice_count"], 1)
        self.assertEqual(len(scoped_report["invoice_rows"]), 1)
        self.assertEqual(scoped_report["invoice_rows"][0]["salesman_name"], "Taha")
        self.assertEqual(scoped_report["invoice_rows"][0]["sales_commission_amount"], "10.00")
        self.assertEqual(header_only_report["summary"]["invoice_count"], 0)

    def _create_product(self):
        inventory_account = Account.objects.create(
            tenant_id=self.sams_tenant,
            code="1150",
            name="Inventory",
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.INVENTORY,
            account_nature=Account.AccountNature.DEBIT,
            level=1,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        cogs_account = Account.objects.create(
            tenant_id=self.sams_tenant,
            code="5100",
            name="COGS",
            account_group=Account.AccountGroup.COGS,
            account_type=Account.AccountType.COGS,
            account_nature=Account.AccountNature.DEBIT,
            level=1,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        revenue_account = Account.objects.create(
            tenant_id=self.sams_tenant,
            code="4100",
            name="Sales Revenue",
            account_group=Account.AccountGroup.REVENUE,
            account_type=Account.AccountType.REVENUE,
            account_nature=Account.AccountNature.CREDIT,
            level=1,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        category = Category.objects.create(
            tenant_id=self.sams_tenant,
            name="Category",
            inventory_account=inventory_account,
            cogs_account=cogs_account,
            revenue_account=revenue_account,
        )
        unit = Unit.objects.create(tenant_id=self.sams_tenant, name="Piece")
        return Product.objects.create(
            tenant_id=self.sams_tenant,
            name="Sams Product",
            product_type="READY_MADE",
            packaging_cost=Decimal("0.00"),
            net_amount=Decimal("100.00"),
            category=category,
            unit=unit,
            inventory_account=inventory_account,
            cogs_account=cogs_account,
            revenue_account=revenue_account,
        )
