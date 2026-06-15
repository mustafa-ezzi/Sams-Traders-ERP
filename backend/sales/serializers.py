import re
from decimal import Decimal

from django.db import transaction
from django.utils.timezone import now
from rest_framework import serializers

from accounts.dimensions import get_user_active_dimension_codes
from common.tenancy import get_shared_tenant_ids, shared_master_exists
from accounts.models import Account
from inventory.models import Customer, Product, ProductStock, Salesman, Warehouse
from inventory.serializers import ProductDetailedSerializer
from sales.models import (
    SalesBankReceipt,
    SalesInvoice,
    SalesInvoiceLine,
    SalesOrder,
    SalesOrderLine,
    SalesReturn,
    SalesReturnLine,
)
from sales.services import (
    get_available_sale_quantity,
    get_sales_invoice_financials,
    get_sales_return_line_metrics,
    quantize_money,
)


class CustomerMiniSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    business_name = serializers.CharField()
    name = serializers.CharField(required=False, allow_blank=True)
    email = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    phone_number = serializers.CharField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)


class WarehouseMiniSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()


class SalesmanMiniSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    code = serializers.CharField()
    name = serializers.CharField()


class SalesInvoiceMiniSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    invoice_number = serializers.CharField()
    date = serializers.DateField()


class SalesOrderMiniSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    order_number = serializers.CharField()
    date = serializers.DateField()


class AccountMiniSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    code = serializers.CharField()
    name = serializers.CharField()


class SalesInvoiceLineSerializer(serializers.ModelSerializer):
    product = ProductDetailedSerializer(read_only=True)
    product_id = serializers.UUIDField(write_only=True)
    available_quantity = serializers.SerializerMethodField()

    class Meta:
        model = SalesInvoiceLine
        fields = [
            "id",
            "product",
            "product_id",
            "quantity",
            "rate",
            "amount",
            "discount",
            "total_amount",
            "cost_used",
            "cost_total",
            "profit",
            "available_quantity",
        ]
        read_only_fields = [
            "id",
            "amount",
            "total_amount",
            "cost_used",
            "cost_total",
            "profit",
            "available_quantity",
        ]

    def _get_excluded_ids(self):
        return self.context.get("excluded_sale_line_ids", [])

    def get_available_quantity(self, obj):
        available = get_available_sale_quantity(
            obj.tenant_id,
            obj.invoice.warehouse_id,
            obj.product_id,
            excluded_sale_line_ids=self._get_excluded_ids(),
        )
        return str(available)

    def validate_product_id(self, value):
        tenant_ids = get_shared_tenant_ids(self.context["request"])
        if not Product.objects.filter(
            id=value,
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
        ).exists():
            raise serializers.ValidationError("Product not found")
        return value

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than 0")
        return quantize_money(value)

    def validate_rate(self, value):
        if value < 0:
            raise serializers.ValidationError("Rate cannot be negative")
        return quantize_money(value)

    def validate_discount(self, value):
        if value < 0:
            raise serializers.ValidationError("Discount cannot be negative")
        return quantize_money(value)

    def validate(self, attrs):
        quantity = quantize_money(attrs.get("quantity", 0))
        rate = quantize_money(attrs.get("rate", 0))
        discount = quantize_money(attrs.get("discount", 0))
        amount = quantize_money(quantity * rate)

        if discount > amount:
            raise serializers.ValidationError({"discount": "Discount cannot exceed line amount."})

        attrs["amount"] = amount
        attrs["total_amount"] = quantize_money(amount - discount)
        return attrs


