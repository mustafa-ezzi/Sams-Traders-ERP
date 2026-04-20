from django.db import models

from accounts.models import Account
from common.models import BaseModel
from inventory.models import Product, Supplier, Warehouse


class PurchaseInvoice(BaseModel):
    invoice_number = models.CharField(max_length=50)
    date = models.DateField()
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchase_invoices")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="purchase_invoices")
    remarks = models.TextField(blank=True, default="")
    invoice_discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    gross_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "invoice_number"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_purchase_invoice_number_per_tenant",
            )
        ]
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return self.invoice_number


class PurchaseInvoiceLine(BaseModel):
    invoice = models.ForeignKey(
        PurchaseInvoice,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="purchase_invoice_lines")
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.invoice.invoice_number} - {self.product.name}"


class PurchaseReturn(BaseModel):
    return_number = models.CharField(max_length=50)
    date = models.DateField()
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="purchase_returns",
    )
    purchase_invoice = models.ForeignKey(
        PurchaseInvoice,
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
                name="unique_active_purchase_return_number_per_tenant",
            )
        ]
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return self.return_number


class PurchaseReturnLine(BaseModel):
    purchase_return = models.ForeignKey(
        PurchaseReturn,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    purchase_invoice_line = models.ForeignKey(
        PurchaseInvoiceLine,
        on_delete=models.PROTECT,
        related_name="return_lines",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="purchase_return_lines",
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.purchase_return.return_number} - {self.product.name}"


class PurchaseBankPayment(BaseModel):
    payment_number = models.CharField(max_length=50)
    date = models.DateField()
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="purchase_bank_payments",
    )
    purchase_invoice = models.ForeignKey(
        PurchaseInvoice,
        on_delete=models.PROTECT,
        related_name="bank_payments",
    )
    bank_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="purchase_bank_payments",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    remarks = models.TextField(blank=True, default="")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "payment_number"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_purchase_bank_payment_number_per_tenant",
            )
        ]
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return self.payment_number
