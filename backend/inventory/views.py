from rest_framework.response import Response
from rest_framework import viewsets, status
from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated
from django.utils.timezone import now
from decimal import Decimal
from django.db.models import Count, DecimalField, IntegerField, OuterRef, Prefetch, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework.decorators import action
from accounts.journal import delete_journal_entry
from accounts.access_control import filter_queryset_by_allowed_salesmen
from accounts.audit_mixin import AuditedModelMixin
from accounts.models import JournalEntry
from .models import (
    Brand,
    Category,
    Customer,
    OpeningStock,
    PartyOpeningBalance,
    ProductStock,
    Production,
    Product,
    ProductMaterial,
    RawMaterial,
    Size,
    Stock,
    Salesman,
    Supplier,
    Unit,
    Warehouse,
    ProductCostState,
)
from .serializers import (
    BrandSerializer,
    CategorySerializer,
    get_category_account_for_tenant,
    OpeningStockSerializer,
    PartySerializer,
    PartyOpeningBalanceSerializer,
    SalesmanSerializer,
    ProductionSerializer,
    ProductSerializer,
    RawMaterialDetailedSerializer,
    RawMaterialSerializer,
    SizeSerializer,
    UnitSerializer,
    WarehouseSerializer,
)
from .pagination import StandardResultsSetPagination
from .services import (
    rebuild_product_costing,
    sync_product_stock_quantity,
    sync_raw_material_stock_quantity,
)
from rest_framework import filters
from rest_framework.filters import OrderingFilter
from rest_framework.exceptions import ValidationError

from purchase.models import PurchaseInvoiceLine, PurchaseReturnLine
from sales.models import SalesInvoiceLine, SalesReturnLine
from common.tenancy import get_request_tenant_filter, get_request_tenant_ids
from accounts.dimensions import get_user_active_dimension_codes


def get_raw_material_stock_total(tenant_id, raw_material_ids):
    aggregates = (
        Stock.objects.filter(
            tenant_id=tenant_id,
            raw_material_id__in=raw_material_ids,
            deleted_at__isnull=True,
        )
        .values("raw_material_id")
        .annotate(total=Sum("quantity"))
    )
    return {
        str(agg["raw_material_id"]): float(agg["total"] or 0) for agg in aggregates
    }


def get_product_stock_total(tenant_id, product_ids):
    aggregates = (
        ProductStock.objects.filter(
            tenant_id=tenant_id,
            product_id__in=product_ids,
            deleted_at__isnull=True,
        )
        .values("product_id")
        .annotate(total=Sum("quantity"))
    )
    return {
        str(agg["product_id"]): float(agg["total"] or 0) for agg in aggregates
    }


class BaseTenantViewSet(ModelViewSet):
    """Common behavior for tenant isolation + soft delete"""

    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_queryset(self):
        return self.queryset.filter(
            **get_request_tenant_filter(self.request), deleted_at__isnull=True
        )

    def perform_create(self, serializer):
        serializer.save(tenant_id=self.request.user.tenant_id)

    def perform_destroy(self, instance):
        instance.deleted_at = now()
        instance.save()


class SharedMasterViewSet(BaseTenantViewSet):
    """Master records shared across the current user's allowed dimensions."""

    def get_queryset(self):
        tenant_ids = get_user_active_dimension_codes(self.request.user)
        tenant_id = getattr(self.request, "tenant_id", None) or self.request.user.tenant_id
        if tenant_id and tenant_id not in tenant_ids:
            tenant_ids.append(tenant_id)
        return self.queryset.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
        )


class BrandViewSet(SharedMasterViewSet):
    queryset = Brand.objects.all()
    serializer_class = BrandSerializer