class SalesInvoiceSerializer(serializers.ModelSerializer):
    customer = CustomerMiniSerializer(read_only=True)
    customer_id = serializers.UUIDField(write_only=True)
    warehouse = WarehouseMiniSerializer(read_only=True)
    warehouse_id = serializers.UUIDField(write_only=True)
    salesman = SalesmanMiniSerializer(read_only=True)
    salesman_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    sales_order = SalesOrderMiniSerializer(read_only=True)
    sales_order_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    due_date = serializers.DateField(allow_null=True, required=False)
    lines = SalesInvoiceLineSerializer(many=True)
    returned_amount = serializers.SerializerMethodField()
    received_amount = serializers.SerializerMethodField()
    balance_amount = serializers.SerializerMethodField()

    class Meta:
        model = SalesInvoice
        fields = [
            "id",
            "invoice_number",
            "dc_number",
            "date",
            "due_date",
            "customer",
            "customer_id",
            "warehouse",
            "warehouse_id",
            "salesman",
            "salesman_id",
            "sales_order",
            "sales_order_id",
            "order_reference",
            "salesman_commission_rate",
            "salesman_commission_amount",
            "remarks",
            "invoice_discount",
            "gross_amount",
            "net_amount",
            "returned_amount",
            "received_amount",
            "balance_amount",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "invoice_number",
            "order_reference",
            "gross_amount",
            "net_amount",
            "salesman_commission_rate",
            "salesman_commission_amount",
            "created_at",
            "updated_at",
        ]

    def _get_financials(self, obj):
        return get_sales_invoice_financials(obj)

    def get_returned_amount(self, obj):
        return str(self._get_financials(obj)["returned_amount"])

    def get_received_amount(self, obj):
        return str(self._get_financials(obj)["received_amount"])

    def get_balance_amount(self, obj):
        return str(self._get_financials(obj)["balance_amount"])

    def get_fields(self):
        fields = super().get_fields()
        warehouse = self.context.get("warehouse")
        excluded_ids = self.context.get("excluded_sale_line_ids")

        if excluded_ids is None and isinstance(self.instance, SalesInvoice):
            excluded_ids = list(
                self.instance.lines.filter(deleted_at__isnull=True).values_list("id", flat=True)
            )

        fields["lines"].child.context.update(
            {
                **self.context,
                "warehouse": warehouse,
                "excluded_sale_line_ids": excluded_ids or [],
            }
        )
        return fields

    def validate_customer_id(self, value):
        if not shared_master_exists(Customer, self.context["request"], value):
            raise serializers.ValidationError("Customer not found")
        return value

    def validate_warehouse_id(self, value):
        if not shared_master_exists(Warehouse, self.context["request"], value):
            raise serializers.ValidationError("Warehouse not found")
        return value

    def validate_salesman_id(self, value):
        if not value:
            return None

        if not shared_master_exists(Salesman, self.context["request"], value):
            raise serializers.ValidationError("Salesman not found")
        return value

    def _sales_order_is_invoiced(self, sales_order_id, exclude_invoice_id=None):
        queryset = SalesInvoice.objects.filter(
            sales_order_id=sales_order_id,
            deleted_at__isnull=True,
        )
        if exclude_invoice_id:
            queryset = queryset.exclude(id=exclude_invoice_id)
        return queryset.exists()

    def validate_sales_order_id(self, value):
        if not value:
            return None

        request = self.context["request"]
        sales_order = SalesOrder.objects.filter(
            id=value,
            tenant_id__in=get_shared_tenant_ids(request),
            deleted_at__isnull=True,
        ).first()
        if not sales_order:
            raise serializers.ValidationError("Sales order not found")

        exclude_id = self.instance.id if self.instance else None
        if self._sales_order_is_invoiced(value, exclude_invoice_id=exclude_id):
            raise serializers.ValidationError("This sales order is already linked to an invoice.")

        return value

    def _calculate_salesman_commission(self, salesman, net_amount):
        if not salesman:
            return Decimal("0.00"), Decimal("0.00")

        rate = quantize_money(salesman.commission_on_sales)
        if rate <= 0:
            return rate, Decimal("0.00")

        amount = quantize_money((quantize_money(net_amount) * rate) / Decimal("100"))
        return rate, amount

    def validate_invoice_discount(self, value):
        if value < 0:
            raise serializers.ValidationError("Invoice discount cannot be negative")
        return quantize_money(value)

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("At least one product line is required.")
        return value

    def validate(self, attrs):
        warehouse_id = attrs.get("warehouse_id") or getattr(self.instance, "warehouse_id", None)
        tenant_id = self.context["request"].user.tenant_id
        warehouse = Warehouse.objects.filter(
            id=warehouse_id,
            tenant_id__in=get_shared_tenant_ids(self.context["request"]),
            deleted_at__isnull=True,
        ).first()
        if not warehouse:
            raise serializers.ValidationError({"warehouse_id": "Warehouse not found"})
        self.context["warehouse"] = warehouse

        line_items = attrs.get("lines") or []
        seen_products = set()
        gross_amount = Decimal("0.00")

        for line in line_items:
            product_id = str(line["product_id"])
            if product_id in seen_products:
                raise serializers.ValidationError(
                    {"lines": "Each product should appear only once per invoice."}
                )
            seen_products.add(product_id)
            gross_amount += line["total_amount"]

        gross_amount = quantize_money(gross_amount)
        invoice_discount = quantize_money(attrs.get("invoice_discount", Decimal("0.00")))

        if invoice_discount > gross_amount:
            raise serializers.ValidationError(
                {"invoice_discount": "Invoice discount cannot exceed gross amount."}
            )

        attrs["gross_amount"] = gross_amount
        net_amount = quantize_money(gross_amount - invoice_discount)
        attrs["net_amount"] = net_amount

        salesman_id_provided = "salesman_id" in attrs
        salesman_id = attrs.pop("salesman_id", None)
        if salesman_id_provided:
            salesman = (
                Salesman.objects.filter(
                    id=salesman_id,
                    tenant_id__in=get_shared_tenant_ids(self.context["request"]),
                    deleted_at__isnull=True,
                ).first()
                if salesman_id
                else None
            )
            if salesman_id and not salesman:
                raise serializers.ValidationError({"salesman_id": "Salesman not found"})
        else:
            salesman = getattr(self.instance, "salesman", None) if self.instance else None

        rate, amount = self._calculate_salesman_commission(salesman, net_amount)
        attrs["salesman"] = salesman
        attrs["salesman_commission_rate"] = rate
        attrs["salesman_commission_amount"] = amount

        sales_order_id_provided = "sales_order_id" in attrs
        sales_order_id = attrs.pop("sales_order_id", None)
        if sales_order_id_provided:
            sales_order = (
                SalesOrder.objects.filter(
                    id=sales_order_id,
                    tenant_id__in=get_shared_tenant_ids(self.context["request"]),
                    deleted_at__isnull=True,
                ).first()
                if sales_order_id
                else None
            )
            if sales_order_id and not sales_order:
                raise serializers.ValidationError({"sales_order_id": "Sales order not found"})
            attrs["sales_order"] = sales_order
            attrs["order_reference"] = sales_order.order_number if sales_order else ""
        elif self.instance:
            attrs["sales_order"] = getattr(self.instance, "sales_order", None)
            attrs["order_reference"] = self.instance.order_reference or ""

        sales_order = attrs.get("sales_order")
        if sales_order:
            customer_id = attrs.get("customer_id") or getattr(self.instance, "customer_id", None)
            warehouse_id = attrs.get("warehouse_id") or getattr(self.instance, "warehouse_id", None)
            if str(sales_order.customer_id) != str(customer_id):
                raise serializers.ValidationError(
                    {"sales_order_id": "Customer must match the selected sales order."}
                )
            if str(sales_order.warehouse_id) != str(warehouse_id):
                raise serializers.ValidationError(
                    {"sales_order_id": "Warehouse must match the selected sales order."}
                )

        return attrs

    def _generate_invoice_number(self, request):
        tenant_ids = get_shared_tenant_ids(request)
        prefix = "SI - "
        numbers = []
        for invoice_number in SalesInvoice.objects.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
            invoice_number__startswith=prefix,
        ).values_list("invoice_number", flat=True):
            match = re.fullmatch(r"SI - (\d+)", invoice_number or "")
            if match:
                numbers.append(int(match.group(1)))

        next_number = (max(numbers) + 1) if numbers else 1
        while True:
            candidate = f"{prefix}{next_number:04d}"
            if not SalesInvoice.objects.filter(
                tenant_id__in=tenant_ids,
                deleted_at__isnull=True,
                invoice_number=candidate,
            ).exists():
                return candidate
            next_number += 1

    def _create_lines(self, invoice, lines_data, tenant_id):
        for line_data in lines_data:
            SalesInvoiceLine.objects.create(
                tenant_id=tenant_id,
                invoice=invoice,
                product_id=line_data["product_id"],
                quantity=line_data["quantity"],
                rate=line_data["rate"],
                amount=line_data["amount"],
                discount=line_data["discount"],
                total_amount=line_data["total_amount"],
            )

    @transaction.atomic
    def create(self, validated_data):
        request = self.context["request"]
        tenant_id = getattr(request, "tenant_id", None) or request.user.tenant_id
        lines_data = validated_data.pop("lines", [])
        customer_id = validated_data.pop("customer_id")
        warehouse_id = validated_data.pop("warehouse_id")
        salesman = validated_data.pop("salesman", None)
        sales_order = validated_data.pop("sales_order", None)

        invoice = SalesInvoice.objects.create(
            tenant_id=tenant_id,
            customer_id=customer_id,
            warehouse_id=warehouse_id,
            salesman=salesman,
            sales_order=sales_order,
            invoice_number=self._generate_invoice_number(request),
            **validated_data,
        )
        self._create_lines(invoice, lines_data, tenant_id)
        return invoice

    @transaction.atomic
    def update(self, instance, validated_data):
        lines_data = validated_data.pop("lines", [])
        instance.customer_id = validated_data.pop("customer_id", instance.customer_id)
        instance.warehouse_id = validated_data.pop("warehouse_id", instance.warehouse_id)
        if "salesman" in validated_data:
            instance.salesman = validated_data.pop("salesman")
        if "sales_order" in validated_data:
            instance.sales_order = validated_data.pop("sales_order")
        if "order_reference" in validated_data:
            instance.order_reference = validated_data.pop("order_reference")
        instance.date = validated_data.get("date", instance.date)
        instance.due_date = validated_data.get("due_date", instance.due_date)
        instance.dc_number = validated_data.get("dc_number", instance.dc_number)
        instance.remarks = validated_data.get("remarks", instance.remarks)
        instance.invoice_discount = validated_data.get("invoice_discount", instance.invoice_discount)
        instance.gross_amount = validated_data.get("gross_amount", instance.gross_amount)
        instance.net_amount = validated_data.get("net_amount", instance.net_amount)
        instance.salesman_commission_rate = validated_data.get(
            "salesman_commission_rate",
            instance.salesman_commission_rate,
        )
        instance.salesman_commission_amount = validated_data.get(
            "salesman_commission_amount",
            instance.salesman_commission_amount,
        )
        instance.save()

        instance.lines.filter(deleted_at__isnull=True).update(deleted_at=now())
        self._create_lines(instance, lines_data, instance.tenant_id)
        return instance


