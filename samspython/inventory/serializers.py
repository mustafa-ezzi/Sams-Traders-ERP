from rest_framework import serializers
from django.utils.timezone import now
from .models import Brand, Category, Product, ProductMaterial, RawMaterial, Size, Unit

class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = '__all__'
        read_only_fields = ['tenant_id']

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'
        read_only_fields = ['tenant_id']

class SizeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Size
        fields = '__all__'
        read_only_fields = ['tenant_id']

class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = '__all__'
        read_only_fields = ['tenant_id']

class RawMaterialSerializer(serializers.ModelSerializer):
    class Meta:
        model = RawMaterial
        fields = '__all__'
        read_only_fields = ['tenant_id', 'created_at', 'updated_at', 'deleted_at']

class ProductMaterialSerializer(serializers.ModelSerializer):
    raw_material_id = serializers.PrimaryKeyRelatedField(
        source='raw_material',
        queryset=RawMaterial.objects.all()
    )

    class Meta:
        model = ProductMaterial
        fields = ['id', 'raw_material_id', 'quantity', 'rate', 'amount']

    def validate(self, data):
        quantity = data.get('quantity', 0)
        rate = data.get('rate', 0)
        if quantity <= 0:
            raise serializers.ValidationError("Quantity must be greater than 0")
        if rate < 0:
            raise serializers.ValidationError("Rate cannot be negative")
        data['amount'] = round(quantity * rate, 2)
        return data


class ProductSerializer(serializers.ModelSerializer):
    materials = ProductMaterialSerializer(many=True, required=False)

    class Meta:
        model = Product
        fields = ['id', 'name', 'product_type', 'packaging_cost', 'net_amount', 'materials']

    def validate(self, data):
        product_type = data.get('product_type')
        materials = data.get('materials', [])
        if product_type == "READY_MADE" and materials:
            raise serializers.ValidationError("READY_MADE products cannot have raw material line items")
        if product_type == "MANUFACTURED" and not materials:
            raise serializers.ValidationError("MANUFACTURED products must include at least one raw material line item")
        material_ids = [m['raw_material'].id for m in materials]
        if len(set(material_ids)) != len(material_ids):
            raise serializers.ValidationError("Duplicate raw materials are not allowed")
        return data

    def create(self, validated_data):
        materials_data = validated_data.pop('materials', [])
        tenant_id = self.context['request'].user.tenant_id
        product = Product.objects.create(tenant_id=tenant_id, **validated_data)
        net_amount = validated_data.get('packaging_cost', 0)

        for material in materials_data:
            material_obj = ProductMaterial.objects.create(tenant_id=tenant_id, **material)
            product.materials.add(material_obj)
            net_amount += material_obj.amount

        product.net_amount = round(net_amount, 2)
        product.save()
        return product

    def update(self, instance, validated_data):
        materials_data = validated_data.pop('materials', [])
        tenant_id = self.context['request'].user.tenant_id

        # Soft delete old materials
        instance.materials.update(deleted_at=now())

        instance.name = validated_data.get('name', instance.name)
        instance.product_type = validated_data.get('product_type', instance.product_type)
        instance.packaging_cost = validated_data.get('packaging_cost', instance.packaging_cost)
        net_amount = instance.packaging_cost
        instance.save()

        for material in materials_data:
            material_obj = ProductMaterial.objects.create(tenant_id=tenant_id, **material)
            instance.materials.add(material_obj)
            net_amount += material_obj.amount

        instance.net_amount = round(net_amount, 2)
        instance.save()
        return instance