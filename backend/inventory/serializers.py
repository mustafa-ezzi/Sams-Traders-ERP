from rest_framework import serializers
from decimal import Decimal
import re
from django.utils.timezone import now
from accounts.models import Account, Dimension
from accounts.dimensions import get_user_active_dimension_codes
from inventory.party_accounts import assign_default_party_account
from .models import (
    Brand,
    Category,
    Customer,
    Supplier,
    OpeningStock,
    Production,
    Product,
    ProductCostState,
    ProductMaterial,
    RawMaterial,
    Salesman,
    Size,
    Unit,
    Warehouse,
)


def validate_account_mapping(
    account,
    tenant_id,
    field_name,
    allowed_groups,
    allowed_types=None,
    require_postable=True,
):
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

    has_children = account.children.filter(deleted_at__isnull=True).exists()
    if require_postable and not account.is_postable and has_children:
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

    if allowed_types and account.account_type not in allowed_types:
        raise serializers.ValidationError(
            {
                field_name: (
                    f"Selected account must have account type: {', '.join(allowed_types)}."
                )
            }
        )


def validate_shared_account_mapping(
    account,
    tenant_ids,
    field_name,
    allowed_groups,
    allowed_types=None,
    require_postable=True,
):
    if account is None:
        return

    if account.tenant_id not in tenant_ids or account.deleted_at is not None:
        raise serializers.ValidationError(
            {field_name: "Selected account is not available for this tenant."}
        )

    if not account.is_active:
        raise serializers.ValidationError(
            {field_name: "Selected account is inactive."}
        )

    has_children = account.children.filter(deleted_at__isnull=True).exists()
    if require_postable and not account.is_postable and has_children:
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

    if allowed_types and account.account_type not in allowed_types:
        raise serializers.ValidationError(
            {
                field_name: (
                    f"Selected account must have account type: {', '.join(allowed_types)}."
                )
            }
        )


def resolve_product_coa_defaults(category, attrs, instance=None):
    if not category:
        return attrs

    for field_name in ["inventory_account", "cogs_account", "revenue_account"]:
        incoming_value = attrs.get(field_name)
        current_value = getattr(instance, field_name, None) if instance else None
        category_value = get_category_account_for_tenant(
            category,
            field_name,
            attrs.get("tenant_id") or getattr(instance, "tenant_id", None),
        )

        if incoming_value is None and current_value is None and category_value is not None:
            attrs[field_name] = category_value

    return attrs


def get_category_account_for_tenant(category, field_name, tenant_id):
    account = getattr(category, field_name, None)
    if not account:
        return None

    if account.tenant_id == tenant_id:
        return account

    return Account.objects.filter(
        tenant_id=tenant_id,
        code=account.code,
        deleted_at__isnull=True,
    ).first()


def get_request_user_dimension_codes(request):
    tenant_ids = get_user_active_dimension_codes(request.user)
    tenant_id = getattr(request, "tenant_id", None) or request.user.tenant_id
    if tenant_id and tenant_id not in tenant_ids:
        tenant_ids.append(tenant_id)
    return tenant_ids


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


class SharedUniqueNameSerializer(serializers.ModelSerializer):
    duplicate_name_message = "Record with this name already exists."

    def get_shared_tenant_ids(self):
        return get_request_user_dimension_codes(self.context["request"])

    def validate_name(self, value):
        qs = self.Meta.model.objects.filter(
            tenant_id__in=self.get_shared_tenant_ids(),
            name=value,
            deleted_at__isnull=True,
        )

        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        if qs.exists():
            raise serializers.ValidationError(self.duplicate_name_message)

        return value


class BrandSerializer(SharedUniqueNameSerializer):
    duplicate_name_message = "Brand with this name already exists."

    class Meta:
        model = Brand
        fields = "__all__"
        read_only_fields = ["tenant_id"]
        extra_kwargs = {"name": {"validators": []}}