class SalesOrderLineSerializer(serializers.ModelSerializer):
    product = ProductDetailedSerializer(read_only=True)
    product_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = SalesOrderLine
        fields = [
            "id",
            "product",
            "product_id",
            "quantity",
            "rate",
            "amount",
            "discount",
            "total_amount",
        ]
        read_only_fields = ["id", "amount", "total_amount"]

    def validate_product_id(self, value):
        tenant_ids = get_shared_tenant_ids(self.context["request"])
        if not Product.objects.filter(
            id=value,
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
        ).exists():
            raise serializers.ValidationError("Product not found")
        return value

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than 0")
        return quantize_money(value)

    def validate_rate(self, value):
        if value < 0:
            raise serializers.ValidationError("Rate cannot be negative")
        return quantize_money(value)

    def validate_discount(self, value):
        if value < 0:
            raise serializers.ValidationError("Discount cannot be negative")
        return quantize_money(value)

    def validate(self, attrs):
        quantity = quantize_money(attrs.get("quantity", 0))
        rate = quantize_money(attrs.get("rate", 0))
        discount = quantize_money(attrs.get("discount", 0))
        amount = quantize_money(quantity * rate)

        if discount > amount:
            raise serializers.ValidationError({"discount": "Discount cannot exceed line amount."})

        attrs["amount"] = amount
        attrs["total_amount"] = quantize_money(amount - discount)
        return attrs


