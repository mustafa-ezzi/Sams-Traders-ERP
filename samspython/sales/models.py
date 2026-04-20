from django.db import models

from accounts.models import Account
from common.models import BaseModel
from inventory.models import Customer, Product, Warehouse


class SalesInvoice(BaseModel):
    invoice_number = models.CharField(max_length=50)
    date = models.DateField()
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
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="sales_bank_receipts",
    )
    sales_invoice = models.ForeignKey(
        SalesInvoice,
        on_delete=models.PROTECT,
        related_name="bank_receipts",
    )
    bank_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="sales_bank_receipts",
    )
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
