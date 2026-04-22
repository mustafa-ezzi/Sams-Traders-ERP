from rest_framework.response import Response
from rest_framework import viewsets, status
from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated
from django.utils.timezone import now
from decimal import Decimal
from django.db.models import DecimalField, ExpressionWrapper, F, Q, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework.decorators import action
from .models import (
    Brand,
    Category,
    Customer,
    OpeningStock,
    ProductStock,
    Production,
    Product,
    ProductMaterial,
    RawMaterial,
    Size,
    Stock,
    Supplier,
    Unit,
    Warehouse,
)
from .serializers import (
    BrandSerializer,
    CategorySerializer,
    OpeningStockSerializer,
    PartySerializer,
    ProductionSerializer,
    ProductSerializer,
    RawMaterialDetailedSerializer,
    RawMaterialSerializer,
    SizeSerializer,
    UnitSerializer,
    WarehouseSerializer,
)
from .pagination import StandardResultsSetPagination
from .services import sync_product_stock_quantity
from rest_framework import filters
from rest_framework.exceptions import ValidationError


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
            tenant_id=self.request.user.tenant_id, deleted_at__isnull=True
        )

    def perform_create(self, serializer):
        serializer.save(tenant_id=self.request.user.tenant_id)

    def perform_destroy(self, instance):
        instance.deleted_at = now()
        instance.save()


class BrandViewSet(BaseTenantViewSet):
    queryset = Brand.objects.all()
    serializer_class = BrandSerializer


class CategoryViewSet(BaseTenantViewSet):
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
                category_value = getattr(category, field_name)
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


class SizeViewSet(BaseTenantViewSet):
    queryset = Size.objects.all()
    serializer_class = SizeSerializer


