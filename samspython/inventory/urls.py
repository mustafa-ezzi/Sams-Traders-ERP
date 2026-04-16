from rest_framework.routers import DefaultRouter
from .views import BrandViewSet, CategoryViewSet, CustomerViewSet, OpeningStockViewSet, ProductionViewSet, ProductViewSet, RawMaterialViewSet, SizeViewSet, SupplierViewSet, UnitViewSet, WarehouseViewSet

router = DefaultRouter()
router.register(r'brands', BrandViewSet)
router.register(r'categories', CategoryViewSet)
router.register(r'sizes', SizeViewSet)
router.register(r'units', UnitViewSet)
router.register(r'raw-materials', RawMaterialViewSet, basename='raw-materials')
router.register(r'products', ProductViewSet, basename='product')
router.register(r'customers', CustomerViewSet, basename='customer')
router.register(r'suppliers', SupplierViewSet, basename='supplier')
router.register(r'warehouses', WarehouseViewSet, basename='warehouse')
router.register(r'opening-stock', OpeningStockViewSet, basename='opening-stock')
router.register(r'production', ProductionViewSet, basename='production')

urlpatterns = router.urls
