from django.db import models
from common.models import BaseModel  # adjust path if you put BaseModel elsewhere

class Brand(BaseModel):
    name = models.CharField(max_length=255)

    class Meta:
        unique_together = ("tenant_id", "name")
        ordering = ['name']

class Category(BaseModel):
    name = models.CharField(max_length=255)

    class Meta:
        unique_together = ("tenant_id", "name")
        ordering = ['name']

class Size(BaseModel):
    name = models.CharField(max_length=255)

    class Meta:
        unique_together = ("tenant_id", "name")
        ordering = ['name']

class Unit(BaseModel):
    name = models.CharField(max_length=255)

    class Meta:
        unique_together = ("tenant_id", "name")
        ordering = ['name']


class RawMaterial(BaseModel):
    name = models.CharField(max_length=255, unique=False)

    brand = models.ForeignKey(Brand, on_delete=models.PROTECT)
    category = models.ForeignKey(Category, on_delete=models.PROTECT)
    size = models.ForeignKey(Size, on_delete=models.PROTECT)
    purchase_unit = models.ForeignKey(Unit, related_name="purchase_units", on_delete=models.PROTECT)
    selling_unit = models.ForeignKey(Unit, related_name="selling_units", on_delete=models.PROTECT)

    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        unique_together = ("tenant_id", "name")
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


PRODUCT_TYPE_CHOICES = [
    ("READY_MADE", "Ready Made"),
    ("MANUFACTURED", "Manufactured"),
]

class ProductMaterial(models.Model):
    raw_material = models.ForeignKey(
        RawMaterial,
        on_delete=models.PROTECT,
        related_name="product_materials"
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=4)
    rate = models.DecimalField(max_digits=12, decimal_places=2)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tenant_id = models.CharField(max_length=50)  # tenant isolation
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("raw_material", "tenant_id")  


class Product(models.Model):
    tenant_id = models.CharField(max_length=50)
    name = models.CharField(max_length=255)
    product_type = models.CharField(max_length=20, choices=PRODUCT_TYPE_CHOICES)
    packaging_cost = models.DecimalField(max_digits=12, decimal_places=2)
    net_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    materials = models.ManyToManyField(ProductMaterial, related_name="products", blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)