class SalesOrderSerializer(serializers.ModelSerializer):
    customer = CustomerMiniSerializer(read_only=True)
    customer_id = serializers.UUIDField(write_only=True)
    warehouse = WarehouseMiniSerializer(read_only=True)
    warehouse_id = serializers.UUIDField(write_only=True)
    salesman = SalesmanMiniSerializer(read_only=True)
    salesman_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    due_date = serializers.DateField(allow_null=True, required=False)
    lines = SalesOrderLineSerializer(many=True)
    is_invoiced = serializers.SerializerMethodField()

    class Meta:
        model = SalesOrder
        fields = [
            "id",
            "order_number",
            "dc_number",
            "date",
            "due_date",
            "customer",
            "customer_id",
            "warehouse",
            "warehouse_id",
            "salesman",
            "salesman_id",
            "salesman_commission_rate",
            "salesman_commission_amount",
            "remarks",
            "order_discount",
            "gross_amount",
            "net_amount",
            "is_invoiced",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "order_number",
            "gross_amount",
            "net_amount",
            "salesman_commission_rate",
            "salesman_commission_amount",
            "is_invoiced",
            "created_at",
            "updated_at",
        ]

    def get_is_invoiced(self, obj):
        if hasattr(obj, "_is_invoiced"):
            return bool(obj._is_invoiced)
        return obj.invoices.filter(deleted_at__isnull=True).exists()

    def validate_customer_id(self, value):
        if not shared_master_exists(Customer, self.context["request"], value):
            raise serializers.ValidationError("Customer not found")
        return value

    def validate_warehouse_id(self, value):
        if not shared_master_exists(Warehouse, self.context["request"], value):
            raise serializers.ValidationError("Warehouse not found")
        return value

    def validate_salesman_id(self, value):
        if not value:
            return None

        if not shared_master_exists(Salesman, self.context["request"], value):
            raise serializers.ValidationError("Salesman not found")
        return value

    def validate_order_discount(self, value):
        if value < 0:
            raise serializers.ValidationError("Order discount cannot be negative")
        return quantize_money(value)

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("At least one product line is required.")
        return value

    def validate(self, attrs):
        line_items = attrs.get("lines") or []
        seen_products = set()
        gross_amount = Decimal("0.00")

        for line in line_items:
            product_id = str(line["product_id"])
            if product_id in seen_products:
                raise serializers.ValidationError(
                    {"lines": "Each product should appear only once per order."}
                )
            seen_products.add(product_id)
            gross_amount += line["total_amount"]

        gross_amount = quantize_money(gross_amount)
        order_discount = quantize_money(attrs.get("order_discount", Decimal("0.00")))

        if order_discount > gross_amount:
            raise serializers.ValidationError(
                {"order_discount": "Order discount cannot exceed gross amount."}
            )

        attrs["gross_amount"] = gross_amount
        net_amount = quantize_money(gross_amount - order_discount)
        attrs["net_amount"] = net_amount

        salesman_id_provided = "salesman_id" in attrs
        salesman_id = attrs.pop("salesman_id", None)
        if salesman_id_provided:
            salesman = (
                Salesman.objects.filter(
                    id=salesman_id,
                    tenant_id__in=get_shared_tenant_ids(self.context["request"]),
                    deleted_at__isnull=True,
                ).first()
                if salesman_id
                else None
            )
            if salesman_id and not salesman:
                raise serializers.ValidationError({"salesman_id": "Salesman not found"})
        else:
            salesman = getattr(self.instance, "salesman", None) if self.instance else None

        rate, amount = self._calculate_salesman_commission(salesman, net_amount)
        attrs["salesman"] = salesman
        attrs["salesman_commission_rate"] = rate
        attrs["salesman_commission_amount"] = amount
        return attrs

    def _calculate_salesman_commission(self, salesman, net_amount):
        if not salesman:
            return Decimal("0.00"), Decimal("0.00")

        rate = quantize_money(salesman.commission_on_sales)
        if rate <= 0:
            return rate, Decimal("0.00")

        amount = quantize_money((quantize_money(net_amount) * rate) / Decimal("100"))
        return rate, amount

    def _generate_order_number(self, request):
        tenant_ids = get_shared_tenant_ids(request)
        prefix = "SO - "
        numbers = []
        for order_number in SalesOrder.objects.filter(
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
            order_number__startswith=prefix,
        ).values_list("order_number", flat=True):
            match = re.fullmatch(r"SO - (\d+)", order_number or "")
            if match:
                numbers.append(int(match.group(1)))

        next_number = (max(numbers) + 1) if numbers else 1
        while True:
            candidate = f"{prefix}{next_number:04d}"
            if not SalesOrder.objects.filter(
                tenant_id__in=tenant_ids,
                deleted_at__isnull=True,
                order_number=candidate,
            ).exists():
                return candidate
            next_number += 1

    def _create_lines(self, order, lines_data, tenant_id):
        for line_data in lines_data:
            SalesOrderLine.objects.create(
                tenant_id=tenant_id,
                sales_order=order,
                product_id=line_data["product_id"],
                quantity=line_data["quantity"],
                rate=line_data["rate"],
                amount=line_data["amount"],
                discount=line_data["discount"],
                total_amount=line_data["total_amount"],
            )

    @transaction.atomic
    def create(self, validated_data):
        request = self.context["request"]
        tenant_id = getattr(request, "tenant_id", None) or request.user.tenant_id
        lines_data = validated_data.pop("lines", [])
        customer_id = validated_data.pop("customer_id")
        warehouse_id = validated_data.pop("warehouse_id")
        salesman = validated_data.pop("salesman", None)

        order = SalesOrder.objects.create(
            tenant_id=tenant_id,
            customer_id=customer_id,
            warehouse_id=warehouse_id,
            salesman=salesman,
            order_number=self._generate_order_number(request),
            **validated_data,
        )
        self._create_lines(order, lines_data, tenant_id)
        return order

    @transaction.atomic
    def update(self, instance, validated_data):
        if instance.invoices.filter(deleted_at__isnull=True).exists():
            raise serializers.ValidationError(
                "This sales order is already linked to an invoice and cannot be edited."
            )

        lines_data = validated_data.pop("lines", [])
        instance.customer_id = validated_data.pop("customer_id", instance.customer_id)
        instance.warehouse_id = validated_data.pop("warehouse_id", instance.warehouse_id)
        if "salesman" in validated_data:
            instance.salesman = validated_data.pop("salesman")
        instance.date = validated_data.get("date", instance.date)
        instance.due_date = validated_data.get("due_date", instance.due_date)
        instance.dc_number = validated_data.get("dc_number", instance.dc_number)
        instance.remarks = validated_data.get("remarks", instance.remarks)
        instance.order_discount = validated_data.get("order_discount", instance.order_discount)
        instance.gross_amount = validated_data.get("gross_amount", instance.gross_amount)
        instance.net_amount = validated_data.get("net_amount", instance.net_amount)
        instance.salesman_commission_rate = validated_data.get(
            "salesman_commission_rate",
            instance.salesman_commission_rate,
        )
        instance.salesman_commission_amount = validated_data.get(
            "salesman_commission_amount",
            instance.salesman_commission_amount,
        )
        instance.save()

        instance.lines.filter(deleted_at__isnull=True).update(deleted_at=now())
        self._create_lines(instance, lines_data, instance.tenant_id)
        return instance


