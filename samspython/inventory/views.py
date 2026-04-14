from rest_framework.response import Response
from rest_framework import viewsets, status
from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated
from django.utils.timezone import now
from django.db.models import Sum, Q
from .models import (
    Brand,
    Category,
    Customer,
    OpeningStock,
    Product,
    RawMaterial,
    Size,
    Supplier,
    Unit,
    Warehouse,
)
from .serializers import (
    BrandSerializer,
    CategorySerializer,
    OpeningStockSerializer,
    PartySerializer,
    ProductSerializer,
    RawMaterialDetailedSerializer,
    RawMaterialSerializer,
    SizeSerializer,
    UnitSerializer,
    WarehouseSerializer,
)
from .pagination import StandardResultsSetPagination
from rest_framework import filters
from django.db.models import Q
from rest_framework.exceptions import ValidationError


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
        qs = RawMaterial.objects.filter(
            tenant_id=self.request.user.tenant_id, deleted_at__isnull=True
        ).select_related("brand", "category", "size", "purchase_unit", "selling_unit")

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
        return qs

    def perform_create(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
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
        """
        Calculate total quantities per raw material from all opening stock entries.
        Returns dict: {raw_material_id: total_quantity}
        """
        aggregates = (
            OpeningStock.objects.filter(
                tenant_id=tenant_id,
                raw_material_id__in=raw_material_ids,
                deleted_at__isnull=True,
            )
            .values("raw_material_id")
            .annotate(total=Sum("purchase_quantity"))
        )

        return {
            str(agg["raw_material_id"]): float(agg["total"] or 0) for agg in aggregates
        }

    def _enrich_response_data(self, open_stocks, tenant_id):
        """Enrich opening stock records with availability calculations"""
        if not open_stocks:
            return open_stocks

        raw_material_ids = [os.raw_material_id for os in open_stocks]
        total_quantities = self._get_total_quantities_for_raw_materials(
            tenant_id, raw_material_ids
        )

        return {"open_stocks": open_stocks, "total_quantities": total_quantities}

    def _sync_raw_material_quantity(self, tenant_id, raw_material_id):
        """
        Sync raw material quantity with sum of all opening stock entries.
        Called whenever opening stock is created, updated, or deleted.
        """
        total_quantity = (
            OpeningStock.objects.filter(
                tenant_id=tenant_id,
                raw_material_id=raw_material_id,
                deleted_at__isnull=True,
            ).aggregate(total=Sum("purchase_quantity"))["total"]
            or 0
        )

        RawMaterial.objects.filter(id=raw_material_id, tenant_id=tenant_id).update(
            quantity=total_quantity
        )

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
        """Create opening stock and sync raw material quantity"""
        tenant_id = request.user.tenant_id
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        instance = serializer.save()

        # Sync raw material quantity
        self._sync_raw_material_quantity(tenant_id, instance.raw_material_id)

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
        """Update opening stock and sync raw material quantity"""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        tenant_id = request.user.tenant_id
        old_raw_material_id = instance.raw_material_id

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        updated_instance = serializer.save()

        # Sync quantities for both old and new raw materials if changed
        self._sync_raw_material_quantity(tenant_id, updated_instance.raw_material_id)
        if old_raw_material_id != updated_instance.raw_material_id:
            self._sync_raw_material_quantity(tenant_id, old_raw_material_id)

        self._enriched_data = self._enrich_response_data([updated_instance], tenant_id)
        enriched_serializer = self.get_serializer(updated_instance)
        return Response(enriched_serializer.data)

    def perform_destroy(self, instance):
        """Soft delete opening stock"""
        instance.deleted_at = now()
        instance.save()

    def destroy(self, request, *args, **kwargs):
        """Delete opening stock and sync raw material quantity"""
        instance = self.get_object()
        tenant_id = request.user.tenant_id
        raw_material_id = instance.raw_material_id

        self.perform_destroy(instance)

        # Sync raw material quantity after deletion
        self._sync_raw_material_quantity(tenant_id, raw_material_id)

        return Response(
            {"data": None, "message": "Opening stock deleted successfully"},
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

    def get_serializer(self, *args, **kwargs):
        # dynamically assign model to serializer for uniqueness check
        serializer_class = self.get_serializer_class()
        kwargs["context"] = self.get_serializer_context()
        serializer = serializer_class(*args, **kwargs)
        serializer.Meta.model = self.party_model
        return serializer

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
        # 🔥 Check opening stock dependency
        # TODO: Uncomment when OpeningStock model is created
        # from inventory.models import OpeningStock
        #
        # exists = OpeningStock.objects.filter(
        #     tenant_id=self.request.user.tenant_id,
        #     warehouse_id=instance.id,
        #     deleted_at__isnull=True
        # ).exists()
        #
        # if exists:
        #     raise ValidationError(
        #         "Warehouse cannot be deleted because opening stock entries exist"
        #     )

        instance.deleted_at = now()
        instance.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)

        return Response({"data": None, "message": "Warehouse deleted successfully"})