class UnitViewSet(BaseTenantViewSet):
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
        tenant_id = self.request.user.tenant_id
        qs = RawMaterial.objects.filter(
            tenant_id=tenant_id, deleted_at__isnull=True
        ).select_related("brand", "category", "size", "purchase_unit", "selling_unit")
        qs = qs.annotate(
            quantity=Coalesce(
                Sum(
                    "stock__quantity",
                    filter=Q(
                        stock__tenant_id=tenant_id,
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
        size_id = self.request.query_params.get("size_id")
        purchase_unit_id = self.request.query_params.get("purchase_unit_id")
        selling_unit_id = self.request.query_params.get("selling_unit_id")

        if brand_id:
            qs = qs.filter(brand_id=brand_id)
        if category_id:
            qs = qs.filter(category_id=category_id)
        if size_id:
            qs = qs.filter(size_id=size_id)
        if purchase_unit_id:
            qs = qs.filter(purchase_unit_id=purchase_unit_id)
        if selling_unit_id:
            qs = qs.filter(selling_unit_id=selling_unit_id)

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
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_queryset(self):
        qs = Product.objects.filter(
            tenant_id=self.request.user.tenant_id, deleted_at__isnull=True
        ).prefetch_related("materials")
        qs = qs.annotate(
            quantity=Coalesce(
                Sum(
                    "productstock__quantity",
                    filter=Q(
                        productstock__tenant_id=self.request.user.tenant_id,
                        productstock__deleted_at__isnull=True,
                    ),
                ),
                Value(0),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            )
        )
        return qs

    def perform_create(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
        production_exists = Production.objects.filter(
            tenant_id=self.request.user.tenant_id,
            product_id=instance.id,
            deleted_at__isnull=True,
        ).exists()
        product_stock_exists = ProductStock.objects.filter(
            tenant_id=self.request.user.tenant_id,
            product_id=instance.id,
            deleted_at__isnull=True,
        ).exists()

        if production_exists or product_stock_exists:
            raise ValidationError(
                "Product cannot be deleted because stock records exist."
            )

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
                tenant_id=self.request.user.tenant_id, deleted_at__isnull=True
            )
            .select_related(
                "warehouse",
                "raw_material__brand",
                "raw_material__category",
                "raw_material__size",
                "raw_material__purchase_unit",
                "raw_material__selling_unit",
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
        opening_total = (
            OpeningStock.objects.filter(
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                raw_material_id=raw_material_id,
                deleted_at__isnull=True,
            ).aggregate(total=Sum("quantity"))["total"]
            or 0
        )
        consumption_total = (
            ProductMaterial.objects.filter(
                tenant_id=tenant_id,
                raw_material_id=raw_material_id,
                deleted_at__isnull=True,
                product__deleted_at__isnull=True,
                product__product_type="MANUFACTURED",
                product__production__tenant_id=tenant_id,
                product__production__warehouse_id=warehouse_id,
                product__production__deleted_at__isnull=True,
            ).aggregate(
                total=Sum(
                    ExpressionWrapper(
                        F("quantity") * F("product__production__quantity"),
                        output_field=DecimalField(max_digits=18, decimal_places=4),
                    )
                )
            )["total"]
            or 0
        )
        total_quantity = opening_total - consumption_total

        stock, _ = Stock.objects.get_or_create(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            raw_material_id=raw_material_id,
            deleted_at__isnull=True,
            defaults={"quantity": total_quantity},
        )
        stock.quantity = total_quantity
        stock.deleted_at = None
        stock.save(update_fields=["quantity", "deleted_at", "updated_at"])

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
                tenant_id=self.request.user.tenant_id, deleted_at__isnull=True
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

    def _get_material_requirements(self, product, quantity):
        if product.product_type != "MANUFACTURED":
            return {}

        requirements = {}
        materials = product.materials.filter(deleted_at__isnull=True).select_related("raw_material")
        for material in materials:
            requirements[material.raw_material_id] = material.quantity * quantity
        return requirements

    def _validate_material_availability(self, tenant_id, warehouse_id, product, quantity, instance=None):
        if product.product_type != "MANUFACTURED":
            return

        materials = product.materials.filter(deleted_at__isnull=True)
        if not materials.exists():
            raise ValidationError("Manufactured product must have active raw material lines.")

        new_requirements = self._get_material_requirements(product, quantity)
        old_requirements = {}
        if instance and instance.warehouse_id == warehouse_id:
            old_requirements = self._get_material_requirements(instance.product, instance.quantity)

        for raw_material_id, required_qty in new_requirements.items():
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
                str(old_requirements.get(raw_material_id, 0))
            )

            if Decimal(str(required_qty)) > effective_available:
                raw_material_name = (
                    RawMaterial.objects.filter(id=raw_material_id).values_list("name", flat=True).first()
                    or "Raw material"
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
        if not product or product.product_type != "MANUFACTURED":
            return

        raw_material_ids = list(
            product.materials.filter(deleted_at__isnull=True).values_list("raw_material_id", flat=True)
        )
        for raw_material_id in raw_material_ids:
            opening_stock_view = OpeningStockViewSet()
            opening_stock_view._sync_stock_quantity(tenant_id, warehouse_id, raw_material_id)

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

        self._enriched_data = self._enrich_response_data([instance], tenant_id)
        enriched_serializer = self.get_serializer(instance)
        return Response(
            {
                "data": enriched_serializer.data,
                "message": "Production created successfully",
            },
            status=status.HTTP_201_CREATED,
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
        if (
            old_product_id != updated_instance.product_id
            or old_warehouse_id != updated_instance.warehouse_id
        ):
            self._sync_product_stock_quantity(tenant_id, old_warehouse_id, old_product_id)
            self._sync_related_raw_material_stock(tenant_id, old_warehouse_id, old_product)

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
            tenant_id=self.request.user.tenant_id, deleted_at__isnull=True
        )
        return qs

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
        serializer.save(tenant_id=self.request.user.tenant_id)

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


class CustomerViewSet(BasePartyViewSet):
    party_model = Customer


class SupplierViewSet(BasePartyViewSet):
    party_model = Supplier


class WarehouseViewSet(viewsets.ModelViewSet):
    serializer_class = WarehouseSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "location"]

    def get_queryset(self):
        tenant_id = self.request.user.tenant_id
        search = self.request.query_params.get("search", "")

        qs = Warehouse.objects.filter(tenant_id=tenant_id, deleted_at__isnull=True)

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
