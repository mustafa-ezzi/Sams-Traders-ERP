from django.db import models
from common.models import BaseModel
from accounts.models import Account


# =========================
# MASTER TABLES
# =========================

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

    # 🔥 OPTIONAL: centralize accounting mapping here (better for scaling)
    inventory_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True, related_name="category_inventory"
    )
    cogs_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True, related_name="category_cogs"
    )
    revenue_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True, related_name="category_revenue"
    )

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
    base_quantity = models.DecimalField(max_digits=12, decimal_places=4, default=1)
    breakdown_unit = models.CharField(max_length=255, blank=True, default="")
    breakdown_quantity = models.DecimalField(max_digits=12, decimal_places=4, default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_unit_per_tenant",
            )
        ]
        ordering = ["name"]


# =========================
# RAW MATERIAL
# =========================

class RawMaterial(BaseModel):
    name = models.CharField(max_length=255)

    brand = models.ForeignKey(Brand, on_delete=models.PROTECT)
    category = models.ForeignKey(Category, on_delete=models.PROTECT)
    size = models.ForeignKey(Size, on_delete=models.PROTECT, null=True, blank=True)

    purchase_unit = models.ForeignKey(
        Unit, related_name="purchase_units", on_delete=models.PROTECT
    )
    selling_unit = models.ForeignKey(
        Unit, related_name="selling_units", on_delete=models.PROTECT
    )

    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # 🔥 accounting mapping (optional but useful)
    inventory_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True
    )

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

    @property
    def selling_unit_name(self):
        return self.selling_unit.name


# =========================
# PRODUCT
# =========================

PRODUCT_TYPE_CHOICES = [
    ("RAW_MATERIAL", "Raw Material"),
    ("ASSEMBLY_PRODUCT", "Assembly Product"),
    ("FINISHED_GOOD", "Finished Good"),
    ("READY_MADE", "Ready Made"),
    ("MANUFACTURED", "Manufactured"),
]


class Product(BaseModel):
    name = models.CharField(max_length=255)
    product_type = models.CharField(max_length=20, choices=PRODUCT_TYPE_CHOICES)
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT, null=True, blank=True)

    packaging_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    moulding_charges = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    labour_charges = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    direct_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    use_calculated_cost = models.BooleanField(default=True)
    confirmed_unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    category = models.ForeignKey(Category, on_delete=models.PROTECT, null=True, blank=True)

    # 🔥 COA mapping
    inventory_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True, related_name="product_inventory"
    )
    cogs_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True, related_name="product_cogs"
    )
    revenue_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True, related_name="product_revenue"
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


# =========================
# BOM (Bill of Materials)
# =========================

class ProductMaterial(BaseModel):
    COMPONENT_TYPE_CHOICES = [
        ("RAW_MATERIAL", "Raw Material"),
        ("FINISHED_GOOD", "Finished Good"),
    ]

    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="materials", null=True, blank=True
    )
    component_type = models.CharField(
        max_length=20,
        choices=COMPONENT_TYPE_CHOICES,
        default="RAW_MATERIAL",
    )
    raw_material = models.ForeignKey(
        RawMaterial, on_delete=models.PROTECT, null=True, blank=True
    )
    component_product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="used_in_assemblies",
    )
    uom = models.ForeignKey(Unit, on_delete=models.PROTECT, null=True, blank=True)

    quantity = models.DecimalField(max_digits=12, decimal_places=4)
    rate = models.DecimalField(max_digits=12, decimal_places=2)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ["created_at"]


# =========================
# PARTIES
# =========================

class Customer(BaseModel):
    name = models.CharField(max_length=255)
    business_name = models.CharField(max_length=255)

    email = models.EmailField(null=True, blank=True)
    phone_number = models.CharField(max_length=50, blank=True, default="")
    address = models.TextField()

    # 🔥 Receivable account
    account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True
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
    phone_number = models.CharField(max_length=50, blank=True, default="")
    address = models.TextField()

    # 🔥 Payable account
    account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True
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


# =========================
# WAREHOUSE + STOCK
# =========================

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


class Stock(BaseModel):
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT)
    raw_material = models.ForeignKey(RawMaterial, on_delete=models.PROTECT)

    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "warehouse", "raw_material"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_stock_per_warehouse",
            )
        ]


class ProductStock(BaseModel):
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT)
    product = models.ForeignKey(Product, on_delete=models.PROTECT)

    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "warehouse", "product"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_product_stock_per_warehouse",
            )
        ]


class ProductCostState(BaseModel):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="cost_states")
    total_quantity = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    total_value = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    average_cost = models.DecimalField(max_digits=14, decimal_places=4, default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "product"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_product_cost_state",
            )
        ]


class ProductCostHistory(BaseModel):
    class SourceType(models.TextChoices):
        PURCHASE_INVOICE = "PURCHASE_INVOICE", "Purchase Invoice"
        PURCHASE_RETURN = "PURCHASE_RETURN", "Purchase Return"
        PRODUCTION = "PRODUCTION", "Production"
        SALES_INVOICE = "SALES_INVOICE", "Sales Invoice"
        SALES_RETURN = "SALES_RETURN", "Sales Return"

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="cost_history")
    date = models.DateField()
    source_type = models.CharField(max_length=40, choices=SourceType.choices)
    source_id = models.UUIDField()
    quantity = models.DecimalField(max_digits=14, decimal_places=4)
    unit_cost = models.DecimalField(max_digits=14, decimal_places=4)
    total_cost = models.DecimalField(max_digits=14, decimal_places=2)
    running_quantity = models.DecimalField(max_digits=14, decimal_places=4)
    running_value = models.DecimalField(max_digits=14, decimal_places=2)
    average_cost_after = models.DecimalField(max_digits=14, decimal_places=4)

    class Meta:
        ordering = ["date", "created_at", "id"]
        indexes = [
            models.Index(fields=["tenant_id", "product", "date"]),
            models.Index(fields=["tenant_id", "source_type", "source_id"]),
        ]


# =========================
# OPENING STOCK
# =========================

class OpeningStock(BaseModel):
    date = models.DateField()
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT)
    raw_material = models.ForeignKey(RawMaterial, on_delete=models.PROTECT)

    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "date", "warehouse", "raw_material"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_opening_stock",
            )
        ]
        ordering = ["-date", "-created_at"]


class Production(BaseModel):
    date = models.DateField()
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT)
    product = models.ForeignKey(Product, on_delete=models.PROTECT)

    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "date", "warehouse", "product"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_production",
            )
        ]
        ordering = ["-date", "-created_at"]
