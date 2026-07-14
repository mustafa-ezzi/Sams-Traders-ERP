from django.db import models

from accounts.models import Account
from common.models import BaseModel
from inventory.models import Customer, PartyOpeningBalance, Product, Salesman, Warehouse


class SalesOrder(BaseModel):
    order_number = models.CharField(max_length=50)
    dc_number = models.CharField(max_length=50, blank=True, default="")
    date = models.DateField()
    due_date = models.DateField(null=True, blank=True)
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="sales_orders",
    )
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name="sales_orders",
    )
    remarks = models.TextField(blank=True, default="")
    order_discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    gross_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    salesman = models.ForeignKey(
        Salesman,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="sales_orders",
    )
    salesman_commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    salesman_commission_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "order_number"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_sales_order_number_per_tenant",
            )
        ]
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return self.order_number


class SalesOrderLine(BaseModel):
    sales_order = models.ForeignKey(
        SalesOrder,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="sales_order_lines",
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.sales_order.order_number} - {self.product.name}"


class SalesInvoice(BaseModel):
    invoice_number = models.CharField(max_length=50)
    dc_number = models.CharField(max_length=50, blank=True, default="")
    date = models.DateField()
    due_date = models.DateField(null=True, blank=True)
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="sales_invoices",
    )
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name="sales_invoices",
    )
    remarks = models.TextField(blank=True, default="")
    invoice_discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    gross_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    salesman = models.ForeignKey(
        Salesman,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="sales_invoices",
    )
    salesman_commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    salesman_commission_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    sales_order = models.ForeignKey(
        SalesOrder,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="invoices",
    )
    order_reference = models.CharField(max_length=50, blank=True, default="")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "invoice_number"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_sales_invoice_number_per_tenant",
            )
        ]
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return self.invoice_number


class SalesInvoiceLine(BaseModel):
    invoice = models.ForeignKey(
        SalesInvoice,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="sales_invoice_lines",
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cost_used = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    cost_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    profit = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.invoice.invoice_number} - {self.product.name}"


class SalesReturn(BaseModel):
    return_number = models.CharField(max_length=50)
    date = models.DateField()
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="sales_returns",
    )
    sales_invoice = models.ForeignKey(
        SalesInvoice,
        on_delete=models.PROTECT,
        related_name="returns",
    )
    remarks = models.TextField(blank=True, default="")
    gross_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "return_number"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_sales_return_number_per_tenant",
            )
        ]
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return self.return_number


class SalesReturnLine(BaseModel):
    sales_return = models.ForeignKey(
        SalesReturn,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    sales_invoice_line = models.ForeignKey(
        SalesInvoiceLine,
        on_delete=models.PROTECT,
        related_name="return_lines",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="sales_return_lines",
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.sales_return.return_number} - {self.product.name}"


class SalesBankReceipt(BaseModel):
    receipt_number = models.CharField(max_length=50)
    date = models.DateField()
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    remarks = models.TextField(blank=True, default="")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "receipt_number"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_sales_bank_receipt_number_per_tenant",
            )
        ]
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return self.receipt_number

    @property
    def customer(self):
        """Compatibility shim: customer lives on receipt lines after multi-line refactor."""
        line = (
            self.lines.filter(deleted_at__isnull=True)
            .select_related("customer")
            .first()
        )
        return line.customer if line else None

    @property
    def sales_invoice(self):
        """Compatibility shim: invoice lives on receipt lines after multi-line refactor."""
        line = (
            self.lines.filter(deleted_at__isnull=True)
            .select_related("sales_invoice")
            .first()
        )
        return line.sales_invoice if line else None

    @property
    def bank_account(self):
        """Compatibility shim: bank lives on receipt lines."""
        line = (
            self.lines.filter(deleted_at__isnull=True)
            .select_related("bank_account")
            .first()
        )
        return line.bank_account if line else None


class SalesBankReceiptLine(BaseModel):
    class ReceiptAgainst(models.TextChoices):
        INVOICE = "INVOICE", "Invoice"
        OPENING_BALANCE = "OPENING_BALANCE", "Opening Balance"

    receipt = models.ForeignKey(
        SalesBankReceipt,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="sales_bank_receipt_lines",
    )
    receipt_against = models.CharField(
        max_length=30,
        choices=ReceiptAgainst.choices,
        default=ReceiptAgainst.INVOICE,
    )
    sales_invoice = models.ForeignKey(
        SalesInvoice,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="bank_receipt_lines",
    )
    party_opening_balance = models.ForeignKey(
        PartyOpeningBalance,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="sales_bank_receipt_lines",
    )
    salesman = models.ForeignKey(
        Salesman,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="recovery_bank_receipt_lines",
    )
    bank_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="sales_bank_receipt_lines",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    recovery_commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    recovery_commission_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.receipt.receipt_number} - {self.customer.business_name}"


class SalesmanCommissionPayment(BaseModel):
    voucher_number = models.CharField(max_length=50)
    date = models.DateField()
    salesman = models.ForeignKey(
        Salesman,
        on_delete=models.PROTECT,
        related_name="commission_payments",
    )
    sales_invoice = models.ForeignKey(
        SalesInvoice,
        on_delete=models.PROTECT,
        related_name="salesman_commission_payments",
    )
    payable_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="salesman_commission_payments",
    )
    payment_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="salesman_commission_paid_vouchers",
    )
    payment = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    remarks = models.TextField(blank=True, default="")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "voucher_number"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_salesman_commission_voucher_per_tenant",
            )
        ]
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return self.voucher_number