class CategoryViewSet(SharedMasterViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

    @action(detail=True, methods=["post"], url_path="apply-coa-defaults")
    def apply_coa_defaults(self, request, pk=None):
        category = self.get_object()
        products = Product.objects.filter(
            tenant_id=request.user.tenant_id,
            category=category,
            deleted_at__isnull=True,
        )

        updated_products = 0
        updated_fields = 0
        fields = ["inventory_account", "cogs_account", "revenue_account"]

        for product in products:
            changed_fields = []
            for field_name in fields:
                category_value = get_category_account_for_tenant(
                    category,
                    field_name,
                    request.user.tenant_id,
                )
                if category_value and getattr(product, field_name) is None:
                    setattr(product, field_name, category_value)
                    changed_fields.append(field_name)

            if changed_fields:
                product.save(update_fields=[*changed_fields, "updated_at"])
                updated_products += 1
                updated_fields += len(changed_fields)

        return Response(
            {
                "data": {
                    "updated_products": updated_products,
                    "updated_fields": updated_fields,
                    "matched_products": products.count(),
                },
                "message": "Category COAs applied to products with missing mappings.",
            }
        )


class SizeViewSet(SharedMasterViewSet):
    queryset = Size.objects.all()
    serializer_class = SizeSerializer


class UnitViewSet(SharedMasterViewSet):
    queryset = Unit.objects.all()
    serializer_class = UnitSerializer


class RawMaterialViewSet(ModelViewSet):
    queryset = RawMaterial.objects.all()
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_serializer_class(self):
        """Use simple serializer for create/update, detailed for list/retrieve"""
        if self.action in ["create", "update", "partial_update"]:
            return RawMaterialSerializer
        return RawMaterialDetailedSerializer

    def get_queryset(self):
        tenant_ids = get_request_tenant_ids(self.request)
        qs = RawMaterial.objects.filter(
            tenant_id__in=tenant_ids, deleted_at__isnull=True
        ).select_related("brand", "category", "purchase_unit")
        qs = qs.annotate(
            quantity=Coalesce(
                Sum(
                    "stock__quantity",
                    filter=Q(
                        stock__tenant_id__in=tenant_ids,
                        stock__deleted_at__isnull=True,
                    ),
                ),
                Value(0),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            )
        )

        # optional filtering by brand/category/size/unit IDs via query params
        brand_id = self.request.query_params.get("brand_id")
        category_id = self.request.query_params.get("category_id")
        purchase_unit_id = self.request.query_params.get("purchase_unit_id")

        if brand_id:
            qs = qs.filter(brand_id=brand_id)
        if category_id:
            qs = qs.filter(category_id=category_id)
        if purchase_unit_id:
            qs = qs.filter(purchase_unit_id=purchase_unit_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(tenant_id=self.request.user.tenant_id)

    def perform_destroy(self, instance):
        instance.deleted_at = now()
        instance.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response({"data": None, "message": "Raw material deleted successfully"})


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, OrderingFilter]
    search_fields = ["name", "sku"]
    ordering_fields = [
        "sku",
        "tenant_id",
        "name",
        "product_type",
        "unit__name",
        "quantity",
        "_material_count",
        "inventory_account__code",
        "_material_cost",
        "packaging_cost",
        "net_amount",
        "_average_cost",
        "_stock_value",
        "created_at",
    ]
    ordering = ["-created_at"]

    def get_queryset(self):
        active_materials = ProductMaterial.objects.filter(
            deleted_at__isnull=True
        ).select_related("raw_material", "component_product", "uom")
        tenant_ids = get_request_tenant_ids(self.request)
        quantity_subquery = (
            ProductStock.objects.filter(
                tenant_id__in=tenant_ids,
                product_id=OuterRef("pk"),
                deleted_at__isnull=True,
            )
            .values("product_id")
            .annotate(total=Sum("quantity"))
            .values("total")[:1]
        )
        material_count_subquery = (
            ProductMaterial.objects.filter(
                product_id=OuterRef("pk"),
                deleted_at__isnull=True,
            )
            .values("product_id")
            .annotate(total=Count("id"))
            .values("total")[:1]
        )
        material_cost_subquery = (
            ProductMaterial.objects.filter(
                product_id=OuterRef("pk"),
                deleted_at__isnull=True,
            )
            .values("product_id")
            .annotate(total=Sum("amount"))
            .values("total")[:1]
        )
        average_cost_subquery = ProductCostState.objects.filter(
            tenant_id=OuterRef("tenant_id"),
            product_id=OuterRef("pk"),
            deleted_at__isnull=True,
        ).values("average_cost")[:1]
        stock_value_subquery = ProductCostState.objects.filter(
            tenant_id=OuterRef("tenant_id"),
            product_id=OuterRef("pk"),
            deleted_at__isnull=True,
        ).values("total_value")[:1]
        qs = Product.objects.filter(
            tenant_id__in=tenant_ids, deleted_at__isnull=True
        ).select_related("brand", "unit").prefetch_related(
            Prefetch("materials", queryset=active_materials)
        )
        product_type = self.request.query_params.get("product_type", "").strip()
        if product_type == "ASSEMBLY_PRODUCT":
            qs = qs.filter(
                product_type__in=["ASSEMBLY_PRODUCT", "MANUFACTURED"]
            )
        elif product_type == "FINISHED_GOOD":
            qs = qs.filter(product_type__in=["FINISHED_GOOD", "READY_MADE"])
        qs = qs.annotate(
            quantity=Coalesce(
                Subquery(quantity_subquery),
                Value(0),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
            _material_count=Coalesce(
                Subquery(material_count_subquery),
                Value(0),
                output_field=IntegerField(),
            ),
            _material_cost=Coalesce(
                Subquery(material_cost_subquery),
                Value(0),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
            _average_cost=Coalesce(
                Subquery(average_cost_subquery),
                Value(0),
                output_field=DecimalField(max_digits=14, decimal_places=4),
            ),
            _stock_value=Coalesce(
                Subquery(stock_value_subquery),
                Value(0),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            ),
        )
        return qs

    def perform_create(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
        active_production_exists = Production.objects.filter(
            tenant_id=self.request.user.tenant_id,
            product_id=instance.id,
            deleted_at__isnull=True,
        ).exists()
        active_purchase_exists = PurchaseInvoiceLine.objects.filter(
            tenant_id=self.request.user.tenant_id,
            product_id=instance.id,
            deleted_at__isnull=True,
            invoice__deleted_at__isnull=True,
        ).exists()
        active_purchase_return_exists = PurchaseReturnLine.objects.filter(
            tenant_id=self.request.user.tenant_id,
            product_id=instance.id,
            deleted_at__isnull=True,
            purchase_return__deleted_at__isnull=True,
        ).exists()
        active_sales_exists = SalesInvoiceLine.objects.filter(
            tenant_id=self.request.user.tenant_id,
            product_id=instance.id,
            deleted_at__isnull=True,
            invoice__deleted_at__isnull=True,
        ).exists()
        active_sales_return_exists = SalesReturnLine.objects.filter(
            tenant_id=self.request.user.tenant_id,
            product_id=instance.id,
            deleted_at__isnull=True,
            sales_return__deleted_at__isnull=True,
        ).exists()
        non_zero_stock_exists = ProductStock.objects.filter(
            tenant_id=self.request.user.tenant_id,
            product_id=instance.id,
            deleted_at__isnull=True,
        ).exclude(
            quantity=0,
        ).exists()

        if non_zero_stock_exists:
            raise ValidationError(
                "Product cannot be deleted because it has available stock."
            )

        if (
            active_production_exists
            or active_purchase_exists
            or active_purchase_return_exists
            or active_sales_exists
            or active_sales_return_exists
        ):
            raise ValidationError(
                "Product cannot be deleted because active purchase, production, or sales records exist."
            )

        ProductStock.objects.filter(
            tenant_id=self.request.user.tenant_id,
            product_id=instance.id,
            deleted_at__isnull=True,
            quantity=0,
        ).update(deleted_at=now())

        instance.deleted_at = now()
        instance.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response({"data": None, "message": "Product deleted successfully"})


class OpeningStockViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing opening stock inventory.
    - Maintains tenant isolation and soft deletes
    - Automatically syncs raw material quantities
    - Provides enriched response with availability calculations
    """

    permission_classes = [IsAuthenticated]
    serializer_class = OpeningStockSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ["warehouse__name", "raw_material__name"]

    def get_queryset(self):
        return (
            OpeningStock.objects.filter(
                **get_request_tenant_filter(self.request), deleted_at__isnull=True
            )
            .select_related(
                "warehouse",
                "raw_material__brand",
                "raw_material__category",
                "raw_material__purchase_unit",
            )
            .order_by("-date", "-created_at")
        )

    def _get_total_quantities_for_raw_materials(self, tenant_id, raw_material_ids):
        return get_raw_material_stock_total(tenant_id, raw_material_ids)

    def _enrich_response_data(self, open_stocks, tenant_id):
        if not open_stocks:
            return {
                "open_stocks": [],
                "total_quantities": {}
            }

        raw_material_ids = [os.raw_material_id for os in open_stocks]

        total_quantities = self._get_total_quantities_for_raw_materials(
            tenant_id, raw_material_ids
        )

        return {
            "open_stocks": open_stocks,
            "total_quantities": total_quantities
        }

    def _sync_stock_quantity(self, tenant_id, warehouse_id, raw_material_id):
        """Sync warehouse raw material stock from opening stock minus production consumption."""
        sync_raw_material_stock_quantity(tenant_id, warehouse_id, raw_material_id)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        # Add total quantities if we have objects to enrich
        if hasattr(self, "_enriched_data"):
            context["total_quantities"] = self._enriched_data.get(
                "total_quantities", {}
            )
        return context

    def list(self, request, *args, **kwargs):
        """List opening stock with search and pagination"""
        search = request.query_params.get("search", "")
        tenant_id = request.user.tenant_id

        qs = self.get_queryset()

        # Apply search filtering
        if search:
            qs = qs.filter(
                Q(warehouse__name__icontains=search)
                | Q(raw_material__name__icontains=search)
            )

        # Paginate
        page = self.paginate_queryset(qs)
        if page is not None:
            # Enrich the page data
            self._enriched_data = self._enrich_response_data(page, tenant_id)
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        # Enrich all data if not paginated
        self._enriched_data = self._enrich_response_data(list(qs), tenant_id)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        """Retrieve single opening stock entry"""
        instance = self.get_object()
        tenant_id = request.user.tenant_id

        self._enriched_data = self._enrich_response_data([instance], tenant_id)
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """Create opening stock and sync warehouse stock quantity"""
        tenant_id = request.user.tenant_id
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        instance = serializer.save()

        self._sync_stock_quantity(
            tenant_id, instance.warehouse_id, instance.raw_material_id
        )

        # Check if it was restored (had soft delete before)
        action = "created"
        self._enriched_data = self._enrich_response_data([instance], tenant_id)
        enriched_serializer = self.get_serializer(instance)

        response_data = {
            "data": enriched_serializer.data,
            "message": f"Opening stock {action} successfully",
        }
        return Response(response_data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        """Update opening stock and sync warehouse stock quantity"""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        tenant_id = request.user.tenant_id
        old_warehouse_id = instance.warehouse_id
        old_raw_material_id = instance.raw_material_id

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        updated_instance = serializer.save()

        self._sync_stock_quantity(
            tenant_id, updated_instance.warehouse_id, updated_instance.raw_material_id
        )
        if (
            old_raw_material_id != updated_instance.raw_material_id
            or old_warehouse_id != updated_instance.warehouse_id
        ):
            self._sync_stock_quantity(tenant_id, old_warehouse_id, old_raw_material_id)

        self._enriched_data = self._enrich_response_data([updated_instance], tenant_id)
        enriched_serializer = self.get_serializer(updated_instance)
        return Response(enriched_serializer.data)

    def perform_destroy(self, instance):
        """Soft delete opening stock"""
        instance.deleted_at = now()
        instance.save()

    def destroy(self, request, *args, **kwargs):
        """Delete opening stock and sync warehouse stock quantity"""
        instance = self.get_object()
        tenant_id = request.user.tenant_id
        warehouse_id = instance.warehouse_id
        raw_material_id = instance.raw_material_id

        self.perform_destroy(instance)

        self._sync_stock_quantity(tenant_id, warehouse_id, raw_material_id)

        return Response(
            {"data": None, "message": "Opening stock deleted successfully"},
            status=status.HTTP_200_OK,
        )


class ProductionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ProductionSerializer
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ["warehouse__name", "product__name"]

    def get_queryset(self):
        return (
            Production.objects.filter(
                **get_request_tenant_filter(self.request), deleted_at__isnull=True
            )
            .select_related("warehouse", "product")
            .order_by("-date", "-created_at")
        )

    def _get_total_quantities_for_products(self, tenant_id, warehouse_product_pairs):
        if not warehouse_product_pairs:
            return {}

        warehouse_ids = {warehouse_id for warehouse_id, _product_id in warehouse_product_pairs}
        product_ids = {product_id for _warehouse_id, product_id in warehouse_product_pairs}

        return get_product_stock_total(tenant_id, product_ids)

    def _enrich_response_data(self, productions, tenant_id):
        if not productions:
            return {
                "productions": [],
                "total_quantities": {}
            }

        warehouse_product_pairs = {
            (entry.warehouse_id, entry.product_id) for entry in productions
        }
        stock_rows = ProductStock.objects.filter(
            tenant_id=tenant_id,
            warehouse_id__in=[warehouse_id for warehouse_id, _product_id in warehouse_product_pairs],
            product_id__in=[product_id for _warehouse_id, product_id in warehouse_product_pairs],
            deleted_at__isnull=True,
        ).values("warehouse_id", "product_id").annotate(total=Sum("quantity"))
        total_quantities = {
            f"{row['warehouse_id']}:{row['product_id']}": float(row["total"] or 0)
            for row in stock_rows
        }

        return {
            "productions": productions,
            "total_quantities": total_quantities,
        }
    def _sync_product_stock_quantity(self, tenant_id, warehouse_id, product_id):
        sync_product_stock_quantity(tenant_id, warehouse_id, product_id)

    def _get_finished_stock_quantity(self, tenant_id, warehouse_id, product_id):
        return (
            ProductStock.objects.filter(
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                product_id=product_id,
                deleted_at__isnull=True,
            )
            .values_list("quantity", flat=True)
            .first()
            or Decimal("0")
        )

    def _get_material_requirements(self, product, quantity):
        if product.product_type not in {"ASSEMBLY_PRODUCT", "MANUFACTURED"}:
            return {}

        requirements = {"raw_materials": {}, "finished_goods": {}}
        materials = product.materials.filter(deleted_at__isnull=True).select_related(
            "raw_material", "component_product"
        )
        for material in materials:
            if material.component_type == "RAW_MATERIAL":
                requirements["raw_materials"][material.raw_material_id] = material.quantity * quantity
            elif material.component_type in {"FINISHED_GOOD", "ASSEMBLY_PRODUCT"}:
                requirements["finished_goods"][material.component_product_id] = material.quantity * quantity
        return requirements

    def _validate_material_availability(self, tenant_id, warehouse_id, product, quantity, instance=None):
        if product.product_type not in {"ASSEMBLY_PRODUCT", "MANUFACTURED"}:
            return

        materials = product.materials.filter(deleted_at__isnull=True)
        if not materials.exists():
            raise ValidationError("Manufactured product must have active raw material lines.")

        new_requirements = self._get_material_requirements(product, quantity)
        old_requirements = {}
        if instance and instance.warehouse_id == warehouse_id:
            old_requirements = self._get_material_requirements(instance.product, instance.quantity)

        for raw_material_id, required_qty in new_requirements["raw_materials"].items():
            if required_qty <= 0:
                continue

            current_stock = (
                Stock.objects.filter(
                    tenant_id=tenant_id,
                    warehouse_id=warehouse_id,
                    raw_material_id=raw_material_id,
                    deleted_at__isnull=True,
                )
                .values_list("quantity", flat=True)
                .first()
                or Decimal("0")
            )
            effective_available = Decimal(str(current_stock)) + Decimal(
                str(old_requirements.get("raw_materials", {}).get(raw_material_id, 0))
            )

            if Decimal(str(required_qty)) > effective_available:
                raw_material_name = (
                    RawMaterial.objects.filter(id=raw_material_id).values_list("name", flat=True).first()
                    or "Raw material"
                )

        for component_product_id, required_qty in new_requirements["finished_goods"].items():
            if required_qty <= 0:
                continue

            current_stock = (
                ProductStock.objects.filter(
                    tenant_id=tenant_id,
                    warehouse_id=warehouse_id,
                    product_id=component_product_id,
                    deleted_at__isnull=True,
                )
                .values_list("quantity", flat=True)
                .first()
                or Decimal("0")
            )
            effective_available = Decimal(str(current_stock)) + Decimal(
                str(old_requirements.get("finished_goods", {}).get(component_product_id, 0))
            )

            if Decimal(str(required_qty)) > effective_available:
                product_name = (
                    Product.objects.filter(id=component_product_id).values_list("name", flat=True).first()
                    or "Finished good"
                )
                raise ValidationError(
                    {
                        "quantity": (
                            f"Not enough stock for {product_name}. "
                            f"Required: {required_qty}, available: {effective_available}."
                        )
                    }
                )
                raise ValidationError(
                    {
                        "quantity": (
                            f"Not enough stock for {raw_material_name}. "
                            f"Required: {required_qty}, available: {effective_available}."
                        )
                    }
                )

    def _sync_related_raw_material_stock(self, tenant_id, warehouse_id, product):
        if not product or product.product_type not in {"ASSEMBLY_PRODUCT", "MANUFACTURED"}:
            return

        raw_material_ids = list(
            product.materials.filter(
                component_type="RAW_MATERIAL", deleted_at__isnull=True
            ).values_list("raw_material_id", flat=True)
        )
        for raw_material_id in raw_material_ids:
            opening_stock_view = OpeningStockViewSet()
            opening_stock_view._sync_stock_quantity(tenant_id, warehouse_id, raw_material_id)

    def _sync_related_finished_good_stock(self, tenant_id, warehouse_id, product):
        if not product or product.product_type not in {"ASSEMBLY_PRODUCT", "MANUFACTURED"}:
            return

        component_product_ids = list(
            product.materials.filter(
                component_type__in=["FINISHED_GOOD", "ASSEMBLY_PRODUCT"],
                deleted_at__isnull=True,
            ).values_list("component_product_id", flat=True)
        )
        for component_product_id in component_product_ids:
            sync_product_stock_quantity(tenant_id, warehouse_id, component_product_id)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if hasattr(self, "_enriched_data"):
            context["total_quantities"] = self._enriched_data.get("total_quantities", {})
        return context

    def list(self, request, *args, **kwargs):
        search = request.query_params.get("search", "")
        tenant_id = request.user.tenant_id
        qs = self.get_queryset()

        if search:
            qs = qs.filter(
                Q(warehouse__name__icontains=search)
                | Q(product__name__icontains=search)
            )

        page = self.paginate_queryset(qs)
        if page is not None:
            self._enriched_data = self._enrich_response_data(page, tenant_id)
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        self._enriched_data = self._enrich_response_data(list(qs), tenant_id)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        tenant_id = request.user.tenant_id
        self._enriched_data = self._enrich_response_data([instance], tenant_id)
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        tenant_id = request.user.tenant_id
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = Product.objects.get(
            id=serializer.validated_data["product_id"],
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        )
        warehouse_id = serializer.validated_data["warehouse_id"]
        quantity = serializer.validated_data["quantity"]
        self._validate_material_availability(tenant_id, warehouse_id, product, quantity)
        instance = serializer.save()

        self._sync_product_stock_quantity(tenant_id, instance.warehouse_id, instance.product_id)
        self._sync_related_raw_material_stock(tenant_id, instance.warehouse_id, instance.product)
        self._sync_related_finished_good_stock(tenant_id, instance.warehouse_id, instance.product)
        rebuild_product_costing(tenant_id, [instance.product_id])

        self._enriched_data = self._enrich_response_data([instance], tenant_id)
        enriched_serializer = self.get_serializer(instance)
        return Response(
            {
                "data": enriched_serializer.data,
                "message": "Production created successfully",
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], url_path="preview")
    def preview(self, request):
        tenant_id = request.user.tenant_id
        warehouse_id = request.data.get("warehouse_id")
        product_id = request.data.get("product_id")
        quantity = request.data.get("quantity")

        if not warehouse_id or not product_id:
            raise ValidationError("warehouse_id and product_id are required.")

        try:
            quantity_decimal = Decimal(str(quantity or 0))
        except Exception as exc:
            raise ValidationError("quantity must be a valid number.") from exc

        if quantity_decimal <= 0:
            raise ValidationError("quantity must be greater than 0.")

        product = Product.objects.filter(
            id=product_id, tenant_id=tenant_id, deleted_at__isnull=True
        ).prefetch_related(
            "materials__raw_material", "materials__component_product", "materials__uom"
        ).first()
        if not product:
            raise ValidationError("Product not found for this tenant.")
        if product.product_type not in {"ASSEMBLY_PRODUCT", "MANUFACTURED"}:
            raise ValidationError("Only assembly products support production preview.")

        materials = product.materials.filter(deleted_at__isnull=True)
        if not materials.exists():
            raise ValidationError("Assembly product has no active raw material lines.")

        rows = []
        for material in materials:
            required_qty = Decimal(str(material.quantity or 0)) * quantity_decimal
            if material.component_type == "RAW_MATERIAL":
                current_stock = (
                    Stock.objects.filter(
                        tenant_id=tenant_id,
                        warehouse_id=warehouse_id,
                        raw_material_id=material.raw_material_id,
                        deleted_at__isnull=True,
                    )
                    .values_list("quantity", flat=True)
                    .first()
                    or Decimal("0")
                )
                component_id = str(material.raw_material_id)
                component_name = material.raw_material.name
            else:
                current_stock = (
                    ProductStock.objects.filter(
                        tenant_id=tenant_id,
                        warehouse_id=warehouse_id,
                        product_id=material.component_product_id,
                        deleted_at__isnull=True,
                    )
                    .values_list("quantity", flat=True)
                    .first()
                    or Decimal("0")
                )
                component_id = str(material.component_product_id)
                component_name = material.component_product.name

            rows.append(
                {
                    "component_type": material.component_type,
                    "component_id": component_id,
                    "raw_material_id": component_id,
                    "raw_material_name": component_name,
                    "component_name": component_name,
                    "uom": material.uom.name if material.uom else "",
                    "quantity_per_unit": material.quantity,
                    "required_quantity": round(required_qty, 4),
                    "available_quantity": round(Decimal(str(current_stock)), 4),
                    "rate": material.rate,
                    "amount": round(Decimal(str(material.amount or 0)) * quantity_decimal, 2),
                }
            )

        unit_cost = Decimal(str(product.net_amount or 0))
        total_value = unit_cost * quantity_decimal
        raw_material_cost = sum(
            Decimal(str(material.amount or 0)) for material in materials
        )
        current_finished_stock = self._get_finished_stock_quantity(
            tenant_id,
            warehouse_id,
            product.id,
        )
        projected_finished_stock = Decimal(str(current_finished_stock)) + quantity_decimal
        inventory_account = getattr(product, "inventory_account", None)
        return Response(
            {
                "data": {
                    "product_id": str(product.id),
                    "product_name": product.name,
                    "product_type": product.product_type,
                    "uom": product.unit.name if product.unit else "",
                    "inventory_account": (
                        f"{inventory_account.code} - {inventory_account.name}"
                        if inventory_account
                        else ""
                    ),
                    "current_finished_stock": round(Decimal(str(current_finished_stock)), 2),
                    "projected_finished_stock": round(projected_finished_stock, 2),
                    "cost_breakdown": {
                        "raw_material_cost": round(raw_material_cost, 2),
                        "moulding_charges": round(Decimal(str(product.moulding_charges or 0)), 2),
                        "labour_charges": round(Decimal(str(product.labour_charges or 0)), 2),
                        "packaging_cost": round(Decimal(str(product.packaging_cost or 0)), 2),
                        "confirmed_unit_cost": round(Decimal(str(product.confirmed_unit_cost or 0)), 2),
                    },
                    "cost_per_unit": round(unit_cost, 2),
                    "production_quantity": quantity_decimal,
                    "total_value": round(total_value, 2),
                    "material_requirements": rows,
                }
            }
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        tenant_id = request.user.tenant_id
        old_warehouse_id = instance.warehouse_id
        old_product_id = instance.product_id
        old_product = instance.product

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        new_product_id = serializer.validated_data.get("product_id", instance.product_id)
        new_warehouse_id = serializer.validated_data.get("warehouse_id", instance.warehouse_id)
        new_quantity = serializer.validated_data.get("quantity", instance.quantity)
        new_product = Product.objects.get(
            id=new_product_id,
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        )
        self._validate_material_availability(
            tenant_id, new_warehouse_id, new_product, new_quantity, instance=instance
        )
        updated_instance = serializer.save()

        self._sync_product_stock_quantity(
            tenant_id, updated_instance.warehouse_id, updated_instance.product_id
        )
        self._sync_related_raw_material_stock(
            tenant_id, updated_instance.warehouse_id, updated_instance.product
        )
        self._sync_related_finished_good_stock(
            tenant_id, updated_instance.warehouse_id, updated_instance.product
        )
        if (
            old_product_id != updated_instance.product_id
            or old_warehouse_id != updated_instance.warehouse_id
        ):
            self._sync_product_stock_quantity(tenant_id, old_warehouse_id, old_product_id)
            self._sync_related_raw_material_stock(tenant_id, old_warehouse_id, old_product)
            self._sync_related_finished_good_stock(tenant_id, old_warehouse_id, old_product)
        rebuild_product_costing(tenant_id, [old_product_id, updated_instance.product_id])

        self._enriched_data = self._enrich_response_data([updated_instance], tenant_id)
        enriched_serializer = self.get_serializer(updated_instance)
        return Response(enriched_serializer.data)

    def perform_destroy(self, instance):
        instance.deleted_at = now()
        instance.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        tenant_id = request.user.tenant_id
        warehouse_id = instance.warehouse_id
        product_id = instance.product_id

        self.perform_destroy(instance)
        self._sync_product_stock_quantity(tenant_id, warehouse_id, product_id)
        self._sync_related_raw_material_stock(tenant_id, warehouse_id, instance.product)
        self._sync_related_finished_good_stock(tenant_id, warehouse_id, instance.product)
        rebuild_product_costing(tenant_id, [product_id])

        return Response(
            {"data": None, "message": "Production deleted successfully"},
            status=status.HTTP_200_OK,
        )


class BasePartyViewSet(viewsets.ModelViewSet):
    serializer_class = PartySerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "business_name", "phone_number", "email"]

    party_model = None  # override in subclass

    def get_queryset(self):
        qs = self.party_model.objects.filter(
            **get_request_tenant_filter(self.request), deleted_at__isnull=True
        )
        return qs


class SharedPartyViewSet(BasePartyViewSet):
    """Customers and suppliers shared across the user's allowed dimensions."""

    def get_queryset(self):
        tenant_ids = list(get_user_active_dimension_codes(self.request.user))
        tenant_id = getattr(self.request, "tenant_id", None) or self.request.user.tenant_id
        if tenant_id and tenant_id not in tenant_ids:
            tenant_ids.append(tenant_id)
        return self.party_model.objects.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["party_model"] = self.party_model
        return context

    def get_serializer(self, *args, **kwargs):
        serializer_class = self.get_serializer_class()
        kwargs["context"] = self.get_serializer_context()

        serializer = serializer_class(*args, **kwargs)

        if hasattr(serializer, "child"):  # when many=True
            serializer.child.Meta.model = self.party_model
        else:
            serializer.Meta.model = self.party_model

        return serializer

    def perform_create(self, serializer):
        tenant_id = getattr(self.request, "tenant_id", None) or self.request.user.tenant_id
        serializer.save(tenant_id=tenant_id)

    def perform_update(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
        instance.deleted_at = now()
        instance.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response(
            {
                "data": None,
                "message": f"{self.party_model.__name__} deleted successfully",
            }
        )


class CustomerViewSet(SharedPartyViewSet):
    party_model = Customer


class SupplierViewSet(SharedPartyViewSet):
    party_model = Supplier


class PartyOpeningBalanceViewSet(AuditedModelMixin, SharedMasterViewSet):
    audit_entity_type = "party_opening_balance"
    queryset = PartyOpeningBalance.objects.select_related("customer", "supplier")
    serializer_class = PartyOpeningBalanceSerializer
    search_fields = [
        "customer__business_name",
        "customer__name",
        "supplier__business_name",
        "supplier__name",
        "remarks",
        "tenant_id",
    ]

    def perform_create(self, serializer):
        serializer.save()

    def get_queryset(self):
        queryset = super().get_queryset()
        party_type = self.request.query_params.get("party_type")
        if party_type == "customer":
            queryset = queryset.filter(party_type=PartyOpeningBalance.PartyType.CUSTOMER)
        elif party_type == "supplier":
            queryset = queryset.filter(party_type=PartyOpeningBalance.PartyType.SUPPLIER)

        dimension_code = (
            self.request.query_params.get("tenant_id")
            or self.request.query_params.get("dimension")
            or ""
        ).strip()
        if dimension_code and dimension_code.upper() not in {"BOTH", "ALL"}:
            queryset = queryset.filter(tenant_id=dimension_code)

        return queryset.order_by("-date", "-created_at")

    def perform_destroy(self, instance):
        delete_journal_entry(
            JournalEntry.SourceType.PARTY_OPENING_BALANCE,
            instance.id,
            instance.tenant_id,
        )
        instance.deleted_at = now()
        instance.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response(
            {
                "data": None,
                "message": "Opening balance deleted successfully",
            }
        )


class SalesmanViewSet(SharedMasterViewSet):
    queryset = Salesman.objects.all()
    serializer_class = SalesmanSerializer
    search_fields = ["code", "name", "email", "phone_number"]

    def get_queryset(self):
        queryset = super().get_queryset()
        return filter_queryset_by_allowed_salesmen(
            queryset,
            self.request.user,
            field_name="id",
        )


class WarehouseViewSet(viewsets.ModelViewSet):
    serializer_class = WarehouseSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "location"]

    def get_queryset(self):
        search = self.request.query_params.get("search", "")

        tenant_ids = get_user_active_dimension_codes(self.request.user)
        tenant_id = getattr(self.request, "tenant_id", None) or self.request.user.tenant_id
        if tenant_id and tenant_id not in tenant_ids:
            tenant_ids.append(tenant_id)

        qs = Warehouse.objects.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
        )

        # 🔥 Prisma-style OR search
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(location__icontains=search))

        return qs.order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(tenant_id=self.request.user.tenant_id)

    def perform_update(self, serializer):
        serializer.save(tenant_id=self.request.user.tenant_id)

    def perform_destroy(self, instance):
        opening_stock_exists = OpeningStock.objects.filter(
            tenant_id=self.request.user.tenant_id,
            warehouse_id=instance.id,
            deleted_at__isnull=True,
        ).exists()
        production_exists = Production.objects.filter(
            tenant_id=self.request.user.tenant_id,
            warehouse_id=instance.id,
            deleted_at__isnull=True,
        ).exists()
        stock_exists = Stock.objects.filter(
            tenant_id=self.request.user.tenant_id,
            warehouse_id=instance.id,
            deleted_at__isnull=True,
        ).exists()
        product_stock_exists = ProductStock.objects.filter(
            tenant_id=self.request.user.tenant_id,
            warehouse_id=instance.id,
            deleted_at__isnull=True,
        ).exists()

        if opening_stock_exists or stock_exists or production_exists or product_stock_exists:
            raise ValidationError(
                "Warehouse cannot be deleted because stock records exist."
            )

        instance.deleted_at = now()
        instance.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)

        return Response({"data": None, "message": "Warehouse deleted successfully"})
