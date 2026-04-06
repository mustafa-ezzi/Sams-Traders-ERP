# ERP System — Cursor Rules (Phase 1, Django Version)

---

## Project Overview

A full-stack ERP system built with **React (frontend)** and **Django + Django REST Framework (backend)**, serving two tenants:

* **SAMS Traders**
* **AM Traders**

Each tenant's data is isolated but exists within the same application.

---

## Tech Stack

| Layer      | Technology                                             |
| ---------- | ------------------------------------------------------ |
| Frontend   | React 18+, React Router v6, Axios, TailwindCSS         |
| Backend    | Django + Django REST Framework                         |
| Database   | PostgreSQL                                             |
| ORM        | Django ORM                                             |
| Auth       | JWT Authentication                                     |
| State      | React Context / Zustand                                |
| Validation | DRF Serializers (backend) + React Hook Form (frontend) |

---

## Project Structure

```
server/
├── manage.py
├── config/
│   ├── settings.py
│   ├── urls.py
│   └── middleware/
│       └── tenant_middleware.py
│
├── apps/
│   ├── common/
│   │   ├── models.py
│   │   └── utils.py
│
│   ├── masters/
│   │   ├── unit/
│   │   ├── brand/
│   │   ├── size/
│   │   ├── category/
│
│   ├── raw_material/
│   ├── product/
│   ├── warehouse/
│   ├── inventory/
```

---

## Base Model (Mandatory)

All models must inherit from this:

```python
import uuid
from django.db import models

class BaseModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        abstract = True
```

---

## Multi-Tenant Architecture

* Every table must include `tenant_id`
* Valid tenants:

  * `SAMS_TRADERS`
  * `AM_TRADERS`

### Rules

* Tenant ID must always be extracted from JWT
* Never trust tenant_id from request body
* Always filter queries using `request.tenant_id`

---

## Tenant Middleware

```python
class TenantMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = request.user

        if user and user.is_authenticated:
            request.tenant_id = user.tenant_id
        else:
            request.tenant_id = None

        return self.get_response(request)
```

---

## Master Modules

Each module is fully independent:

* Unit
* Brand
* Size
* Category

Each must have:

* Model
* Serializer
* ViewSet
* Routes

---

### Example: Unit

#### Model

```python
class Unit(BaseModel):
    name = models.CharField(max_length=255)

    class Meta:
        unique_together = ('tenant_id', 'name')
```

---

#### Serializer

```python
from rest_framework import serializers

class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = '__all__'
        read_only_fields = ['tenant_id']
```

---

#### ViewSet

```python
from rest_framework.viewsets import ModelViewSet
from django.utils.timezone import now

class UnitViewSet(ModelViewSet):
    serializer_class = UnitSerializer

    def get_queryset(self):
        return Unit.objects.filter(
            tenant_id=self.request.tenant_id,
            deleted_at__isnull=True
        )

    def perform_create(self, serializer):
        serializer.save(tenant_id=self.request.tenant_id)

    def perform_destroy(self, instance):
        instance.deleted_at = now()
        instance.save()
```

---

#### Routes

```python
from rest_framework.routers import DefaultRouter
from .views import UnitViewSet

router = DefaultRouter()
router.register(r'units', UnitViewSet)

urlpatterns = router.urls
```

---

## Raw Material

```python
class RawMaterial(BaseModel):
    name = models.CharField(max_length=255)

    brand = models.ForeignKey('masters.Brand', on_delete=models.PROTECT)
    category = models.ForeignKey('masters.Category', on_delete=models.PROTECT)
    size = models.ForeignKey('masters.Size', on_delete=models.PROTECT)

    purchase_unit = models.ForeignKey('masters.Unit', related_name='purchase_units', on_delete=models.PROTECT)
    selling_unit = models.ForeignKey('masters.Unit', related_name='selling_units', on_delete=models.PROTECT)

    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2)
```

---

## Product

```python
class Product(BaseModel):
    PRODUCT_TYPES = [
        ('READY_MADE', 'Ready Made'),
        ('MANUFACTURED', 'Manufactured')
    ]

    name = models.CharField(max_length=255)
    product_type = models.CharField(max_length=20, choices=PRODUCT_TYPES)

    packaging_cost = models.DecimalField(max_digits=12, decimal_places=2)
    net_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
```

---

### Product Raw Material

```python
class ProductRawMaterial(BaseModel):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='materials')
    raw_material = models.ForeignKey(RawMaterial, on_delete=models.PROTECT)

    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    rate = models.DecimalField(max_digits=12, decimal_places=2)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
```

---

### Calculation Rule

```python
def calculate_product_amount(product, materials):
    total = 0

    for item in materials:
        item['amount'] = item['quantity'] * item['rate']
        total += item['amount']

    return total + product.packaging_cost
```

* Always calculate `amount` and `net_amount` on server
* Never trust frontend values

---

## Warehouse

```python
class Warehouse(BaseModel):
    name = models.CharField(max_length=255)
    location = models.CharField(max_length=255)

    class Meta:
        unique_together = ('tenant_id', 'name')
```

---

## Opening Stock

```python
class OpeningStock(BaseModel):
    date = models.DateField()

    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT)
    raw_material = models.ForeignKey(RawMaterial, on_delete=models.PROTECT)

    purchase_quantity = models.DecimalField(max_digits=12, decimal_places=2)
    selling_quantity = models.DecimalField(max_digits=12, decimal_places=2)
```

---

## API Design Rules

| Method | Endpoint            |
| ------ | ------------------- |
| GET    | /api/v1/units/      |
| POST   | /api/v1/units/      |
| PUT    | /api/v1/units/{id}/ |
| DELETE | /api/v1/units/{id}/ |

---

## Response Format

```json
{
  "data": [],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

---

## Error Format

```json
{
  "error": true,
  "message": "Human-readable message",
  "details": {}
}
```

---

## Filtering & Pagination

Use DRF:

* SearchFilter
* PageNumberPagination

Support:

* ?search=
* ?page=
* ?limit=

---

## Soft Delete Rule

* Never hard delete
* Always set `deleted_at`

```python
instance.deleted_at = now()
```

---

## Naming Conventions

| Context    | Convention       |
| ---------- | ---------------- |
| Components | PascalCase       |
| Variables  | camelCase        |
| DB Columns | snake_case       |
| Routes     | kebab-case       |
| Constants  | UPPER_SNAKE_CASE |

---

## Environment Variables

```env
DATABASE_URL=
SECRET_KEY=
DEBUG=True
JWT_SECRET=
```

---

## Out of Scope (Phase 1)

* Orders (Purchase/Sales)
* Stock Transfers
* Reports & Dashboards
* Advanced Permissions
* Notifications
* Exports (PDF/Excel)

---

## Definition of Done

A module is complete when:

1. Model created and migrated
2. Serializer implemented
3. ViewSet with tenant filtering
4. Routes registered
5. JWT authentication working
6. Tenant isolation verified
7. Soft delete implemented
8. Calculations handled server-side

---
