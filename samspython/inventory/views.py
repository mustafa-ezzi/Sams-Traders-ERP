from httpx import Response
from rest_framework import viewsets
from rest_framework.viewsets import ModelViewSet
from django.utils.timezone import now
from .models import Brand, Category, Product, RawMaterial, Size, Unit
from .serializers import BrandSerializer, CategorySerializer, ProductSerializer, RawMaterialSerializer, SizeSerializer, UnitSerializer
from .pagination import StandardResultsSetPagination
from rest_framework import filters


class BaseTenantViewSet(ModelViewSet):
    """Common behavior for tenant isolation + soft delete"""
    def get_queryset(self):
        return self.queryset.filter(tenant_id=self.request.user.tenant_id, deleted_at__isnull=True)

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
    serializer_class = RawMaterialSerializer
    queryset = RawMaterial.objects.all()
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']  # can add brand__name, category__name if needed

    def get_queryset(self):
        qs = RawMaterial.objects.filter(
            tenant_id=self.request.user.tenant_id,
            deleted_at__isnull=True
        ).select_related('brand', 'category', 'size', 'purchase_unit', 'selling_unit')

        # optional filtering by brand/category/size/unit IDs via query params
        brand_id = self.request.query_params.get('brand_id')
        category_id = self.request.query_params.get('category_id')
        size_id = self.request.query_params.get('size_id')
        purchase_unit_id = self.request.query_params.get('purchase_unit_id')
        selling_unit_id = self.request.query_params.get('selling_unit_id')

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
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']

    def get_queryset(self):
        qs = Product.objects.filter(
            tenant_id=self.request.user.tenant_id,
            deleted_at__isnull=True
        ).prefetch_related('materials')
        return qs

    def perform_destroy(self, instance):
        instance.deleted_at = now()
        instance.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response({"data": None, "message": "Product deleted successfully"})