class SalesReturnInvoiceLinePreviewSerializer(serializers.Serializer):
    sales_invoice_line_id = serializers.UUIDField()
    product_id = serializers.UUIDField()
    product_name = serializers.CharField()
    sold_quantity = serializers.DecimalField(max_digits=12, decimal_places=2)
    return_quantity = serializers.DecimalField(max_digits=12, decimal_places=2)
    unit = serializers.CharField()
    rate = serializers.DecimalField(max_digits=12, decimal_places=2)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    max_return_quantity = serializers.DecimalField(max_digits=12, decimal_places=2)


class SalesReturnLineSerializer(serializers.ModelSerializer):
    product = ProductDetailedSerializer(read_only=True)
    sales_invoice_line_id = serializers.UUIDField(write_only=True)
    sold_quantity = serializers.SerializerMethodField()
    max_return_quantity = serializers.SerializerMethodField()

    class Meta:
        model = SalesReturnLine
        fields = [
            "id",
            "product",
            "sales_invoice_line_id",
            "quantity",
            "rate",
            "amount",
            "sold_quantity",
            "max_return_quantity",
        ]
        read_only_fields = [
            "id",
            "rate",
            "amount",
            "sold_quantity",
            "max_return_quantity",
        ]

    def _get_excluded_ids(self):
        return self.context.get("excluded_return_line_ids", [])

    def get_sold_quantity(self, obj):
        metrics = get_sales_return_line_metrics(
            obj.sales_invoice_line,
            excluded_return_line_ids=self._get_excluded_ids(),
        )
        return str(metrics["sold_quantity"])

    def get_max_return_quantity(self, obj):
        metrics = get_sales_return_line_metrics(
            obj.sales_invoice_line,
            excluded_return_line_ids=self._get_excluded_ids(),
        )
        return str(metrics["available_return_quantity"])

    def validate_sales_invoice_line_id(self, value):
        tenant_id = self.context["request"].user.tenant_id
        invoice = self.context.get("sales_invoice")

        try:
            invoice_line = SalesInvoiceLine.objects.select_related("invoice", "product").get(
                id=value,
                tenant_id=tenant_id,
                deleted_at__isnull=True,
                invoice__deleted_at__isnull=True,
            )
        except SalesInvoiceLine.DoesNotExist:
            raise serializers.ValidationError("Sales invoice line not found for this tenant.")

        if invoice and invoice_line.invoice_id != invoice.id:
            raise serializers.ValidationError("Selected invoice line does not belong to the chosen sales invoice.")

        return value

    def validate_quantity(self, value):
        if value < 0:
            raise serializers.ValidationError("Return quantity cannot be negative")
        return quantize_money(value)

    def validate(self, attrs):
        tenant_id = self.context["request"].user.tenant_id
        invoice_line = SalesInvoiceLine.objects.select_related("invoice", "product").get(
            id=attrs["sales_invoice_line_id"],
            tenant_id=tenant_id,
            deleted_at__isnull=True,
            invoice__deleted_at__isnull=True,
        )
        metrics = get_sales_return_line_metrics(
            invoice_line,
            excluded_return_line_ids=self._get_excluded_ids(),
        )
        quantity = quantize_money(attrs.get("quantity", 0))

        if quantity <= 0:
            raise serializers.ValidationError({"quantity": "Return quantity must be greater than 0."})

        if quantity > metrics["available_return_quantity"]:
            raise serializers.ValidationError(
                {
                    "quantity": (
                        "Return quantity cannot exceed the available return quantity "
                        f"({metrics['available_return_quantity']})."
                    )
                }
            )

        attrs["product"] = invoice_line.product
        attrs["product_id"] = invoice_line.product_id
        attrs["sales_invoice_line"] = invoice_line
        attrs["rate"] = quantize_money(invoice_line.rate)
        attrs["amount"] = quantize_money(invoice_line.rate * quantity)
        return attrs


