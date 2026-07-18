from decimal import Decimal

from django.db import models, transaction
from django.utils.timezone import now
from rest_framework import serializers

from accounts.dimensions import get_user_active_dimension_codes
from common.tenancy import get_shared_tenant_ids, shared_master_exists
from accounts.models import Account
from inventory.models import PartyOpeningBalance, Product, ProductStock, RawMaterial, Stock, Supplier, Warehouse
from inventory.serializers import ProductDetailedSerializer, RawMaterialDetailedSerializer
from purchase.models import (
    PurchaseBankPayment,
    PurchaseBankPaymentLine,
    PurchaseInvoice,
    PurchaseInvoiceLine,
    PurchaseReturn,
    PurchaseReturnLine,
)
from purchase.services import (
    get_purchase_invoice_financials,
    get_purchase_return_line_metrics,
    get_supplier_opening_balance_financials,
    quantize_money,
)


class SupplierMiniSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    business_name = serializers.CharField()


class WarehouseMiniSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()


class PurchaseInvoiceMiniSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    invoice_number = serializers.CharField()
    date = serializers.DateField()
    due_date = serializers.DateField(allow_null=True, required=False)


class AccountMiniSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    code = serializers.CharField()
    name = serializers.CharField()


class PurchaseInvoiceLineSerializer(serializers.ModelSerializer):
    product = ProductDetailedSerializer(read_only=True)
    product_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    raw_material = RawMaterialDetailedSerializer(read_only=True)
    raw_material_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    uom_name = serializers.SerializerMethodField()
    available_quantity = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseInvoiceLine
        fields = [
            "id",
            "item_type",
            "product",
            "product_id",
            "raw_material",
            "raw_material_id",
            "uom_name",
            "quantity",
            "rate",
            "amount",
            "discount",
            "total_amount",
            "available_quantity",
        ]
        read_only_fields = ["id", "amount", "total_amount", "available_quantity"]

    def get_available_quantity(self, obj):
        if obj.item_type == "RAW_MATERIAL":
            stock = Stock.objects.filter(
                tenant_id=obj.tenant_id,
                warehouse_id=obj.invoice.warehouse_id,
                raw_material_id=obj.raw_material_id,
                deleted_at__isnull=True,
            ).first()
        else:
            stock = ProductStock.objects.filter(
                tenant_id=obj.tenant_id,
                warehouse_id=obj.invoice.warehouse_id,
                product_id=obj.product_id,
                deleted_at__isnull=True,
            ).first()
        return str(stock.quantity if stock else Decimal("0.00"))

    def get_uom_name(self, obj):
        if obj.uom_id:
            return obj.uom.name
        if obj.raw_material_id:
            return obj.raw_material.purchase_unit.name
        if obj.product_id and obj.product.unit_id:
            return obj.product.unit.name
        return ""

    def validate_product_id(self, value):
        if value is None:
            return value
        tenant_ids = get_shared_tenant_ids(self.context["request"])
        product = Product.objects.filter(
            id=value,
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
        ).first()
        if not product:
            raise serializers.ValidationError("Product not found")
        if product.product_type not in {"FINISHED_GOOD", "READY_MADE"}:
            raise serializers.ValidationError(
                "Only direct finished goods can be purchased from this product field."
            )
        return value

    def validate_raw_material_id(self, value):
        if value is None:
            return value
        tenant_id = self.context["request"].user.tenant_id
        if not RawMaterial.objects.filter(
            id=value,
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ).exists():
            raise serializers.ValidationError("Raw material not found for this tenant")
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
        item_type = attrs.get("item_type", "FINISHED_GOOD")
        product_id = attrs.get("product_id")
        raw_material_id = attrs.get("raw_material_id")

        if item_type == "RAW_MATERIAL":
            if not raw_material_id:
                raise serializers.ValidationError({"raw_material_id": "Raw material is required."})
            if product_id:
                raise serializers.ValidationError({"product_id": "Do not select product for raw material purchase."})
        elif item_type == "FINISHED_GOOD":
            if not product_id:
                raise serializers.ValidationError({"product_id": "Finished good product is required."})
            if raw_material_id:
                raise serializers.ValidationError({"raw_material_id": "Do not select raw material for finished good purchase."})
        else:
            raise serializers.ValidationError({"item_type": "Invalid purchase line type."})

        quantity = quantize_money(attrs.get("quantity", 0))
        rate = quantize_money(attrs.get("rate", 0))
        discount = quantize_money(attrs.get("discount", 0))
        amount = quantize_money(quantity * rate)

        if discount > amount:
            raise serializers.ValidationError({"discount": "Discount cannot exceed line amount."})

        attrs["amount"] = amount
        attrs["total_amount"] = quantize_money(amount - discount)
        if item_type == "RAW_MATERIAL":
            attrs["uom_id"] = RawMaterial.objects.only("purchase_unit_id").get(id=raw_material_id).purchase_unit_id
        elif item_type == "FINISHED_GOOD":
            attrs["uom_id"] = Product.objects.only("unit_id").get(id=product_id).unit_id
        return attrs