class CategorySerializer(SharedUniqueNameSerializer):
    duplicate_name_message = "Category with this name already exists."

    class Meta:
        model = Category
        fields = "__all__"
        read_only_fields = ["tenant_id"]
        extra_kwargs = {"name": {"validators": []}}

    def validate(self, attrs):
        tenant_ids = get_request_user_dimension_codes(self.context["request"])
        validate_shared_account_mapping(
            attrs.get("inventory_account"),
            tenant_ids,
            "inventory_account",
            [Account.AccountGroup.ASSET],
            [Account.AccountType.INVENTORY],
            require_postable=False,
        )
        validate_shared_account_mapping(
            attrs.get("cogs_account"),
            tenant_ids,
            "cogs_account",
            [Account.AccountGroup.COGS],
        )
        validate_shared_account_mapping(
            attrs.get("revenue_account"),
            tenant_ids,
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


class UnitSerializer(SharedUniqueNameSerializer):
    duplicate_name_message = "Unit with this name already exists."

    class Meta:
        model = Unit
        fields = "__all__"
        read_only_fields = ["tenant_id"]
        extra_kwargs = {"name": {"validators": []}}

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
        source="raw_material",
        queryset=RawMaterial.objects.all(),
        allow_null=True,
        required=False,
    )
    component_product_id = serializers.PrimaryKeyRelatedField(
        source="component_product",
        queryset=Product.objects.all(),
        allow_null=True,
        required=False,
    )
    uom_id = serializers.PrimaryKeyRelatedField(
        source="uom", queryset=Unit.objects.all(), allow_null=True, required=False
    )
    raw_material_name = serializers.ReadOnlyField(source="raw_material.name")
    component_product_name = serializers.ReadOnlyField(source="component_product.name")
    uom_name = serializers.ReadOnlyField(source="uom.name")

    class Meta:
        model = ProductMaterial
        fields = [
            "id",
            "component_type",
            "raw_material_id",
            "raw_material_name",
            "component_product_id",
            "component_product_name",
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
        component_type = data.get("component_type", "RAW_MATERIAL")
        raw_material = data.get("raw_material")
        component_product = data.get("component_product")

        if quantity <= 0:
            raise serializers.ValidationError("Quantity must be greater than 0")

        if rate < 0:
            raise serializers.ValidationError("Rate cannot be negative")

        if component_type == "RAW_MATERIAL":
            if raw_material is None:
                raise serializers.ValidationError({"raw_material_id": "Raw material is required."})
            if component_product is not None:
                raise serializers.ValidationError({"component_product_id": "Do not select finished good for raw material line."})
        elif component_type == "FINISHED_GOOD":
            if component_product is None:
                raise serializers.ValidationError({"component_product_id": "Finished good is required."})
            if raw_material is not None:
                raise serializers.ValidationError({"raw_material_id": "Do not select raw material for finished good line."})
        elif component_type == "ASSEMBLY_PRODUCT":
            if component_product is None:
                raise serializers.ValidationError({"component_product_id": "Assembly product is required."})
            if raw_material is not None:
                raise serializers.ValidationError({"raw_material_id": "Do not select raw material for assembly product line."})
        else:
            raise serializers.ValidationError({"component_type": "Invalid component type."})

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
            "sku",
            "name",
            "product_type",
            "direct_price",
            "moulding_charges",
            "labour_charges",
            "packaging_cost",
            "use_calculated_cost",
            "confirmed_unit_cost",
            "net_amount",
            "brand",
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

    def _get_dimension_sku_code(self, tenant_id):
        dimension = Dimension.objects.filter(code=tenant_id).first()
        return str(getattr(dimension, "sku_code", "") or tenant_id or "SKU").strip().upper()

    def _generate_next_sku(self, tenant_id):
        sku_code = self._get_dimension_sku_code(tenant_id)
        sku_prefix = f"{sku_code} - "
        sku_numbers = []
        for sku in Product.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
            sku__istartswith=sku_prefix,
        ).values_list("sku", flat=True):
            match = re.fullmatch(rf"{re.escape(sku_prefix)}(\d+)", sku or "", re.IGNORECASE)
            if match:
                sku_numbers.append(int(match.group(1)))

        next_number = (max(sku_numbers) + 1) if sku_numbers else 1
        while True:
            sku = f"{sku_prefix}{next_number:04d}"
            exists = Product.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
                sku=sku,
            ).exists()
            if not exists:
                return sku
            next_number += 1

    def _validate_sku(self, sku, tenant_id):
        normalized_sku = str(sku or "").strip().upper()
        if not normalized_sku:
            return ""

        if not (
            re.fullmatch(r"[A-Z0-9_-]+ - \d{4,}", normalized_sku)
            or re.fullmatch(r"SKU-\d{4,}", normalized_sku)
        ):
            raise serializers.ValidationError(
                {"sku": "SKU must use the format AME - 0001."}
            )

        existing = Product.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
            sku=normalized_sku,
        )
        if self.instance:
            existing = existing.exclude(id=self.instance.id)
        if existing.exists():
            raise serializers.ValidationError(
                {"sku": "Product with this SKU already exists."}
            )

        return normalized_sku

    def validate(self, data):
        tenant_id = self.context["request"].user.tenant_id
        shared_tenant_ids = get_request_user_dimension_codes(self.context["request"])
        product_type = data.get("product_type")
        materials = data.get("materials", [])
        brand = data.get("brand", getattr(self.instance, "brand", None))
        category = data.get("category", getattr(self.instance, "category", None))
        unit = data.get("unit", getattr(self.instance, "unit", None))
        data["sku"] = self._validate_sku(
            data.get("sku", getattr(self.instance, "sku", "")),
            tenant_id,
        )

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
                "Finished goods cannot have component line items"
            )
        if normalized_product_type == "ASSEMBLY_PRODUCT" and not materials:
            raise serializers.ValidationError(
                "Assembly products must include at least one component line item"
            )

        if normalized_product_type == "FINISHED_GOOD" and data.get("direct_price", 0) < 0:
            raise serializers.ValidationError(
                {"direct_price": "Direct finished goods per-unit price cannot be negative."}
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
        component_keys = []
        for material in materials:
            uom = material.get("uom")
            if uom and (uom.tenant_id not in shared_tenant_ids or uom.deleted_at is not None):
                raise serializers.ValidationError(
                    {"uom_id": "Selected unit is not available for this tenant."}
                )

            if material["component_type"] == "RAW_MATERIAL":
                raw_material = material["raw_material"]
                if raw_material.tenant_id != tenant_id:
                    raise serializers.ValidationError(
                        "Raw materials must belong to the current tenant."
                    )
                component_keys.append(f"RAW_MATERIAL:{raw_material.id}")
            elif material["component_type"] == "FINISHED_GOOD":
                component_product = material["component_product"]
                if component_product.tenant_id != tenant_id:
                    raise serializers.ValidationError(
                        "Finished goods must belong to the current tenant."
                    )
                if component_product.product_type not in {"FINISHED_GOOD", "READY_MADE"}:
                    raise serializers.ValidationError(
                        "Only finished goods can be selected as finished good components."
                    )
                if self.instance and component_product.id == self.instance.id:
                    raise serializers.ValidationError(
                        "Assembly product cannot use itself as a component."
                    )
                component_keys.append(f"FINISHED_GOOD:{component_product.id}")
            elif material["component_type"] == "ASSEMBLY_PRODUCT":
                component_product = material["component_product"]
                if component_product.tenant_id != tenant_id:
                    raise serializers.ValidationError(
                        "Assembly products must belong to the current tenant."
                    )
                if component_product.product_type not in {"ASSEMBLY_PRODUCT", "MANUFACTURED"}:
                    raise serializers.ValidationError(
                        "Only assembly products can be selected as assembly components."
                    )
                if self.instance and component_product.id == self.instance.id:
                    raise serializers.ValidationError(
                        "Assembly product cannot use itself as a component."
                    )
                component_keys.append(f"ASSEMBLY_PRODUCT:{component_product.id}")

        if len(set(component_keys)) != len(component_keys):
            raise serializers.ValidationError("Duplicate assembly components are not allowed")

        if brand and (
            brand.tenant_id not in shared_tenant_ids or brand.deleted_at is not None
        ):
            raise serializers.ValidationError(
                {"brand": "Selected brand is not available for this tenant."}
            )

        if category and (
            category.tenant_id not in shared_tenant_ids or category.deleted_at is not None
        ):
            raise serializers.ValidationError(
                {"category": "Selected category is not available for this tenant."}
            )

        if unit and (
            unit.tenant_id not in shared_tenant_ids or unit.deleted_at is not None
        ):
            raise serializers.ValidationError(
                {"unit": "Selected unit is not available for this tenant."}
            )

        data["tenant_id"] = tenant_id
        data = resolve_product_coa_defaults(category, data, instance=self.instance)
        data.pop("tenant_id", None)

        validate_account_mapping(
            data.get("inventory_account"),
            tenant_id,
            "inventory_account",
            [Account.AccountGroup.ASSET],
            [Account.AccountType.INVENTORY],
            require_postable=False,
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
        if not validated_data.get("sku"):
            validated_data["sku"] = self._generate_next_sku(tenant_id)

        product = Product.objects.create(tenant_id=tenant_id, **validated_data)

        component_total = Decimal("0.00")

        for material in materials_data:
            material_obj = ProductMaterial.objects.create(
                tenant_id=tenant_id,
                product=product,  # ✅ FIX
                component_type=material["component_type"],
                raw_material=material.get("raw_material"),
                component_product=material.get("component_product"),
                uom=material.get("uom"),
                quantity=material["quantity"],
                rate=material["rate"],
                amount=material["amount"],
            )
            component_total += Decimal(str(material_obj.amount or 0))

        if product.product_type == "ASSEMBLY_PRODUCT":
            calculated = (
                component_total
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
            product.net_amount = round(component_total, 2)
        product.save()

        return product

    def update(self, instance, validated_data):
        materials_data = validated_data.pop("materials", [])
        tenant_id = self.context["request"].user.tenant_id

        ProductMaterial.objects.filter(
            product=instance, deleted_at__isnull=True
        ).update(deleted_at=now())

        instance.name = validated_data.get("name", instance.name)
        next_sku = validated_data.get("sku", instance.sku)
        instance.sku = next_sku or self._generate_next_sku(tenant_id)
        instance.product_type = validated_data.get(
            "product_type", instance.product_type
        )
        instance.direct_price = validated_data.get("direct_price", instance.direct_price)
        instance.brand = validated_data.get("brand", instance.brand)
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
        component_total = Decimal("0.00")
        instance.save()

        for material in materials_data:
            material_obj = ProductMaterial.objects.create(
                tenant_id=tenant_id,
                product=instance,
                component_type=material.get("component_type", "RAW_MATERIAL"),
                raw_material=material.get("raw_material"),
                component_product=material.get("component_product"),
                uom=material.get("uom"),
                quantity=material.get("quantity"),
                rate=material.get("rate"),
                amount=material.get("amount"),
            )
            component_total += Decimal(str(material_obj.amount or 0))

        if instance.product_type == "ASSEMBLY_PRODUCT":
            calculated = (
                component_total
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
            instance.net_amount = round(component_total, 2)
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
        request = self.context["request"]
        tenant_id = getattr(request, "tenant_id", None) or request.user.tenant_id
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
        tenant_id = getattr(self.context["request"], "tenant_id", None) or self.context[
            "request"
        ].user.tenant_id
        model = self.get_model()
        attrs = assign_default_party_account(model, attrs, self.context["request"])
        allowed_type = (
            Account.AccountType.RECEIVABLE
            if model is Customer
            else Account.AccountType.PAYABLE
        )
        validate_account_mapping(
            attrs.get("account"),
            tenant_id,
            "account",
            [Account.AccountGroup.ASSET if model is Customer else Account.AccountGroup.LIABILITY],
            allowed_types=[allowed_type],
        )
        return attrs


class SalesmanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Salesman
        fields = [
            "id",
            "code",
            "name",
            "email",
            "phone_number",
            "commission_on_sales",
            "commission_on_recovery",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "code", "created_at", "updated_at"]

    def _generate_salesman_code(self, tenant_id):
        prefix = "SM-"
        numbers = []
        for code in Salesman.objects.filter(
            tenant_id=tenant_id,
            deleted_at__isnull=True,
            code__startswith=prefix,
        ).values_list("code", flat=True):
            match = re.fullmatch(r"SM-(\d+)", code or "")
            if match:
                numbers.append(int(match.group(1)))

        next_number = (max(numbers) + 1) if numbers else 1
        while True:
            candidate = f"{prefix}{next_number:05d}"
            if not Salesman.objects.filter(
                tenant_id=tenant_id,
                deleted_at__isnull=True,
                code=candidate,
            ).exists():
                return candidate
            next_number += 1

    def _validate_commission(self, value):
        if value is None:
            return Decimal("0.00")
        if value < 0 or value > 100:
            raise serializers.ValidationError(
                "Commission must be between 0 and 100 percent."
            )
        return value

    def validate_commission_on_sales(self, value):
        return self._validate_commission(value)

    def validate_commission_on_recovery(self, value):
        return self._validate_commission(value)

    def validate_email(self, value):
        if value == "":
            return None
        return value

    def create(self, validated_data):
        tenant_id = self.context["request"].user.tenant_id
        validated_data["tenant_id"] = tenant_id
        validated_data["code"] = self._generate_salesman_code(tenant_id)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("code", None)
        return super().update(instance, validated_data)


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
        shared_tenant_ids = get_request_user_dimension_codes(self.context["request"])
        if "purchase_price" in attrs:
            attrs["purchase_price"] = attrs.get("purchase_price") or 0

        brand = attrs.get("brand") or getattr(self.instance, "brand", None)
        if brand and (
            brand.tenant_id not in shared_tenant_ids or brand.deleted_at is not None
        ):
            raise serializers.ValidationError(
                {"brand": "Selected brand is not available for this tenant."}
            )

        category = attrs.get("category") or getattr(self.instance, "category", None)
        if category and (
            category.tenant_id not in shared_tenant_ids
            or category.deleted_at is not None
        ):
            raise serializers.ValidationError(
                {"category": "Selected category is not available for this tenant."}
            )
        if category and getattr(category, "inventory_account", None):
            attrs["inventory_account"] = get_category_account_for_tenant(
                category,
                "inventory_account",
                tenant_id,
            )

        purchase_unit = attrs.get("purchase_unit") or getattr(self.instance, "purchase_unit", None)
        if purchase_unit and (
            purchase_unit.tenant_id not in shared_tenant_ids
            or purchase_unit.deleted_at is not None
        ):
            raise serializers.ValidationError(
                {"purchase_unit": "Selected unit is not available for this tenant."}
            )

        if purchase_unit:
            attrs["selling_unit"] = purchase_unit
        attrs["selling_price"] = 0
        validate_account_mapping(
            attrs.get("inventory_account"),
            tenant_id,
            "inventory_account",
            [Account.AccountGroup.ASSET],
            [Account.AccountType.INVENTORY],
            require_postable=False,
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
