from django.db import models
from common.models import BaseModel
from accounts.models import Account


class Brand(BaseModel):
    name = models.CharField(max_length=255)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_brand_per_tenant",
            )
        ]
        ordering = ["name"]


class Category(BaseModel):
    name = models.CharField(max_length=255)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_category_per_tenant",
            )
        ]
        ordering = ["name"]


class Size(BaseModel):
    name = models.CharField(max_length=255)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_size_per_tenant",
            )
        ]
        ordering = ["name"]


class Unit(BaseModel):
    name = models.CharField(max_length=255)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_unit_per_tenant",
            )
        ]
        ordering = ["name"]


class RawMaterial(BaseModel):
    name = models.CharField(max_length=255, unique=False)

    brand = models.ForeignKey(Brand, on_delete=models.PROTECT)
    category = models.ForeignKey(Category, on_delete=models.PROTECT)
    size = models.ForeignKey(Size, on_delete=models.PROTECT)
    purchase_unit = models.ForeignKey(
        Unit, related_name="purchase_units", on_delete=models.PROTECT
    )
    selling_unit = models.ForeignKey(
        Unit, related_name="selling_units", on_delete=models.PROTECT
    )

    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_rawmaterial_per_tenant",
            )
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    @property
    def purchase_unit_name(self):
        return self.purchase_unit.name

    def selling_unit_name(self):
        return self.selling_unit.name

    @property
    def brand_name(self):
        return self.brand.name

    @property
    def category_name(self):
        return self.category.name

    @property
    def size_name(self):
        return self.size.name


PRODUCT_TYPE_CHOICES = [
    ("READY_MADE", "Ready Made"),
    ("MANUFACTURED", "Manufactured"),
]


class ProductMaterial(BaseModel):
    raw_material = models.ForeignKey(
        "RawMaterial", on_delete=models.PROTECT, related_name="product_materials"
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=4)
    rate = models.DecimalField(max_digits=12, decimal_places=2)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ["created_at"]


class Product(BaseModel):
    name = models.CharField(max_length=255)
    product_type = models.CharField(max_length=20, choices=PRODUCT_TYPE_CHOICES)
    packaging_cost = models.DecimalField(max_digits=12, decimal_places=2)
    net_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    inventory_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="inventory_products",
        null=True,
        blank=True
    )

    cogs_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="cogs_products",
        null=True,
        blank=True
    )

    revenue_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="revenue_products",
        null=True,
        blank=True
    )
    materials = models.ManyToManyField(
        "ProductMaterial", related_name="products", blank=True
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_product_per_tenant",
            )
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class Customer(BaseModel):
    name = models.CharField(max_length=255)
    business_name = models.CharField(max_length=255)
    email = models.EmailField(null=True, blank=True)
    phone_number = models.CharField(max_length=50)
    address = models.TextField()
    account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True
    )
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "business_name"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_customer_per_tenant",
            )
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return self.business_name


class Supplier(BaseModel):
    name = models.CharField(max_length=255)
    business_name = models.CharField(max_length=255)
    email = models.EmailField(null=True, blank=True)
    phone_number = models.CharField(max_length=50)
    address = models.TextField()
    account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True
    )
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "business_name"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_supplier_per_tenant",
            )
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return self.business_name


class Warehouse(BaseModel):
    name = models.CharField(max_length=255)
    location = models.CharField(max_length=255)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_warehouse_per_tenant",
            )
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class OpeningStock(BaseModel):
    date = models.DateField()
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT)
    raw_material = models.ForeignKey(RawMaterial, on_delete=models.PROTECT)
    purchase_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    selling_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "date", "warehouse", "raw_material"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_opening_stock",
            )
        ]
        ordering = ["-date", "-created_at"]
        indexes = [
            models.Index(fields=["tenant_id", "deleted_at", "raw_material"]),
            models.Index(fields=["tenant_id", "deleted_at", "date"]),
        ]

    def __str__(self):
        return f"{self.warehouse.name} - {self.raw_material.name} ({self.date})"
