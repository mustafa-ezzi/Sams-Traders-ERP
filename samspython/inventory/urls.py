from rest_framework.routers import DefaultRouter
from .views import BrandViewSet, CategoryViewSet, ProductViewSet, RawMaterialViewSet, SizeViewSet, UnitViewSet

router = DefaultRouter()
router.register(r'brands', BrandViewSet)
router.register(r'categories', CategoryViewSet)
router.register(r'sizes', SizeViewSet)
router.register(r'units', UnitViewSet)
router.register(r'raw-materials', RawMaterialViewSet, basename='raw-materials')
router.register(r'products', ProductViewSet, basename='product')

urlpatterns = router.urls