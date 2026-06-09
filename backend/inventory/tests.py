from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate
from types import SimpleNamespace

from accounts.models import Account, Dimension, User
from inventory.models import (
    Brand,
    Category,
    Customer,
    Product,
    ProductCostState,
    ProductStock,
    Supplier,
    Unit,
    Warehouse,
)
from inventory.services import rebuild_product_costing
from inventory.serializers import ProductSerializer, UnitSerializer
from inventory.views import BrandViewSet, CategoryViewSet, ProductViewSet, UnitViewSet
from purchase.models import PurchaseInvoice, PurchaseInvoiceLine
from sales.models import SalesInvoice, SalesInvoiceLine


class ProductCoaDefaultsTests(TestCase):
    def setUp(self):
        self.tenant_id = "SAMS_TRADERS"
        self.user = User.objects.create_user(
            username="inventory-user",
            password="secret",
            tenant_id=self.tenant_id,
        )
        self.dimension, _ = Dimension.objects.update_or_create(
            code=self.tenant_id,
            defaults={
                "name": "Sams Traders",
                "sku_code": "AME",
                "is_active": True,
            },
        )
        self.user.allowed_dimensions.add(self.dimension)
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
            account_nature=Account.AccountNature.CREDIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )

        self.cogs_root = Account.objects.create(
            tenant_id=self.tenant_id,
            code="5000",
            name="Cost of Sales",
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
            name="COGS",
            parent=self.cogs_root,
            account_group=Account.AccountGroup.COGS,
            account_nature=Account.AccountNature.DEBIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )

        self.category = Category.objects.create(
            tenant_id=self.tenant_id,
            name="Shoes",
            inventory_account=self.inventory_account,
            cogs_account=self.cogs_account,
            revenue_account=self.revenue_account,
        )
        self.unit = Unit.objects.create(tenant_id=self.tenant_id, name="Pair")

    def test_product_inherits_missing_coas_from_category(self):
        serializer = ProductSerializer(
            data={
                "name": "Runner",
                "product_type": "READY_MADE",
                "packaging_cost": "15.00",
                "category": self.category.id,
                "unit": self.unit.id,
                "inventory_account": None,
                "cogs_account": None,
                "revenue_account": None,
            },
            context={"request": SimpleNamespace(user=self.user)},
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        product = serializer.save()

        self.assertEqual(product.inventory_account_id, self.inventory_account.id)
        self.assertEqual(product.cogs_account_id, self.cogs_account.id)
        self.assertEqual(product.revenue_account_id, self.revenue_account.id)
        self.assertEqual(product.unit_id, self.unit.id)
        self.assertEqual(product.sku, "AME - 0001")

    def test_product_sku_can_be_manual_or_auto_generated_from_dimension(self):
        manual_serializer = ProductSerializer(
            data={
                "name": "Manual SKU Product",
                "sku": "AME - 0099",
                "product_type": "FINISHED_GOOD",
                "direct_price": "10.00",
                "unit": self.unit.id,
                "materials": [],
            },
            context={"request": SimpleNamespace(user=self.user)},
        )
        self.assertTrue(manual_serializer.is_valid(), manual_serializer.errors)
        manual_product = manual_serializer.save()

        auto_serializer = ProductSerializer(
            data={
                "name": "Auto SKU Product",
                "product_type": "FINISHED_GOOD",
                "direct_price": "12.00",
                "unit": self.unit.id,
                "materials": [],
            },
            context={"request": SimpleNamespace(user=self.user)},
        )
        self.assertTrue(auto_serializer.is_valid(), auto_serializer.errors)
        auto_product = auto_serializer.save()

        self.assertEqual(manual_product.sku, "AME - 0099")
        self.assertEqual(auto_product.sku, "AME - 0100")

    def test_product_update_persists_unit(self):
        product = Product.objects.create(
            tenant_id=self.tenant_id,
            name="Boot",
            product_type="READY_MADE",
            packaging_cost="10.00",
            net_amount="10.00",
            category=self.category,
        )

        updated_unit = Unit.objects.create(tenant_id=self.tenant_id, name="Box")
        serializer = ProductSerializer(
            product,
            data={
                "name": product.name,
                "product_type": product.product_type,
                "packaging_cost": "10.00",
                "category": self.category.id,
                "unit": updated_unit.id,
                "inventory_account": None,
                "cogs_account": None,
                "revenue_account": None,
                "materials": [],
            },
            context={"request": SimpleNamespace(user=self.user)},
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated_product = serializer.save()

        self.assertEqual(updated_product.unit_id, updated_unit.id)

    def test_product_accepts_shared_unit_from_another_tenant(self):
        other_dimension = Dimension.objects.create(
            code="OTHER_TENANT",
            name="Other Tenant",
            is_active=True,
        )
        self.user.allowed_dimensions.add(other_dimension)
        shared_unit = Unit.objects.create(tenant_id="OTHER_TENANT", name="Shared Box")
        serializer = ProductSerializer(
            data={
                "name": "Shared Unit Product",
                "product_type": "FINISHED_GOOD",
                "direct_price": "10.00",
                "unit": shared_unit.id,
                "materials": [],
            },
            context={"request": SimpleNamespace(user=self.user)},
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        product = serializer.save()
        self.assertEqual(product.unit_id, shared_unit.id)

    def test_unit_duplicate_name_returns_validation_error(self):
        Unit.objects.create(
            tenant_id=self.tenant_id,
            name="Carton",
            breakdown_unit="Piece",
        )
        serializer = UnitSerializer(
            data={
                "name": "Carton",
                "base_quantity": "1",
                "breakdown_unit": "Piece",
                "breakdown_quantity": "12",
            },
            context={"request": SimpleNamespace(user=self.user)},
        )

        self.assertFalse(serializer.is_valid())
        self.assertEqual(
            serializer.errors["name"][0],
            "Unit with this name already exists.",
        )

    def test_brand_and_unit_lists_include_records_from_users_allowed_dimensions(self):
        other_dimension = Dimension.objects.create(
            code="OTHER_TENANT",
            name="Other Tenant",
            is_active=True,
        )
        self.user.allowed_dimensions.add(other_dimension)
        brand = Brand.objects.create(tenant_id="OTHER_TENANT", name="Shared Brand")
        unit = Unit.objects.create(
            tenant_id="OTHER_TENANT",
            name="Shared Carton",
            breakdown_unit="Piece",
        )

        brand_request = self.factory.get("/inventory/brands/")
        force_authenticate(brand_request, user=self.user)
        brand_response = BrandViewSet.as_view({"get": "list"})(brand_request)
        brand_items = brand_response.data.get("data", brand_response.data)
        brand_ids = {item["id"] for item in brand_items}

        unit_request = self.factory.get("/inventory/units/")
        force_authenticate(unit_request, user=self.user)
        unit_response = UnitViewSet.as_view({"get": "list"})(unit_request)
        unit_items = unit_response.data.get("data", unit_response.data)
        unit_ids = {item["id"] for item in unit_items}

        self.assertIn(str(brand.id), brand_ids)
        self.assertIn(str(unit.id), unit_ids)

    def test_brand_and_unit_lists_do_not_include_unowned_dimensions(self):
        brand = Brand.objects.create(tenant_id="UNOWNED_TENANT", name="Hidden Brand")
        unit = Unit.objects.create(
            tenant_id="UNOWNED_TENANT",
            name="Hidden Carton",
            breakdown_unit="Piece",
        )

        brand_request = self.factory.get("/inventory/brands/")
        force_authenticate(brand_request, user=self.user)
        brand_response = BrandViewSet.as_view({"get": "list"})(brand_request)
        brand_items = brand_response.data.get("data", brand_response.data)
        brand_ids = {item["id"] for item in brand_items}

        unit_request = self.factory.get("/inventory/units/")
        force_authenticate(unit_request, user=self.user)
        unit_response = UnitViewSet.as_view({"get": "list"})(unit_request)
        unit_items = unit_response.data.get("data", unit_response.data)
        unit_ids = {item["id"] for item in unit_items}

        self.assertNotIn(str(brand.id), brand_ids)
        self.assertNotIn(str(unit.id), unit_ids)

    def test_product_moving_average_cost_updates_sale_profit(self):
        warehouse = Warehouse.objects.create(
            tenant_id=self.tenant_id,
            name="Main Warehouse",
            location="Main",
        )
        supplier = Supplier.objects.create(
            tenant_id=self.tenant_id,
            name="Supplier",
            business_name="Supplier",
            phone_number="123",
            address="Address",
        )
        customer = Customer.objects.create(
            tenant_id=self.tenant_id,
            name="Customer",
            business_name="Customer",
            phone_number="123",
            address="Address",
        )
        product = Product.objects.create(
            tenant_id=self.tenant_id,
            name="Finished Item",
            product_type="FINISHED_GOOD",
            direct_price="25.00",
            net_amount="25.00",
            unit=self.unit,
        )
        purchase_invoice = PurchaseInvoice.objects.create(
            tenant_id=self.tenant_id,
            invoice_number="PINV-T1",
            date="2026-05-01",
            supplier=supplier,
            warehouse=warehouse,
            gross_amount="100.00",
            net_amount="100.00",
        )
        PurchaseInvoiceLine.objects.create(
            tenant_id=self.tenant_id,
            invoice=purchase_invoice,
            item_type="FINISHED_GOOD",
            product=product,
            quantity="10.00",
            rate="10.00",
            amount="100.00",
            total_amount="100.00",
        )
        sales_invoice = SalesInvoice.objects.create(
            tenant_id=self.tenant_id,
            invoice_number="SINV-T1",
            date="2026-05-02",
            customer=customer,
            warehouse=warehouse,
            gross_amount="45.00",
            net_amount="45.00",
        )
        sale_line = SalesInvoiceLine.objects.create(
            tenant_id=self.tenant_id,
            invoice=sales_invoice,
            product=product,
            quantity="3.00",
            rate="15.00",
            amount="45.00",
            total_amount="45.00",
        )

        rebuild_product_costing(self.tenant_id, [product.id])

        sale_line.refresh_from_db()
        state = ProductCostState.objects.get(
            tenant_id=self.tenant_id,
            product=product,
            deleted_at__isnull=True,
        )
        self.assertEqual(str(sale_line.cost_used), "10.0000")
        self.assertEqual(str(sale_line.cost_total), "30.00")
        self.assertEqual(str(sale_line.profit), "15.00")
        self.assertEqual(str(state.total_quantity), "7.0000")
        self.assertEqual(str(state.total_value), "70.00")
        self.assertEqual(str(state.average_cost), "10.0000")

    def test_product_delete_allows_zero_quantity_stock_row(self):
        warehouse = Warehouse.objects.create(
            tenant_id=self.tenant_id,
            name="Delete Warehouse",
            location="Main",
        )
        product = Product.objects.create(
            tenant_id=self.tenant_id,
            name="Unused Product",
            product_type="FINISHED_GOOD",
            direct_price="10.00",
            net_amount="10.00",
            unit=self.unit,
        )
        ProductStock.objects.create(
            tenant_id=self.tenant_id,
            warehouse=warehouse,
            product=product,
            quantity="0.00",
        )

        request = self.factory.delete(f"/api/inventory/products/{product.id}/")
        force_authenticate(request, user=self.user)
        response = ProductViewSet.as_view({"delete": "destroy"})(request, pk=str(product.id))

        self.assertEqual(response.status_code, 200)
        product.refresh_from_db()
        self.assertIsNotNone(product.deleted_at)
        self.assertFalse(
            ProductStock.objects.filter(
                tenant_id=self.tenant_id,
                product=product,
                deleted_at__isnull=True,
            ).exists()
        )

    def test_apply_category_coa_defaults_only_fills_missing_product_fields(self):
        custom_revenue = Account.objects.create(
            tenant_id=self.tenant_id,
            code="4110",
            name="Custom Revenue",
            parent=self.revenue_root,
            account_group=Account.AccountGroup.REVENUE,
            account_nature=Account.AccountNature.CREDIT,
            level=2,
            is_postable=True,
            is_active=True,
            sort_order=0,
        )
        product = Product.objects.create(
            tenant_id=self.tenant_id,
            name="Boot",
            product_type="READY_MADE",
            packaging_cost="10.00",
            net_amount="10.00",
            category=self.category,
            revenue_account=custom_revenue,
        )

        request = self.factory.post(
            f"/api/inventory/categories/{self.category.id}/apply-coa-defaults/"
        )
        force_authenticate(request, user=self.user)
        response = CategoryViewSet.as_view({"post": "apply_coa_defaults"})(
            request, pk=str(self.category.id)
        )

        self.assertEqual(response.status_code, 200)
        product.refresh_from_db()
        self.assertEqual(product.inventory_account_id, self.inventory_account.id)
        self.assertEqual(product.cogs_account_id, self.cogs_account.id)
        self.assertEqual(product.revenue_account_id, custom_revenue.id)