class SalesReturnSerializer(serializers.ModelSerializer):
    customer = CustomerMiniSerializer(read_only=True)
    customer_id = serializers.UUIDField(write_only=True)
    sales_invoice = SalesInvoiceMiniSerializer(read_only=True)
    sales_invoice_id = serializers.UUIDField(write_only=True)
    lines = SalesReturnLineSerializer(many=True)

    class Meta:
        model = SalesReturn
        fields = [
            "id",
            "return_number",
            "date",
            "customer",
            "customer_id",
            "sales_invoice",
            "sales_invoice_id",
            "remarks",
            "gross_amount",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "return_number",
            "gross_amount",
            "created_at",
            "updated_at",
        ]

    def get_fields(self):
        fields = super().get_fields()

        invoice = self.context.get("sales_invoice")
        excluded_ids = self.context.get("excluded_return_line_ids")

        if excluded_ids is None and isinstance(self.instance, SalesReturn):
            excluded_ids = list(
                self.instance.lines.filter(deleted_at__isnull=True).values_list("id", flat=True)
            )

        fields["lines"].child.context.update(
            {
                **self.context,
                "sales_invoice": invoice,
                "excluded_return_line_ids": excluded_ids or [],
            }
        )
        return fields

    def validate_customer_id(self, value):
        if not shared_master_exists(Customer, self.context["request"], value):
            raise serializers.ValidationError("Customer not found")
        return value

    def validate_sales_invoice_id(self, value):
        if not shared_master_exists(SalesInvoice, self.context["request"], value):
            raise serializers.ValidationError("Sales invoice not found")
        return value

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("At least one return line is required.")
        return value

    def validate(self, attrs):
        request = self.context["request"]
        customer_id = attrs.get("customer_id") or getattr(self.instance, "customer_id", None)
        sales_invoice_id = attrs.get("sales_invoice_id") or getattr(self.instance, "sales_invoice_id", None)

        sales_invoice = SalesInvoice.objects.select_related("customer", "warehouse").filter(
            id=sales_invoice_id,
            tenant_id__in=get_shared_tenant_ids(request),
            deleted_at__isnull=True,
        ).first()
        if not sales_invoice:
            raise serializers.ValidationError({"sales_invoice_id": "Sales invoice not found."})

        if sales_invoice.customer_id != customer_id:
            raise serializers.ValidationError(
                {"sales_invoice_id": "Selected sales invoice does not belong to the chosen customer."}
            )

        self.context["sales_invoice"] = sales_invoice
        lines = attrs.get("lines") or []
        seen_invoice_lines = set()
        gross_amount = Decimal("0.00")

        for line in lines:
            invoice_line_id = str(line["sales_invoice_line"].id)
            if line["sales_invoice_line"].invoice_id != sales_invoice.id:
                raise serializers.ValidationError(
                    {"lines": "Each return line must belong to the selected sales invoice."}
                )
            if invoice_line_id in seen_invoice_lines:
                raise serializers.ValidationError(
                    {"lines": "Each invoice line should appear only once per sales return."}
                )
            seen_invoice_lines.add(invoice_line_id)
            gross_amount += line["amount"]

        attrs["gross_amount"] = quantize_money(gross_amount)
        return attrs

    def _generate_return_number(self, tenant_id):
        count = SalesReturn.objects.filter(tenant_id=tenant_id).count() + 1
        return f"SRET-{count:05d}"

    def _create_lines(self, sales_return, lines_data, tenant_id):
        for line_data in lines_data:
            SalesReturnLine.objects.create(
                tenant_id=tenant_id,
                sales_return=sales_return,
                sales_invoice_line=line_data["sales_invoice_line"],
                product_id=line_data["product_id"],
                quantity=line_data["quantity"],
                rate=line_data["rate"],
                amount=line_data["amount"],
            )

    @transaction.atomic
    def create(self, validated_data):
        tenant_id = self.context["request"].user.tenant_id
        lines_data = validated_data.pop("lines", [])
        customer_id = validated_data.pop("customer_id")
        sales_invoice_id = validated_data.pop("sales_invoice_id")

        sales_return = SalesReturn.objects.create(
            tenant_id=tenant_id,
            customer_id=customer_id,
            sales_invoice_id=sales_invoice_id,
            return_number=self._generate_return_number(tenant_id),
            **validated_data,
        )
        self._create_lines(sales_return, lines_data, tenant_id)
        return sales_return

    @transaction.atomic
    def update(self, instance, validated_data):
        lines_data = validated_data.pop("lines", [])
        instance.customer_id = validated_data.pop("customer_id", instance.customer_id)
        instance.sales_invoice_id = validated_data.pop("sales_invoice_id", instance.sales_invoice_id)
        instance.date = validated_data.get("date", instance.date)
        instance.remarks = validated_data.get("remarks", instance.remarks)
        instance.gross_amount = validated_data.get("gross_amount", instance.gross_amount)
        instance.save()

        instance.lines.filter(deleted_at__isnull=True).update(deleted_at=now())
        self._create_lines(instance, lines_data, instance.tenant_id)
        return instance