class PurchaseInvoiceSerializer(serializers.ModelSerializer):
    supplier = SupplierMiniSerializer(read_only=True)
    supplier_id = serializers.UUIDField(write_only=True)
    warehouse = WarehouseMiniSerializer(read_only=True)
    warehouse_id = serializers.UUIDField(write_only=True)
    lines = PurchaseInvoiceLineSerializer(many=True)
    returned_amount = serializers.SerializerMethodField()
    paid_amount = serializers.SerializerMethodField()
    balance_amount = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseInvoice
        fields = [
            "id",
            "invoice_number",
            "date",
            "due_date",
            "supplier",
            "supplier_id",
            "warehouse",
            "warehouse_id",
            "remarks",
            "invoice_discount",
            "gross_amount",
            "net_amount",
            "returned_amount",
            "paid_amount",
            "balance_amount",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "invoice_number",
            "gross_amount",
            "net_amount",
            "created_at",
            "updated_at",
        ]

    def _get_financials(self, obj):
        return get_purchase_invoice_financials(obj)

    def get_returned_amount(self, obj):
        return str(self._get_financials(obj)["returned_amount"])

    def get_paid_amount(self, obj):
        return str(self._get_financials(obj)["paid_amount"])

    def get_balance_amount(self, obj):
        return str(self._get_financials(obj)["balance_amount"])

    def validate_supplier_id(self, value):
        if not shared_master_exists(Supplier, self.context["request"], value):
            raise serializers.ValidationError("Supplier not found")
        return value

    def validate_warehouse_id(self, value):
        if not shared_master_exists(Warehouse, self.context["request"], value):
            raise serializers.ValidationError("Warehouse not found")
        return value

    def validate_invoice_discount(self, value):
        if value < 0:
            raise serializers.ValidationError("Invoice discount cannot be negative")
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
            line_key = f"{line['item_type']}:{line.get('product_id') or line.get('raw_material_id')}"
            if line_key in seen_products:
                raise serializers.ValidationError(
                    {"lines": "Each purchase item should appear only once per invoice."}
                )
            seen_products.add(line_key)
            gross_amount += line["total_amount"]

        gross_amount = quantize_money(gross_amount)
        invoice_discount = quantize_money(attrs.get("invoice_discount", Decimal("0.00")))

        if invoice_discount > gross_amount:
            raise serializers.ValidationError(
                {"invoice_discount": "Invoice discount cannot exceed gross amount."}
            )

        attrs["gross_amount"] = gross_amount
        attrs["net_amount"] = quantize_money(gross_amount - invoice_discount)
        return attrs

    def _generate_invoice_number(self, tenant_id):
        count = (
            PurchaseInvoice.objects.filter(
                tenant_id=tenant_id,
            ).count()
            + 1
        )
        return f"PINV-{count:05d}"

    def _create_lines(self, invoice, lines_data, tenant_id):
        product_ids = [
            line_data.get("product_id")
            for line_data in lines_data
            if line_data.get("product_id")
        ]
        products_by_id = {
            product.id: product
            for product in Product.objects.filter(
                id__in=product_ids,
                deleted_at__isnull=True,
            )
        }
        for line_data in lines_data:
            product = products_by_id.get(line_data.get("product_id"))
            PurchaseInvoiceLine.objects.create(
                tenant_id=product.tenant_id if product else tenant_id,
                invoice=invoice,
                item_type=line_data["item_type"],
                product_id=line_data.get("product_id"),
                raw_material_id=line_data.get("raw_material_id"),
                uom_id=line_data.get("uom_id"),
                quantity=line_data["quantity"],
                rate=line_data["rate"],
                amount=line_data["amount"],
                discount=line_data["discount"],
                total_amount=line_data["total_amount"],
            )

    @transaction.atomic
    def create(self, validated_data):
        tenant_id = self.context["request"].user.tenant_id
        lines_data = validated_data.pop("lines", [])
        supplier_id = validated_data.pop("supplier_id")
        warehouse_id = validated_data.pop("warehouse_id")

        invoice = PurchaseInvoice.objects.create(
            tenant_id=tenant_id,
            supplier_id=supplier_id,
            warehouse_id=warehouse_id,
            invoice_number=self._generate_invoice_number(tenant_id),
            **validated_data,
        )
        self._create_lines(invoice, lines_data, tenant_id)
        return invoice

    @transaction.atomic
    def update(self, instance, validated_data):
        lines_data = validated_data.pop("lines", [])
        supplier_id = validated_data.pop("supplier_id", instance.supplier_id)
        warehouse_id = validated_data.pop("warehouse_id", instance.warehouse_id)

        instance.supplier_id = supplier_id
        instance.warehouse_id = warehouse_id
        instance.date = validated_data.get("date", instance.date)
        instance.due_date = validated_data.get("due_date", instance.due_date)
        instance.remarks = validated_data.get("remarks", instance.remarks)
        instance.invoice_discount = validated_data.get(
            "invoice_discount",
            instance.invoice_discount,
        )
        instance.gross_amount = validated_data.get("gross_amount", instance.gross_amount)
        instance.net_amount = validated_data.get("net_amount", instance.net_amount)
        instance.save()

        instance.lines.filter(deleted_at__isnull=True).update(deleted_at=now())
        self._create_lines(instance, lines_data, instance.tenant_id)
        return instance


