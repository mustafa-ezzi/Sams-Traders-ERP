from decimal import Decimal

from django.db import transaction
from django.utils.timezone import now
from rest_framework import serializers

from accounts.models import Account
from inventory.models import Customer, Product, ProductStock, Warehouse
from inventory.serializers import ProductDetailedSerializer
from sales.models import SalesBankReceipt, SalesInvoice, SalesInvoiceLine, SalesReturn, SalesReturnLine
from sales.services import (
    get_available_sale_quantity,
    get_sales_invoice_financials,
    get_sales_return_line_metrics,
    quantize_money,
)


class CustomerMiniSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    business_name = serializers.CharField()


class WarehouseMiniSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()


class SalesInvoiceMiniSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    invoice_number = serializers.CharField()
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
            "available_quantity",
        ]
        read_only_fields = ["id", "amount", "total_amount", "available_quantity"]

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
        tenant_id = self.context["request"].user.tenant_id
        if not Product.objects.filter(
            id=value,
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ).exists():
            raise serializers.ValidationError("Product not found for this tenant")
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
    lines = SalesInvoiceLineSerializer(many=True)
    returned_amount = serializers.SerializerMethodField()
    received_amount = serializers.SerializerMethodField()
    balance_amount = serializers.SerializerMethodField()

    class Meta:
        model = SalesInvoice
        fields = [
            "id",
            "invoice_number",
            "date",
            "customer",
            "customer_id",
            "warehouse",
            "warehouse_id",
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

    def _get_financials(self, obj):
        return get_sales_invoice_financials(obj)

    def get_returned_amount(self, obj):
        return str(self._get_financials(obj)["returned_amount"])

    def get_received_amount(self, obj):
        return str(self._get_financials(obj)["received_amount"])

    def get_balance_amount(self, obj):
        return str(self._get_financials(obj)["balance_amount"])
        read_only_fields = [
            "id",
            "invoice_number",
            "gross_amount",
            "net_amount",
            "created_at",
            "updated_at",
        ]

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
        tenant_id = self.context["request"].user.tenant_id
        if not Customer.objects.filter(
            id=value,
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ).exists():
            raise serializers.ValidationError("Customer not found for this tenant")
        return value

    def validate_warehouse_id(self, value):
        tenant_id = self.context["request"].user.tenant_id
        if not Warehouse.objects.filter(
            id=value,
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ).exists():
            raise serializers.ValidationError("Warehouse not found for this tenant")
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
        warehouse_id = attrs.get("warehouse_id") or getattr(self.instance, "warehouse_id", None)
        tenant_id = self.context["request"].user.tenant_id
        warehouse = Warehouse.objects.get(
            id=warehouse_id,
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        )
        self.context["warehouse"] = warehouse

        line_items = attrs.get("lines") or []
        seen_products = set()
        product_quantities = {}
        gross_amount = Decimal("0.00")
        excluded_ids = self.context.get("excluded_sale_line_ids")

        if excluded_ids is None and isinstance(self.instance, SalesInvoice):
            excluded_ids = list(
                self.instance.lines.filter(deleted_at__isnull=True).values_list("id", flat=True)
            )
        excluded_ids = excluded_ids or []

        for line in line_items:
            product_id = str(line["product_id"])
            if product_id in seen_products:
                raise serializers.ValidationError(
                    {"lines": "Each product should appear only once per invoice."}
                )
            seen_products.add(product_id)
            product_quantities[product_id] = quantize_money(line["quantity"])
            gross_amount += line["total_amount"]

        for product_id, quantity in product_quantities.items():
            available_quantity = get_available_sale_quantity(
                tenant_id,
                warehouse.id,
                product_id,
                excluded_sale_line_ids=excluded_ids,
            )
            if quantity > available_quantity:
                raise serializers.ValidationError(
                    {
                        "lines": (
                            f"Sale quantity for product {product_id} cannot exceed "
                            f"available stock ({available_quantity})."
                        )
                    }
                )

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
        count = SalesInvoice.objects.filter(tenant_id=tenant_id).count() + 1
        return f"SINV-{count:05d}"

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
        tenant_id = self.context["request"].user.tenant_id
        lines_data = validated_data.pop("lines", [])
        customer_id = validated_data.pop("customer_id")
        warehouse_id = validated_data.pop("warehouse_id")

        invoice = SalesInvoice.objects.create(
            tenant_id=tenant_id,
            customer_id=customer_id,
            warehouse_id=warehouse_id,
            invoice_number=self._generate_invoice_number(tenant_id),
            **validated_data,
        )
        self._create_lines(invoice, lines_data, tenant_id)
        return invoice

    @transaction.atomic
    def update(self, instance, validated_data):
        lines_data = validated_data.pop("lines", [])
        instance.customer_id = validated_data.pop("customer_id", instance.customer_id)
        instance.warehouse_id = validated_data.pop("warehouse_id", instance.warehouse_id)
        instance.date = validated_data.get("date", instance.date)
        instance.remarks = validated_data.get("remarks", instance.remarks)
        instance.invoice_discount = validated_data.get("invoice_discount", instance.invoice_discount)
        instance.gross_amount = validated_data.get("gross_amount", instance.gross_amount)
        instance.net_amount = validated_data.get("net_amount", instance.net_amount)
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
        tenant_id = self.context["request"].user.tenant_id
        if not Customer.objects.filter(
            id=value,
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ).exists():
            raise serializers.ValidationError("Customer not found for this tenant")
        return value

    def validate_sales_invoice_id(self, value):
        tenant_id = self.context["request"].user.tenant_id
        if not SalesInvoice.objects.filter(
            id=value,
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ).exists():
            raise serializers.ValidationError("Sales invoice not found for this tenant")
        return value

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("At least one return line is required.")
        return value

    def validate(self, attrs):
        tenant_id = self.context["request"].user.tenant_id
        customer_id = attrs.get("customer_id") or getattr(self.instance, "customer_id", None)
        sales_invoice_id = attrs.get("sales_invoice_id") or getattr(self.instance, "sales_invoice_id", None)

        sales_invoice = SalesInvoice.objects.select_related("customer", "warehouse").get(
            id=sales_invoice_id,
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        )

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
        tenant_id = self.context["request"].user.tenant_id
        if not Customer.objects.filter(
            id=value,
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ).exists():
            raise serializers.ValidationError("Customer not found for this tenant")
        return value

    def validate_sales_invoice_id(self, value):
        tenant_id = self.context["request"].user.tenant_id
        if not SalesInvoice.objects.filter(
            id=value,
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        ).exists():
            raise serializers.ValidationError("Sales invoice not found for this tenant")
        return value

    def validate_bank_account_id(self, value):
        tenant_id = self.context["request"].user.tenant_id
        try:
            account = Account.objects.get(
                id=value,
                tenant_id=tenant_id,
                deleted_at__isnull=True,
            )
        except Account.DoesNotExist:
            raise serializers.ValidationError("Bank account not found for this tenant")

        if not account.is_active:
            raise serializers.ValidationError("Selected bank account is inactive")
        if not account.is_postable:
            raise serializers.ValidationError("Selected bank account must be postable")
        if account.account_group != Account.AccountGroup.ASSET:
            raise serializers.ValidationError("Selected bank account must belong to asset group")

        return value

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Receipt amount must be greater than 0")
        return quantize_money(value)

    def validate(self, attrs):
        tenant_id = self.context["request"].user.tenant_id
        customer_id = attrs.get("customer_id") or getattr(self.instance, "customer_id", None)
        sales_invoice_id = attrs.get("sales_invoice_id") or getattr(self.instance, "sales_invoice_id", None)

        sales_invoice = SalesInvoice.objects.select_related("customer").get(
            id=sales_invoice_id,
            tenant_id=tenant_id,
            deleted_at__isnull=True,
        )

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
