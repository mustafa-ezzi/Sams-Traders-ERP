from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from accounts.models import Account, User
from inventory.models import Category, Customer, Product, ProductStock, Salesman, Unit, Warehouse
from sales.models import SalesBankReceipt, SalesBankReceiptLine, SalesInvoice, SalesReturn
from sales.serializers import SalesBankReceiptSerializer, SalesInvoiceSerializer
from sales.views import SalesInvoiceViewSet
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
            account_type=Account.AccountType.BANK,
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
        receipt = SalesBankReceipt.objects.create(
            tenant_id=self.tenant_id,
            receipt_number="SBR-00001",
            date="2026-04-20",
            amount=Decimal("700.00"),
        )
        SalesBankReceiptLine.objects.create(
            tenant_id=self.tenant_id,
            receipt=receipt,
            customer=self.customer,
            sales_invoice=self.invoice,
            receipt_against="INVOICE",
            bank_account=self.bank_account,
            amount=Decimal("700.00"),
        )

        financials = get_sales_invoice_financials(self.invoice)

        self.assertEqual(financials["net_amount"], Decimal("2000.00"))
        self.assertEqual(financials["returned_amount"], Decimal("300.00"))
        self.assertEqual(financials["received_amount"], Decimal("700.00"))
        self.assertEqual(financials["balance_amount"], Decimal("1000.00"))

    def test_serializer_blocks_receipt_above_remaining_balance(self):
        receipt = SalesBankReceipt.objects.create(
            tenant_id=self.tenant_id,
            receipt_number="SBR-00001",
            date="2026-04-20",
            amount=Decimal("1000.00"),
        )
        SalesBankReceiptLine.objects.create(
            tenant_id=self.tenant_id,
            receipt=receipt,
            customer=self.customer,
            sales_invoice=self.invoice,
            receipt_against="INVOICE",
            bank_account=self.bank_account,
            amount=Decimal("1000.00"),
        )

        serializer = SalesBankReceiptSerializer(
            data={
                "date": "2026-04-20",
                "remarks": "Second receipt",
                "lines": [
                    {
                        "customer_id": str(self.customer.id),
                        "receipt_against": "INVOICE",
                        "sales_invoice_id": str(self.invoice.id),
                        "tenant_id": self.tenant_id,
                        "bank_account_id": str(self.bank_account.id),
                        "amount": "1500.00",
                    }
                ],
            },
            context={"request": self._get_request()},
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("lines", serializer.errors)

    def test_serializer_requires_bank_account_type_bank(self):
        cash_account = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1113",
            name="Cash Counter",
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.CASH,
            account_nature=Account.AccountNature.DEBIT,
            level=1,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )

        serializer = SalesBankReceiptSerializer(
            data={
                "date": "2026-04-20",
                "remarks": "Cash is not valid here",
                "lines": [
                    {
                        "customer_id": str(self.customer.id),
                        "receipt_against": "INVOICE",
                        "sales_invoice_id": str(self.invoice.id),
                        "tenant_id": self.tenant_id,
                        "bank_account_id": str(cash_account.id),
                        "amount": "500.00",
                    }
                ],
            },
            context={"request": self._get_request()},
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("lines", serializer.errors)


class SalesInvoiceSerializerTests(TestCase):
    def setUp(self):
        self.tenant_id = "SAMS_TRADERS"
        self.user = User.objects.create_user(
            username="sales-invoice-user",
            password="secret",
            tenant_id=self.tenant_id,
        )
        self.factory = APIRequestFactory()

        self.warehouse = Warehouse.objects.create(
            tenant_id=self.tenant_id,
            name="Main Warehouse",
            location="Karachi",
        )
        self.receivable_account = Account.objects.create(
            tenant_id=self.tenant_id,
            code="1120",
            name="Customers Receivable",
            account_group=Account.AccountGroup.ASSET,
            account_type=Account.AccountType.RECEIVABLE,
            account_nature=Account.AccountNature.DEBIT,
            level=1,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        inventory_account = Account.objects.create(
            tenant_id=self.tenant_id,
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
            tenant_id=self.tenant_id,
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
            tenant_id=self.tenant_id,
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
            tenant_id=self.tenant_id,
            name="Category",
            inventory_account=inventory_account,
            cogs_account=cogs_account,
            revenue_account=revenue_account,
        )
        self.unit = Unit.objects.create(tenant_id=self.tenant_id, name="Piece")
        self.product = Product.objects.create(
            tenant_id=self.tenant_id,
            name="Sales Product",
            product_type="READY_MADE",
            packaging_cost=Decimal("0.00"),
            net_amount=Decimal("50.00"),
            category=category,
            unit=self.unit,
            inventory_account=inventory_account,
            cogs_account=cogs_account,
            revenue_account=revenue_account,
        )
        self.customer = Customer.objects.create(
            tenant_id=self.tenant_id,
            name="Customer One",
            business_name="Customer One",
            phone_number="123",
            address="Main road",
            account=self.receivable_account,
        )
        ProductStock.objects.create(
            tenant_id=self.tenant_id,
            warehouse=self.warehouse,
            product=self.product,
            quantity=Decimal("10.00"),
        )

    def _get_request(self):
        request = self.factory.post("/api/sales/sales-invoices/")
        request.user = self.user
        return request

    def test_serializer_allows_create_without_invoice_number(self):
        serializer = SalesInvoiceSerializer(
            data={
                "date": "2026-04-22",
                "customer_id": str(self.customer.id),
                "warehouse_id": str(self.warehouse.id),
                "remarks": "Test invoice",
                "invoice_discount": "0.00",
                "lines": [
                    {
                        "product_id": str(self.product.id),
                        "quantity": "1.00",
                        "rate": "100.00",
                        "discount": "0.00",
                    }
                ],
            },
            context={"request": self._get_request()},
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_salesman_commission_is_calculated_from_net_amount(self):
        salesman = Salesman.objects.create(
            tenant_id=self.tenant_id,
            code="SM-00099",
            name="Commission Tester",
            commission_on_sales=Decimal("10.00"),
            commission_on_recovery=Decimal("0.00"),
        )
        serializer = SalesInvoiceSerializer(
            data={
                "date": "2026-04-22",
                "customer_id": str(self.customer.id),
                "warehouse_id": str(self.warehouse.id),
                "salesman_id": str(salesman.id),
                "remarks": "Commission invoice",
                "invoice_discount": "0.00",
                "lines": [
                    {
                        "product_id": str(self.product.id),
                        "quantity": "1.00",
                        "rate": "50.00",
                        "discount": "0.00",
                    }
                ],
            },
            context={"request": self._get_request()},
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        invoice = serializer.save()
        self.assertEqual(invoice.net_amount, Decimal("50.00"))
        self.assertEqual(invoice.salesman_id, salesman.id)
        self.assertEqual(invoice.salesman_commission_rate, Decimal("10.00"))
        self.assertEqual(invoice.salesman_commission_amount, Decimal("5.00"))

    def test_product_options_include_product_unit(self):
        request = self.factory.get(
            "/api/sales/sales-invoices/product-options/",
            {"warehouse_id": str(self.warehouse.id)},
        )
        force_authenticate(request, user=self.user)

        response = SalesInvoiceViewSet.as_view({"get": "product_options"})(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"][0]["unit"], "Piece")

    def test_auto_generates_si_invoice_number(self):
        serializer = SalesInvoiceSerializer(
            data={
                "date": "2026-04-22",
                "customer_id": str(self.customer.id),
                "warehouse_id": str(self.warehouse.id),
                "dc_number": "DC-100",
                "remarks": "Numbered invoice",
                "invoice_discount": "0.00",
                "lines": [
                    {
                        "product_id": str(self.product.id),
                        "quantity": "1.00",
                        "rate": "100.00",
                        "discount": "0.00",
                    }
                ],
            },
            context={"request": self._get_request()},
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        invoice = serializer.save()
        self.assertEqual(invoice.invoice_number, "SI - 0001")
        self.assertEqual(invoice.dc_number, "DC-100")

    def test_allows_sale_when_stock_is_zero_and_inventory_goes_negative(self):
        from inventory.services import sync_product_stock_quantity

        ProductStock.objects.filter(
            tenant_id=self.tenant_id,
            warehouse=self.warehouse,
            product=self.product,
        ).update(quantity=Decimal("0.00"))

        serializer = SalesInvoiceSerializer(
            data={
                "date": "2026-04-22",
                "customer_id": str(self.customer.id),
                "warehouse_id": str(self.warehouse.id),
                "remarks": "Backorder sale",
                "invoice_discount": "0.00",
                "lines": [
                    {
                        "product_id": str(self.product.id),
                        "quantity": "5.00",
                        "rate": "100.00",
                        "discount": "0.00",
                    }
                ],
            },
            context={"request": self._get_request()},
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        invoice = serializer.save()
        sync_product_stock_quantity(
            self.tenant_id,
            self.warehouse.id,
            self.product.id,
        )

        stock = ProductStock.objects.get(
            tenant_id=self.tenant_id,
            warehouse=self.warehouse,
            product=self.product,
            deleted_at__isnull=True,
        )
        self.assertEqual(stock.quantity, Decimal("-5.00"))
        self.assertEqual(invoice.lines.count(), 1)
