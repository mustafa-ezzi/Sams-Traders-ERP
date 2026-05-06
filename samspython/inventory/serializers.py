from rest_framework import serializers
from decimal import Decimal
from django.utils.timezone import now
from accounts.models import Account
from .models import (
    Brand,
    Category,
    Customer,
    OpeningStock,
    Production,
    Product,
    ProductCostState,
    ProductMaterial,
    RawMaterial,
    Size,
    Unit,
    Warehouse,
)


def validate_account_mapping(account, tenant_id, field_name, allowed_groups):
    if account is None:
        return

    if account.tenant_id != tenant_id or account.deleted_at is not None:
        raise serializers.ValidationError(
            {field_name: "Selected account is not available for this tenant."}
        )

    if not account.is_active:
        raise serializers.ValidationError(
            {field_name: "Selected account is inactive."}
        )

    if not account.is_postable:
        raise serializers.ValidationError(
            {field_name: "Selected account must be postable."}
        )

    if allowed_groups and account.account_group not in allowed_groups:
        raise serializers.ValidationError(
            {
                field_name: (
                    f"Selected account must belong to: {', '.join(allowed_groups)}."
                )
            }
        )


def resolve_product_coa_defaults(category, attrs, instance=None):
    if not category:
        return attrs

    for field_name in ["inventory_account", "cogs_account", "revenue_account"]:
        incoming_value = attrs.get(field_name)
        current_value = getattr(instance, field_name, None) if instance else None
        category_value = getattr(category, field_name, None)

        if incoming_value is None and current_value is None and category_value is not None:
            attrs[field_name] = category_value

    return attrs


class TenantUniqueNameSerializer(serializers.ModelSerializer):
    duplicate_name_message = "Record with this name already exists."

    def validate_name(self, value):
        tenant_id = self.context["request"].user.tenant_id
        qs = self.Meta.model.objects.filter(
            tenant_id=tenant_id,
            name=value,
            deleted_at__isnull=True,
        )

        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        if qs.exists():
            raise serializers.ValidationError(self.duplicate_name_message)

        return value


class BrandSerializer(TenantUniqueNameSerializer):
    duplicate_name_message = "Brand with this name already exists."

    class Meta:
        model = Brand
        fields = "__all__"
        read_only_fields = ["tenant_id"]


class CategorySerializer(TenantUniqueNameSerializer):
    duplicate_name_message = "Category with this name already exists."

    class Meta:
        model = Category
        fields = "__all__"
        read_only_fields = ["tenant_id"]

    def validate(self, attrs):
        tenant_id = self.context["request"].user.tenant_id
        validate_account_mapping(
            attrs.get("inventory_account"),
            tenant_id,
            "inventory_account",
            [Account.AccountGroup.ASSET],
        )
        validate_account_mapping(
            attrs.get("cogs_account"),
            tenant_id,
            "cogs_account",
            [Account.AccountGroup.COGS],
        )
        validate_account_mapping(
            attrs.get("revenue_account"),
            tenant_id,
            "revenue_account",
            [Account.AccountGroup.REVENUE],
        )
        return attrs


class SizeSerializer(TenantUniqueNameSerializer):
    duplicate_name_message = "Size with this name already exists."

    class Meta:
        model = Size
        fields = "__all__"
        read_only_fields = ["tenant_id"]


