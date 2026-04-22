from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate
from types import SimpleNamespace

from accounts.models import Account, User
from inventory.models import Category, Product
from inventory.serializers import ProductSerializer
from inventory.views import CategoryViewSet


class ProductCoaDefaultsTests(TestCase):
    def setUp(self):
        self.tenant_id = "SAMS_TRADERS"
        self.user = User.objects.create_user(
            username="inventory-user",
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

    def test_product_inherits_missing_coas_from_category(self):
        serializer = ProductSerializer(
            data={
                "name": "Runner",
                "product_type": "READY_MADE",
                "packaging_cost": "15.00",
                "category": self.category.id,
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