class SalesBankReceiptSerializer(serializers.ModelSerializer):
    customer = CustomerMiniSerializer(read_only=True)
    customer_id = serializers.UUIDField(write_only=True)
    sales_invoice = SalesInvoiceMiniSerializer(read_only=True)
    sales_invoice_id = serializers.UUIDField(write_only=True)
    bank_account = AccountMiniSerializer(read_only=True)
    bank_account_id = serializers.UUIDField(write_only=True)
    invoice_net_amount = serializers.SerializerMethodField()
    invoice_returned_amount = serializers.SerializerMethodField()
    invoice_received_amount = serializers.SerializerMethodField()
    invoice_balance_amount = serializers.SerializerMethodField()

    class Meta:
        model = SalesBankReceipt
        fields = [
            "id",
            "receipt_number",
            "date",
            "customer",
            "customer_id",
            "sales_invoice",
            "sales_invoice_id",
            "bank_account",
            "bank_account_id",
            "amount",
            "remarks",
            "invoice_net_amount",
            "invoice_returned_amount",
            "invoice_received_amount",
            "invoice_balance_amount",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "receipt_number",
            "invoice_net_amount",
            "invoice_returned_amount",
            "invoice_received_amount",
            "invoice_balance_amount",
            "created_at",
            "updated_at",
        ]

    def _get_financials(self, obj):
        excluded_ids = []
        if obj and obj.pk:
            excluded_ids = [obj.id]
        return get_sales_invoice_financials(obj.sales_invoice, excluded_receipt_ids=excluded_ids)

    def get_invoice_net_amount(self, obj):
        return str(self._get_financials(obj)["net_amount"])

    def get_invoice_returned_amount(self, obj):
        return str(self._get_financials(obj)["returned_amount"])

    def get_invoice_received_amount(self, obj):
        financials = self._get_financials(obj)
        return str(quantize_money(financials["received_amount"] + obj.amount))

    def get_invoice_balance_amount(self, obj):
        financials = self._get_financials(obj)
        balance_after_receipt = max(
            quantize_money(financials["balance_amount"] - obj.amount),
            Decimal("0.00"),
        )
        return str(balance_after_receipt)

    def validate_customer_id(self, value):
        if not shared_master_exists(Customer, self.context["request"], value):
            raise serializers.ValidationError("Customer not found")
        return value

    def validate_sales_invoice_id(self, value):
        if not shared_master_exists(SalesInvoice, self.context["request"], value):
            raise serializers.ValidationError("Sales invoice not found")
        return value

    def validate_bank_account_id(self, value):
        # COA is shared across every dimension the user owns, so a bank
        # account belonging to any of them is a valid choice for a receipt.
        request = self.context["request"]
        tenant_ids = get_user_active_dimension_codes(request.user)
        current = getattr(request, "tenant_id", "") or request.user.tenant_id
        if current and current not in tenant_ids:
            tenant_ids.append(current)
        try:
            account = Account.objects.get(
                id=value,
                tenant_id__in=tenant_ids,
                deleted_at__isnull=True,
            )
        except Account.DoesNotExist:
            raise serializers.ValidationError("Bank account not found")

        if not account.is_active:
            raise serializers.ValidationError("Selected bank account is inactive")
        if not account.is_postable:
            raise serializers.ValidationError("Selected bank account must be postable")
        if account.account_group != Account.AccountGroup.ASSET:
            raise serializers.ValidationError("Selected bank account must belong to asset group")
        if account.account_type != Account.AccountType.BANK:
            raise serializers.ValidationError("Selected account must have account type BANK")

        return value

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Receipt amount must be greater than 0")
        return quantize_money(value)

    def validate(self, attrs):
        request = self.context["request"]
        customer_id = attrs.get("customer_id") or getattr(self.instance, "customer_id", None)
        sales_invoice_id = attrs.get("sales_invoice_id") or getattr(self.instance, "sales_invoice_id", None)

        sales_invoice = SalesInvoice.objects.select_related("customer").filter(
            id=sales_invoice_id,
            tenant_id__in=get_shared_tenant_ids(request),
            deleted_at__isnull=True,
        ).first()
        if not sales_invoice:
            raise serializers.ValidationError({"sales_invoice_id": "Sales invoice not found."})

        if sales_invoice.customer_id != customer_id:
            raise serializers.ValidationError(
                {"sales_invoice_id": "Selected sales invoice does not belong to the chosen customer."}
            )

        amount = attrs.get("amount", getattr(self.instance, "amount", Decimal("0.00")))
        excluded_ids = [self.instance.id] if self.instance else []
        financials = get_sales_invoice_financials(
            sales_invoice,
            excluded_receipt_ids=excluded_ids,
        )
        if amount > financials["balance_amount"]:
            raise serializers.ValidationError(
                {
                    "amount": (
                        "Receipt amount cannot exceed invoice balance "
                        f"({financials['balance_amount']})."
                    )
                }
            )

        self.context["sales_invoice"] = sales_invoice
        self.context["invoice_financials"] = financials
        return attrs

    def _generate_receipt_number(self, tenant_id):
        count = SalesBankReceipt.objects.filter(tenant_id=tenant_id).count() + 1
        return f"SBR-{count:05d}"

    @transaction.atomic
    def create(self, validated_data):
        tenant_id = self.context["request"].user.tenant_id
        customer_id = validated_data.pop("customer_id")
        sales_invoice_id = validated_data.pop("sales_invoice_id")
        bank_account_id = validated_data.pop("bank_account_id")

        return SalesBankReceipt.objects.create(
            tenant_id=tenant_id,
            customer_id=customer_id,
            sales_invoice_id=sales_invoice_id,
            bank_account_id=bank_account_id,
            receipt_number=self._generate_receipt_number(tenant_id),
            **validated_data,
        )

    @transaction.atomic
    def update(self, instance, validated_data):
        instance.customer_id = validated_data.pop("customer_id", instance.customer_id)
        instance.sales_invoice_id = validated_data.pop("sales_invoice_id", instance.sales_invoice_id)
        instance.bank_account_id = validated_data.pop("bank_account_id", instance.bank_account_id)
        instance.date = validated_data.get("date", instance.date)
        instance.amount = validated_data.get("amount", instance.amount)
        instance.remarks = validated_data.get("remarks", instance.remarks)
        instance.save()
        return instance