class UnitSerializer(TenantUniqueNameSerializer):
    duplicate_name_message = "Unit with this name already exists."

    class Meta:
        model = Unit
        fields = "__all__"
        read_only_fields = ["tenant_id"]

    def validate_base_quantity(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError("Base quantity must be greater than 0.")
        return value

    def validate_breakdown_quantity(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError("Breakdown quantity must be greater than 0.")
        return value

    def validate(self, attrs):
        breakdown_unit = attrs.get(
            "breakdown_unit",
            getattr(self.instance, "breakdown_unit", ""),
        )
        if not str(breakdown_unit or "").strip():
            raise serializers.ValidationError(
                {"breakdown_unit": "Breakdown unit is required (for example: Gram, ML, PCS)."}
            )
        return attrs


class ProductMaterialSerializer(serializers.ModelSerializer):
    raw_material_id = serializers.PrimaryKeyRelatedField(
        source="raw_material", queryset=RawMaterial.objects.all()
    )
    uom_id = serializers.PrimaryKeyRelatedField(
        source="uom", queryset=Unit.objects.all(), allow_null=True, required=False
    )
    raw_material_name = serializers.ReadOnlyField(source="raw_material.name")
    uom_name = serializers.ReadOnlyField(source="uom.name")

    class Meta:
        model = ProductMaterial
        fields = [
            "id",
            "raw_material_id",
            "raw_material_name",
            "uom_id",
            "uom_name",
            "quantity",
            "rate",
            "amount",
        ]
        read_only_fields = ["id", "amount"]

    def validate(self, data):
        quantity = data.get("quantity", 0)
        rate = data.get("rate", 0)

        if quantity <= 0:
            raise serializers.ValidationError("Quantity must be greater than 0")

        if rate < 0:
            raise serializers.ValidationError("Rate cannot be negative")

        data["amount"] = round(quantity * rate, 2)
        return data


class ProductSerializer(serializers.ModelSerializer):
    quantity = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    materials = ProductMaterialSerializer(many=True, required=False)
    average_cost = serializers.SerializerMethodField()
    stock_value = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "product_type",
            "direct_price",
            "moulding_charges",
            "labour_charges",
            "packaging_cost",
            "use_calculated_cost",
            "confirmed_unit_cost",
            "net_amount",
            "category",
            "unit",
            "inventory_account",
            "cogs_account",
            "revenue_account",
            "quantity",
            "average_cost",
            "stock_value",
            "materials",
        ]

    def _get_cost_state(self, obj):
        if not hasattr(self, "_cost_state_cache"):
            self._cost_state_cache = {}

        cache_key = str(obj.id)
        if cache_key not in self._cost_state_cache:
            self._cost_state_cache[cache_key] = ProductCostState.objects.filter(
                tenant_id=obj.tenant_id,
                product_id=obj.id,
                deleted_at__isnull=True,
            ).first()
        return self._cost_state_cache[cache_key]

    def get_average_cost(self, obj):
        state = self._get_cost_state(obj)
        return state.average_cost if state else Decimal("0.0000")

    def get_stock_value(self, obj):
        state = self._get_cost_state(obj)
        return state.total_value if state else Decimal("0.00")

    def validate(self, data):
        tenant_id = self.context["request"].user.tenant_id
        product_type = data.get("product_type")
        materials = data.get("materials", [])
        category = data.get("category", getattr(self.instance, "category", None))
        unit = data.get("unit", getattr(self.instance, "unit", None))

        normalized_product_type = (
            "ASSEMBLY_PRODUCT" if product_type in {"MANUFACTURED"} else
            "FINISHED_GOOD" if product_type in {"READY_MADE"} else product_type
        )

        if normalized_product_type == "RAW_MATERIAL":
            raise serializers.ValidationError(
                "Raw materials should be created from the raw material module."
            )

        if normalized_product_type == "FINISHED_GOOD" and materials:
            raise serializers.ValidationError(
                "Finished goods cannot have raw material line items"
            )
        if normalized_product_type == "ASSEMBLY_PRODUCT" and not materials:
            raise serializers.ValidationError(
                "Assembly products must include at least one raw material line item"
            )

        if normalized_product_type == "FINISHED_GOOD" and data.get("direct_price", 0) <= 0:
            raise serializers.ValidationError(
                {"direct_price": "Direct finished goods must include per-unit price."}
            )

        use_calculated_cost = data.get(
            "use_calculated_cost",
            getattr(self.instance, "use_calculated_cost", True),
        )
        confirmed_unit_cost = data.get(
            "confirmed_unit_cost",
            getattr(self.instance, "confirmed_unit_cost", 0),
        )
        if normalized_product_type == "ASSEMBLY_PRODUCT" and not use_calculated_cost:
            if confirmed_unit_cost is None or Decimal(str(confirmed_unit_cost)) <= 0:
                raise serializers.ValidationError(
                    {"confirmed_unit_cost": "Provide confirmed unit cost when calculated cost is disabled."}
                )
        material_ids = [m["raw_material"].id for m in materials]
        if len(set(material_ids)) != len(material_ids):
            raise serializers.ValidationError("Duplicate raw materials are not allowed")

        for material in materials:
            if material["raw_material"].tenant_id != tenant_id:
                raise serializers.ValidationError(
                    "Raw materials must belong to the current tenant."
                )

        if unit and (unit.tenant_id != tenant_id or unit.deleted_at is not None):
            raise serializers.ValidationError(
                {"unit": "Selected unit is not available for this tenant."}
            )

        data = resolve_product_coa_defaults(category, data, instance=self.instance)

        validate_account_mapping(
            data.get("inventory_account"),
            tenant_id,
            "inventory_account",
            [Account.AccountGroup.ASSET],
        )
        validate_account_mapping(
            data.get("cogs_account"),
            tenant_id,
            "cogs_account",
            [Account.AccountGroup.COGS],
        )
        validate_account_mapping(
            data.get("revenue_account"),
            tenant_id,
            "revenue_account",
            [Account.AccountGroup.REVENUE],
        )

        data["product_type"] = normalized_product_type
        return data

    def create(self, validated_data):
        materials_data = validated_data.pop("materials", [])
        tenant_id = self.context["request"].user.tenant_id

        product = Product.objects.create(tenant_id=tenant_id, **validated_data)

        raw_material_total = Decimal("0.00")

        for material in materials_data:
            material_obj = ProductMaterial.objects.create(
                tenant_id=tenant_id,
                product=product,  # ✅ FIX
                raw_material=material["raw_material"],
                uom=material.get("uom"),
                quantity=material["quantity"],
                rate=material["rate"],
                amount=material["amount"],
            )
            raw_material_total += Decimal(str(material_obj.amount or 0))

        if product.product_type == "ASSEMBLY_PRODUCT":
            calculated = (
                raw_material_total
                + Decimal(str(product.packaging_cost or 0))
                + Decimal(str(product.moulding_charges or 0))
                + Decimal(str(product.labour_charges or 0))
            )
            final_cost = calculated if product.use_calculated_cost else Decimal(
                str(product.confirmed_unit_cost or 0)
            )
            product.confirmed_unit_cost = final_cost
            product.net_amount = round(final_cost, 2)
        elif product.product_type == "FINISHED_GOOD":
            product.confirmed_unit_cost = Decimal(str(product.direct_price or 0))
            product.net_amount = round(Decimal(str(product.direct_price or 0)), 2)
        else:
            product.net_amount = round(raw_material_total, 2)
        product.save()

        return product

    def update(self, instance, validated_data):
        materials_data = validated_data.pop("materials", [])
        tenant_id = self.context["request"].user.tenant_id

        ProductMaterial.objects.filter(
            product=instance, deleted_at__isnull=True
        ).update(deleted_at=now())

        instance.name = validated_data.get("name", instance.name)
        instance.product_type = validated_data.get(
            "product_type", instance.product_type
        )
        instance.direct_price = validated_data.get("direct_price", instance.direct_price)
        instance.moulding_charges = validated_data.get(
            "moulding_charges", instance.moulding_charges
        )
        instance.labour_charges = validated_data.get(
            "labour_charges", instance.labour_charges
        )
        instance.packaging_cost = validated_data.get(
            "packaging_cost", instance.packaging_cost
        )
        instance.use_calculated_cost = validated_data.get(
            "use_calculated_cost", instance.use_calculated_cost
        )
        instance.confirmed_unit_cost = validated_data.get(
            "confirmed_unit_cost", instance.confirmed_unit_cost
        )
        instance.category = validated_data.get("category", instance.category)
        instance.unit = validated_data.get("unit", instance.unit)
        instance.inventory_account = validated_data.get(
            "inventory_account", instance.inventory_account
        )
        instance.cogs_account = validated_data.get("cogs_account", instance.cogs_account)
        instance.revenue_account = validated_data.get(
            "revenue_account", instance.revenue_account
        )
        raw_material_total = Decimal("0.00")
        instance.save()

        for material in materials_data:
            material_obj = ProductMaterial.objects.create(
                tenant_id=tenant_id,
                product=instance,
                raw_material=material.get("raw_material"),
                uom=material.get("uom"),
                quantity=material.get("quantity"),
                rate=material.get("rate"),
                amount=material.get("amount"),
            )
            raw_material_total += Decimal(str(material_obj.amount or 0))

        if instance.product_type == "ASSEMBLY_PRODUCT":
            calculated = (
                raw_material_total
                + Decimal(str(instance.packaging_cost or 0))
                + Decimal(str(instance.moulding_charges or 0))
                + Decimal(str(instance.labour_charges or 0))
            )
            final_cost = calculated if instance.use_calculated_cost else Decimal(
                str(instance.confirmed_unit_cost or 0)
            )
            instance.confirmed_unit_cost = final_cost
            instance.net_amount = round(final_cost, 2)
        elif instance.product_type == "FINISHED_GOOD":
            instance.confirmed_unit_cost = Decimal(str(instance.direct_price or 0))
            instance.net_amount = round(Decimal(str(instance.direct_price or 0)), 2)
        else:
            instance.net_amount = round(raw_material_total, 2)
        instance.save()
        return instance


class PartySerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer  # we'll dynamically switch in view
        fields = [
            "id",
            "name",
            "business_name",
            "email",
            "phone_number",
            "address",
            "account",
        ]

    def get_model(self):
        return self.context.get("party_model", self.Meta.model)

    def validate_business_name(self, value):
        tenant_id = self.context["request"].user.tenant_id
        instance = getattr(self, "instance", None)
        model = self.get_model()

        qs = model.objects.filter(
            tenant_id=tenant_id, business_name=value, deleted_at__isnull=True
        )
        if instance:
            qs = qs.exclude(pk=instance.pk)

        if qs.exists():
            raise serializers.ValidationError(
                f"{model.__name__} with this business name already exists"
            )
        return value

    def validate(self, attrs):
        tenant_id = self.context["request"].user.tenant_id
        model = self.Meta.model
        allowed_group = (
            [Account.AccountGroup.ASSET]
            if model is Customer
            else [Account.AccountGroup.LIABILITY]
        )
        validate_account_mapping(
            attrs.get("account"),
            tenant_id,
            "account",
            allowed_group,
        )
        return attrs


class WarehouseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Warehouse
        fields = ["id", "name", "location"]

    def validate_name(self, value):
        tenant_id = self.context["request"].user.tenant_id
        instance = getattr(self, "instance", None)

        qs = Warehouse.objects.filter(
            tenant_id=tenant_id, name=value, deleted_at__isnull=True
        )

        if instance:
            qs = qs.exclude(pk=instance.pk)

        if qs.exists():
            raise serializers.ValidationError("Warehouse with this name already exists")

        return value


class OpeningStockDetailedSerializer(serializers.Serializer):
    """Detailed warehouse and raw material data for enrich response"""

    id = serializers.UUIDField()
    name = serializers.CharField()


class RawMaterialSerializer(serializers.ModelSerializer):
    class Meta:
        model = RawMaterial
        fields = "__all__"
        read_only_fields = ["tenant_id", "created_at", "updated_at", "deleted_at"]
        extra_kwargs = {"selling_unit": {"required": False}, "selling_price": {"required": False}}

    def validate(self, attrs):
        tenant_id = self.context["request"].user.tenant_id
        if "purchase_price" in attrs:
            attrs["purchase_price"] = attrs.get("purchase_price") or 0

        category = attrs.get("category") or getattr(self.instance, "category", None)
        if category and getattr(category, "inventory_account", None):
            attrs["inventory_account"] = category.inventory_account

        purchase_unit = attrs.get("purchase_unit") or getattr(self.instance, "purchase_unit", None)
        if purchase_unit:
            attrs["selling_unit"] = purchase_unit
        attrs["selling_price"] = 0
        validate_account_mapping(
            attrs.get("inventory_account"),
            tenant_id,
            "inventory_account",
            [Account.AccountGroup.ASSET],
        )
        return attrs


class RawMaterialDetailedSerializer(serializers.ModelSerializer):
    quantity = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    unit_name = serializers.ReadOnlyField()
    brand_name = serializers.ReadOnlyField()
    category_name = serializers.ReadOnlyField()
    brand = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()
    purchase_unit = serializers.SerializerMethodField()

    class Meta:
        model = RawMaterial
        fields = [
            "id",
            "name",
            "brand",
            "brand_name",
            "category_name",
            "unit_name",
            "category",
            "purchase_unit",
            "inventory_account",
            "quantity",
            "purchase_price",
        ]

    def get_brand(self, obj):
        return {"id": str(obj.brand.id), "name": obj.brand.name}

    def get_category(self, obj):
        return {"id": str(obj.category.id), "name": obj.category.name}

    def get_purchase_unit(self, obj):
        return {"id": str(obj.purchase_unit.id), "name": obj.purchase_unit.name}

class OpeningStockSerializer(serializers.ModelSerializer):
    warehouse = OpeningStockDetailedSerializer(read_only=True)
    warehouse_id = serializers.UUIDField(write_only=True)
    raw_material = RawMaterialDetailedSerializer(read_only=True)
    raw_material_id = serializers.UUIDField(write_only=True)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=2)
    previous_availability = serializers.SerializerMethodField()
    current_availability = serializers.SerializerMethodField()
    available_quantity = serializers.SerializerMethodField()

    class Meta:
        model = OpeningStock
        fields = [
            "id",
            "date",
            "warehouse",
            "warehouse_id",
            "raw_material",
            "raw_material_id",
            "quantity",
            "previous_availability",
            "current_availability",
            "available_quantity",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "previous_availability",
            "current_availability",
            "available_quantity",
        ]

    def get_previous_availability(self, obj):
        current = self.context.get("total_quantities", {}).get(
            str(obj.raw_material_id), 0
        )
        quantity = float(obj.quantity or 0)
        return max(0, current - quantity)

    def get_current_availability(self, obj):
        return float(
            self.context.get("total_quantities", {}).get(str(obj.raw_material_id), 0)
        )

    def get_available_quantity(self, obj):
        return float(
            self.context.get("total_quantities", {}).get(str(obj.raw_material_id), 0)
        )

    def validate_date(self, value):
        if not value:
            raise serializers.ValidationError("Date is required")
        return value

    def validate_warehouse_id(self, value):
        tenant_id = self.context["request"].user.tenant_id
        if not Warehouse.objects.filter(
            id=value, tenant_id=tenant_id, deleted_at__isnull=True
        ).exists():
            raise serializers.ValidationError("Warehouse not found for this tenant")
        return value

    def validate_raw_material_id(self, value):
        tenant_id = self.context["request"].user.tenant_id
        if not RawMaterial.objects.filter(
            id=value, tenant_id=tenant_id, deleted_at__isnull=True
        ).exists():
            raise serializers.ValidationError("Raw material not found for this tenant")
        return value

    def validate_quantity(self, value):
        if value < 0:
            raise serializers.ValidationError("Quantity must be at least 0")
        return value

    def validate(self, data):
        tenant_id = self.context["request"].user.tenant_id
        warehouse_id = data.get("warehouse_id") or (
            self.instance.warehouse_id if self.instance else None
        )
        raw_material_id = data.get("raw_material_id") or (
            self.instance.raw_material_id if self.instance else None
        )
        date = data.get("date") or (self.instance.date if self.instance else None)
        exclude_id = self.instance.id if self.instance else None

        if warehouse_id and raw_material_id and date:
            duplicate = OpeningStock.objects.filter(
                tenant_id=tenant_id,
                date=date,
                warehouse_id=warehouse_id,
                raw_material_id=raw_material_id,
                deleted_at__isnull=True,
            )
            if exclude_id:
                duplicate = duplicate.exclude(id=exclude_id)

            if duplicate.exists():
                raise serializers.ValidationError(
                    "Opening stock already exists for this date, warehouse, and raw material"
                )

        return data

    def create(self, validated_data):
        tenant_id = self.context["request"].user.tenant_id
        warehouse_id = validated_data.pop("warehouse_id")
        raw_material_id = validated_data.pop("raw_material_id")
        quantity = validated_data.pop("quantity")

        opening_stock = OpeningStock.objects.create(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            raw_material_id=raw_material_id,
            quantity=quantity,
            **validated_data,
        )
        return opening_stock

    def update(self, instance, validated_data):
        warehouse_id = validated_data.pop("warehouse_id", None)
        raw_material_id = validated_data.pop("raw_material_id", None)
        quantity = validated_data.pop("quantity", None)

        if warehouse_id:
            instance.warehouse_id = warehouse_id
        if raw_material_id:
            instance.raw_material_id = raw_material_id
        if quantity is not None:
            instance.quantity = quantity

        instance.save()
        return instance


class ProductDetailedSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    unit = serializers.SerializerMethodField()

    def get_unit(self, obj):
        if getattr(obj, "unit", None) is None:
            return None
        return obj.unit.name


class ProductionSerializer(serializers.ModelSerializer):
    warehouse = OpeningStockDetailedSerializer(read_only=True)
    warehouse_id = serializers.UUIDField(write_only=True)
    product = ProductDetailedSerializer(read_only=True)
    product_id = serializers.UUIDField(write_only=True)
    previous_availability = serializers.SerializerMethodField()
    current_availability = serializers.SerializerMethodField()
    available_quantity = serializers.SerializerMethodField()

    class Meta:
        model = Production
        fields = [
            "id",
            "date",
            "warehouse",
            "warehouse_id",
            "product",
            "product_id",
            "quantity",
            "previous_availability",
            "current_availability",
            "available_quantity",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "previous_availability",
            "current_availability",
            "available_quantity",
        ]

    def get_previous_availability(self, obj):
        key = f"{obj.warehouse_id}:{obj.product_id}"
        current = self.context.get("total_quantities", {}).get(key, 0)
        quantity = float(obj.quantity or 0)
        return current - quantity

    def get_current_availability(self, obj):
        key = f"{obj.warehouse_id}:{obj.product_id}"
        return float(self.context.get("total_quantities", {}).get(key, 0))

    def get_available_quantity(self, obj):
        key = f"{obj.warehouse_id}:{obj.product_id}"
        return float(self.context.get("total_quantities", {}).get(key, 0))

    def validate_date(self, value):
        if not value:
            raise serializers.ValidationError("Date is required")
        return value

    def validate_warehouse_id(self, value):
        tenant_id = self.context["request"].user.tenant_id
        if not Warehouse.objects.filter(
            id=value, tenant_id=tenant_id, deleted_at__isnull=True
        ).exists():
            raise serializers.ValidationError("Warehouse not found for this tenant")
        return value

    def validate_product_id(self, value):
        tenant_id = self.context["request"].user.tenant_id
        product = Product.objects.filter(
            id=value, tenant_id=tenant_id, deleted_at__isnull=True
        ).first()
        if not product:
            raise serializers.ValidationError("Product not found for this tenant")
        if product.product_type not in {"ASSEMBLY_PRODUCT", "MANUFACTURED"}:
            raise serializers.ValidationError(
                "Only assembly products can be used in production entries."
            )
        return value

    def validate_quantity(self, value):
        if value == 0:
            raise serializers.ValidationError("Quantity cannot be 0")
        return value

    def validate(self, data):
        tenant_id = self.context["request"].user.tenant_id
        warehouse_id = data.get("warehouse_id") or (
            self.instance.warehouse_id if self.instance else None
        )
        product_id = data.get("product_id") or (
            self.instance.product_id if self.instance else None
        )
        date = data.get("date") or (self.instance.date if self.instance else None)
        exclude_id = self.instance.id if self.instance else None

        if warehouse_id and product_id and date:
            duplicate = Production.objects.filter(
                tenant_id=tenant_id,
                date=date,
                warehouse_id=warehouse_id,
                product_id=product_id,
                deleted_at__isnull=True,
            )
            if exclude_id:
                duplicate = duplicate.exclude(id=exclude_id)

            if duplicate.exists():
                raise serializers.ValidationError(
                    "Production already exists for this date, warehouse, and product"
                )

        return data

    def create(self, validated_data):
        tenant_id = self.context["request"].user.tenant_id
        warehouse_id = validated_data.pop("warehouse_id")
        product_id = validated_data.pop("product_id")
        quantity = validated_data.pop("quantity")

        return Production.objects.create(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            product_id=product_id,
            quantity=quantity,
            **validated_data,
        )

    def update(self, instance, validated_data):
        warehouse_id = validated_data.pop("warehouse_id", None)
        product_id = validated_data.pop("product_id", None)
        quantity = validated_data.pop("quantity", None)

        if warehouse_id:
            instance.warehouse_id = warehouse_id
        if product_id:
            instance.product_id = product_id
        if quantity is not None:
            instance.quantity = quantity

        instance.date = validated_data.get("date", instance.date)
        instance.save()
        return instance