class PurchaseReturnInvoiceLinePreviewSerializer(serializers.Serializer):
    purchase_invoice_line_id = serializers.UUIDField()
    product_id = serializers.UUIDField()
    product_name = serializers.CharField()
    purchased_quantity = serializers.DecimalField(max_digits=12, decimal_places=2)
    sold_quantity = serializers.DecimalField(max_digits=12, decimal_places=2)
    return_quantity = serializers.DecimalField(max_digits=12, decimal_places=2)
    unit = serializers.CharField()
    rate = serializers.DecimalField(max_digits=12, decimal_places=2)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    max_return_quantity = serializers.DecimalField(max_digits=12, decimal_places=2)


class PurchaseReturnLineSerializer(serializers.ModelSerializer):
    product = ProductDetailedSerializer(read_only=True)
    purchase_invoice_line_id = serializers.UUIDField(write_only=True)
    sold_quantity = serializers.SerializerMethodField()
    max_return_quantity = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseReturnLine
        fields = [
            "id",
            "product",
            "purchase_invoice_line_id",
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

    def _editing_purchase_return(self):
        root = getattr(self, "root", None)
        instance = getattr(root, "instance", None)
        if isinstance(instance, PurchaseReturn):
            return instance
        return None

    def _get_excluded_ids(self):
        excluded = self.context.get("excluded_return_line_ids")
        if excluded:
            return list(excluded)
        editing = self._editing_purchase_return()
        if editing is None:
            return []
        return list(
            editing.lines.filter(deleted_at__isnull=True).values_list("id", flat=True)
        )

    def _get_excluded_purchase_return_id(self):
        excluded = self.context.get("excluded_purchase_return_id")
        if excluded:
            return excluded
        editing = self._editing_purchase_return()
        return editing.id if editing is not None else None

    def _metrics_for(self, invoice_line):
        return get_purchase_return_line_metrics(
            invoice_line,
            excluded_return_line_ids=self._get_excluded_ids(),
            excluded_purchase_return_id=self._get_excluded_purchase_return_id(),
        )

    def get_sold_quantity(self, obj):
        return str(self._metrics_for(obj.purchase_invoice_line)["sold_quantity"])

    def get_max_return_quantity(self, obj):
        return str(
            self._metrics_for(obj.purchase_invoice_line)["available_return_quantity"]
        )

    def validate_purchase_invoice_line_id(self, value):
        tenant_ids = get_shared_tenant_ids(self.context["request"])
        invoice = self.context.get("purchase_invoice")

        try:
            invoice_line = (
                PurchaseInvoiceLine.objects.select_related("invoice", "product")
                .get(
                    id=value,
                    tenant_id__in=tenant_ids,
                    deleted_at__isnull=True,
                    invoice__deleted_at__isnull=True,
                )
            )
        except PurchaseInvoiceLine.DoesNotExist:
            raise serializers.ValidationError("Purchase invoice line not found for this tenant.")

        if invoice and invoice_line.invoice_id != invoice.id:
            raise serializers.ValidationError("Selected invoice line does not belong to the chosen purchase invoice.")

        return value

    def validate_quantity(self, value):
        if value < 0:
            raise serializers.ValidationError("Return quantity cannot be negative")
        return quantize_money(value)

    def validate(self, attrs):
        tenant_ids = get_shared_tenant_ids(self.context["request"])
        invoice_line = PurchaseInvoiceLine.objects.select_related("invoice", "product").get(
            id=attrs["purchase_invoice_line_id"],
            tenant_id__in=tenant_ids,
            deleted_at__isnull=True,
            invoice__deleted_at__isnull=True,
        )
        metrics = self._metrics_for(invoice_line)
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
        attrs["purchase_invoice_line"] = invoice_line
        attrs["rate"] = quantize_money(invoice_line.rate)
        attrs["amount"] = quantize_money(invoice_line.rate * quantity)
        return attrs


class PurchaseReturnSerializer(serializers.ModelSerializer):
    supplier = SupplierMiniSerializer(read_only=True)
    supplier_id = serializers.UUIDField(write_only=True)
    purchase_invoice = PurchaseInvoiceMiniSerializer(read_only=True)
    purchase_invoice_id = serializers.UUIDField(write_only=True)
    lines = PurchaseReturnLineSerializer(many=True)

    class Meta:
        model = PurchaseReturn
        fields = [
            "id",
            "return_number",
            "date",
            "supplier",
            "supplier_id",
            "purchase_invoice",
            "purchase_invoice_id",
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

        invoice = self.context.get("purchase_invoice")
        excluded_ids = self.context.get("excluded_return_line_ids")
        excluded_return_id = self.context.get("excluded_purchase_return_id")

        if isinstance(self.instance, PurchaseReturn):
            if excluded_ids is None:
                excluded_ids = list(
                    self.instance.lines.filter(deleted_at__isnull=True).values_list(
                        "id", flat=True
                    )
                )
            if excluded_return_id is None:
                excluded_return_id = self.instance.id

        self._context["purchase_invoice"] = invoice
        self._context["excluded_return_line_ids"] = excluded_ids or []
        self._context["excluded_purchase_return_id"] = excluded_return_id

        return fields

    def validate_supplier_id(self, value):
        if not shared_master_exists(Supplier, self.context["request"], value):
            raise serializers.ValidationError("Supplier not found")
        return value

    def validate_purchase_invoice_id(self, value):
        tenant_ids = get_shared_tenant_ids(self.context["request"])
        if not (
            PurchaseInvoice.objects.filter(id=value, deleted_at__isnull=True)
            .filter(models.Q(tenant_id__in=tenant_ids) | models.Q(lines__tenant_id__in=tenant_ids))
            .distinct()
            .exists()
        ):
            raise serializers.ValidationError("Purchase invoice not found for this tenant")
        return value

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("At least one return line is required.")
        return value

    def validate(self, attrs):
        tenant_ids = get_shared_tenant_ids(self.context["request"])
        supplier_id = attrs.get("supplier_id") or getattr(self.instance, "supplier_id", None)
        purchase_invoice_id = attrs.get("purchase_invoice_id") or getattr(self.instance, "purchase_invoice_id", None)

        purchase_invoice = (
            PurchaseInvoice.objects.select_related("supplier", "warehouse")
            .filter(id=purchase_invoice_id, deleted_at__isnull=True)
            .filter(models.Q(tenant_id__in=tenant_ids) | models.Q(lines__tenant_id__in=tenant_ids))
            .distinct()
            .get()
        )

        if purchase_invoice.supplier_id != supplier_id:
            raise serializers.ValidationError(
                {"purchase_invoice_id": "Selected purchase invoice does not belong to the chosen supplier."}
            )

        self.context["purchase_invoice"] = purchase_invoice
        lines = attrs.get("lines") or []
        seen_invoice_lines = set()
        gross_amount = Decimal("0.00")

        for line in lines:
            invoice_line_id = str(line["purchase_invoice_line"].id)
            if line["purchase_invoice_line"].invoice_id != purchase_invoice.id:
                raise serializers.ValidationError(
                    {"lines": "Each return line must belong to the selected purchase invoice."}
                )
            if invoice_line_id in seen_invoice_lines:
                raise serializers.ValidationError(
                    {"lines": "Each invoice line should appear only once per purchase return."}
                )
            seen_invoice_lines.add(invoice_line_id)
            gross_amount += line["amount"]

        attrs["gross_amount"] = quantize_money(gross_amount)
        return attrs

    def _generate_return_number(self, tenant_id):
        count = PurchaseReturn.objects.filter(tenant_id=tenant_id).count() + 1
        return f"PRET-{count:05d}"

    def _create_lines(self, purchase_return, lines_data, tenant_id):
        for line_data in lines_data:
            PurchaseReturnLine.objects.create(
                tenant_id=line_data["product"].tenant_id,
                purchase_return=purchase_return,
                purchase_invoice_line=line_data["purchase_invoice_line"],
                product_id=line_data["product_id"],
                quantity=line_data["quantity"],
                rate=line_data["rate"],
                amount=line_data["amount"],
            )

    @transaction.atomic
    def create(self, validated_data):
        tenant_id = self.context["request"].user.tenant_id
        lines_data = validated_data.pop("lines", [])
        supplier_id = validated_data.pop("supplier_id")
        purchase_invoice_id = validated_data.pop("purchase_invoice_id")

        purchase_return = PurchaseReturn.objects.create(
            tenant_id=tenant_id,
            supplier_id=supplier_id,
            purchase_invoice_id=purchase_invoice_id,
            return_number=self._generate_return_number(tenant_id),
            **validated_data,
        )
        self._create_lines(purchase_return, lines_data, tenant_id)
        return purchase_return

    @transaction.atomic
    def update(self, instance, validated_data):
        lines_data = validated_data.pop("lines", [])
        instance.supplier_id = validated_data.pop("supplier_id", instance.supplier_id)
        instance.purchase_invoice_id = validated_data.pop(
            "purchase_invoice_id",
            instance.purchase_invoice_id,
        )
        instance.date = validated_data.get("date", instance.date)
        instance.remarks = validated_data.get("remarks", instance.remarks)
        instance.gross_amount = validated_data.get("gross_amount", instance.gross_amount)
        instance.save()

        instance.lines.filter(deleted_at__isnull=True).update(deleted_at=now())
        self._create_lines(instance, lines_data, instance.tenant_id)
        return instance


class PurchaseBankPaymentLineSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True, required=False)
    supplier = SupplierMiniSerializer(read_only=True, required=False)
    supplier_id = serializers.UUIDField(write_only=True)
    payment_against = serializers.ChoiceField(
        choices=PurchaseBankPaymentLine.PaymentAgainst.choices,
        required=False,
        default=PurchaseBankPaymentLine.PaymentAgainst.INVOICE,
    )
    purchase_invoice = PurchaseInvoiceMiniSerializer(read_only=True, required=False)
    purchase_invoice_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    party_opening_balance_id = serializers.UUIDField(
        write_only=True,
        required=False,
        allow_null=True,
    )
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["supplier_id"] = str(instance.supplier_id)
        data["payment_against"] = instance.payment_against
        data["purchase_invoice_id"] = (
            str(instance.purchase_invoice_id) if instance.purchase_invoice_id else None
        )
        data["party_opening_balance_id"] = (
            str(instance.party_opening_balance_id)
            if instance.party_opening_balance_id
            else None
        )
        return data

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Line amount must be greater than 0")
        return quantize_money(value)


class PurchaseBankPaymentSerializer(serializers.ModelSerializer):
    bank_account = AccountMiniSerializer(read_only=True)
    bank_account_id = serializers.UUIDField(write_only=True)
    lines = PurchaseBankPaymentLineSerializer(many=True)
    line_count = serializers.SerializerMethodField()
    supplier_summary = serializers.SerializerMethodField()
    reference_summary = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseBankPayment
        fields = [
            "id",
            "payment_number",
            "date",
            "bank_account",
            "bank_account_id",
            "amount",
            "remarks",
            "lines",
            "line_count",
            "supplier_summary",
            "reference_summary",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "payment_number",
            "amount",
            "line_count",
            "supplier_summary",
            "reference_summary",
            "created_at",
            "updated_at",
        ]

    def get_line_count(self, obj):
        return obj.lines.filter(deleted_at__isnull=True).count()

    def get_supplier_summary(self, obj):
        names = []
        seen = set()
        for line in obj.lines.filter(deleted_at__isnull=True).select_related("supplier"):
            name = line.supplier.business_name
            if name not in seen:
                seen.add(name)
                names.append(name)
        if not names:
            return ""
        if len(names) == 1:
            return names[0]
        return f"{names[0]} +{len(names) - 1}"

    def get_reference_summary(self, obj):
        labels = []
        for line in obj.lines.filter(deleted_at__isnull=True).select_related(
            "purchase_invoice",
            "party_opening_balance",
        ):
            if line.payment_against == PurchaseBankPaymentLine.PaymentAgainst.OPENING_BALANCE:
                labels.append("Opening Balance")
            elif line.purchase_invoice_id:
                labels.append(line.purchase_invoice.invoice_number)
        if not labels:
            return ""
        if len(labels) == 1:
            return labels[0]
        return f"{labels[0]} +{len(labels) - 1}"

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["lines"] = PurchaseBankPaymentLineSerializer(
            instance.lines.filter(deleted_at__isnull=True),
            many=True,
        ).data
        return data

    def validate_bank_account_id(self, value):
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

    def _validate_lines(self, lines_data, bank_account_id):
        request = self.context["request"]
        tenant_ids = get_shared_tenant_ids(request)
        excluded_payment_ids = [self.instance.id] if self.instance else []
        invoice_allocated = {}
        opening_allocated = {}
        prepared_lines = []

        if not lines_data:
            raise serializers.ValidationError({"lines": "At least one payment line is required."})

        try:
            bank_account = Account.objects.get(
                id=bank_account_id,
                tenant_id__in=tenant_ids,
                deleted_at__isnull=True,
            )
        except Account.DoesNotExist:
            raise serializers.ValidationError({"bank_account_id": "Bank account not found"})
        bank_tenant_id = bank_account.tenant_id

        for index, line in enumerate(lines_data):
            supplier_id = line.get("supplier_id")
            payment_against = line.get(
                "payment_against",
                PurchaseBankPaymentLine.PaymentAgainst.INVOICE,
            )
            purchase_invoice_id = line.get("purchase_invoice_id")
            party_opening_balance_id = line.get("party_opening_balance_id")
            amount = quantize_money(line.get("amount", Decimal("0.00")))

            if not shared_master_exists(Supplier, request, supplier_id):
                raise serializers.ValidationError(
                    {"lines": {index: {"supplier_id": "Supplier not found"}}}
                )

            if payment_against == PurchaseBankPaymentLine.PaymentAgainst.OPENING_BALANCE:
                if not party_opening_balance_id:
                    raise serializers.ValidationError(
                        {"lines": {index: {"party_opening_balance_id": "Opening balance is required."}}}
                    )
                opening_balance = PartyOpeningBalance.objects.select_related("supplier").filter(
                    id=party_opening_balance_id,
                    tenant_id__in=tenant_ids,
                    party_type=PartyOpeningBalance.PartyType.SUPPLIER,
                    deleted_at__isnull=True,
                ).first()
                if not opening_balance:
                    raise serializers.ValidationError(
                        {"lines": {index: {"party_opening_balance_id": "Opening balance not found."}}}
                    )
                if opening_balance.supplier_id != supplier_id:
                    raise serializers.ValidationError(
                        {
                            "lines": {
                                index: {
                                    "party_opening_balance_id": (
                                        "Opening balance does not belong to the chosen supplier."
                                    )
                                }
                            }
                        }
                    )
                if opening_balance.tenant_id != bank_tenant_id:
                    raise serializers.ValidationError(
                        {
                            "lines": {
                                index: {
                                    "party_opening_balance_id": (
                                        "Opening balance dimension must match the selected bank dimension."
                                    )
                                }
                            }
                        }
                    )
                financials = get_supplier_opening_balance_financials(
                    opening_balance,
                    excluded_payment_ids=excluded_payment_ids,
                )
                already = opening_allocated.get(str(opening_balance.id), Decimal("0.00"))
                if amount + already > financials["balance_amount"]:
                    raise serializers.ValidationError(
                        {
                            "lines": {
                                index: {
                                    "amount": (
                                        "Payment amount cannot exceed opening balance "
                                        f"({financials['balance_amount']})."
                                    )
                                }
                            }
                        }
                    )
                opening_allocated[str(opening_balance.id)] = already + amount
                prepared_lines.append(
                    {
                        "supplier_id": supplier_id,
                        "payment_against": payment_against,
                        "purchase_invoice_id": None,
                        "party_opening_balance_id": party_opening_balance_id,
                        "amount": amount,
                    }
                )
                continue

            if not purchase_invoice_id:
                raise serializers.ValidationError(
                    {"lines": {index: {"purchase_invoice_id": "Purchase invoice is required."}}}
                )
            purchase_invoice = (
                PurchaseInvoice.objects.select_related("supplier")
                .filter(id=purchase_invoice_id, deleted_at__isnull=True)
                .filter(models.Q(tenant_id__in=tenant_ids) | models.Q(lines__tenant_id__in=tenant_ids))
                .distinct()
                .first()
            )
            if not purchase_invoice:
                raise serializers.ValidationError(
                    {"lines": {index: {"purchase_invoice_id": "Purchase invoice not found."}}}
                )
            if purchase_invoice.supplier_id != supplier_id:
                raise serializers.ValidationError(
                    {
                        "lines": {
                            index: {
                                "purchase_invoice_id": (
                                    "Selected purchase invoice does not belong to the chosen supplier."
                                )
                            }
                        }
                    }
                )

            financials = get_purchase_invoice_financials(
                purchase_invoice,
                excluded_payment_ids=excluded_payment_ids,
            )
            already = invoice_allocated.get(str(purchase_invoice.id), Decimal("0.00"))
            if amount + already > financials["balance_amount"]:
                raise serializers.ValidationError(
                    {
                        "lines": {
                            index: {
                                "amount": (
                                    "Payment amount cannot exceed invoice balance "
                                    f"({financials['balance_amount']})."
                                )
                            }
                        }
                    }
                )
            invoice_allocated[str(purchase_invoice.id)] = already + amount
            prepared_lines.append(
                {
                    "supplier_id": supplier_id,
                    "payment_against": PurchaseBankPaymentLine.PaymentAgainst.INVOICE,
                    "purchase_invoice_id": purchase_invoice_id,
                    "party_opening_balance_id": None,
                    "amount": amount,
                }
            )

        return prepared_lines

    def validate(self, attrs):
        lines_data = attrs.get("lines")
        bank_account_id = attrs.get("bank_account_id")
        if self.instance and not bank_account_id:
            bank_account_id = self.instance.bank_account_id
        if lines_data is None and self.instance:
            raise serializers.ValidationError({"lines": "Payment lines are required."})
        attrs["lines"] = self._validate_lines(lines_data or [], bank_account_id)
        attrs["amount"] = quantize_money(
            sum((line["amount"] for line in attrs["lines"]), Decimal("0.00"))
        )
        return attrs

    def _generate_payment_number(self, tenant_id):
        count = PurchaseBankPayment.objects.filter(tenant_id=tenant_id).count() + 1
        return f"PBP-{count:05d}"

    def _create_lines(self, payment, lines_data):
        for line_data in lines_data:
            PurchaseBankPaymentLine.objects.create(
                tenant_id=payment.tenant_id,
                payment=payment,
                **line_data,
            )

    @transaction.atomic
    def create(self, validated_data):
        lines_data = validated_data.pop("lines")
        tenant_id = self.context["request"].user.tenant_id
        bank_account_id = validated_data.pop("bank_account_id")
        payment = PurchaseBankPayment.objects.create(
            tenant_id=tenant_id,
            bank_account_id=bank_account_id,
            payment_number=self._generate_payment_number(tenant_id),
            **validated_data,
        )
        self._create_lines(payment, lines_data)
        return payment

    @transaction.atomic
    def update(self, instance, validated_data):
        lines_data = validated_data.pop("lines")
        instance.bank_account_id = validated_data.pop("bank_account_id", instance.bank_account_id)
        instance.date = validated_data.get("date", instance.date)
        instance.amount = validated_data.get("amount", instance.amount)
        instance.remarks = validated_data.get("remarks", instance.remarks)
        instance.save()
        instance.lines.filter(deleted_at__isnull=True).update(deleted_at=now())
        self._create_lines(instance, lines_data)
        return instance
