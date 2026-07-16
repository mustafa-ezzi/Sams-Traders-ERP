from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.db.models import Q
from django.contrib.auth.models import AbstractUser

from common.models import BaseModel


class User(AbstractUser):
    tenant_id = models.CharField(max_length=50)
    business_name = models.CharField(max_length=255, blank=True, default="")
    phone_number = models.CharField(max_length=50, blank=True, default="")
    tenant_limit = models.PositiveIntegerField(default=1)
    parent_user = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="tenant_children",
    )
    tenant_role = models.CharField(max_length=120, blank=True, default="")
    ui_permissions = models.JSONField(default=list, blank=True)
    data_access = models.JSONField(default=dict, blank=True)
    allowed_dimensions = models.ManyToManyField(
        "Dimension",
        blank=True,
        related_name="users",
    )

    def can_create_more_tenants(self):
        assigned_count = self.allowed_dimensions.count()
        if assigned_count == 0 and self.tenant_id:
            assigned_count = 1
        return assigned_count < self.tenant_limit


class Dimension(models.Model):
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255, unique=True)
    sku_code = models.CharField(max_length=20, blank=True, default="")
    address = models.TextField(blank=True, default="")
    phone_number = models.CharField(max_length=50, blank=True, default="")
    ntn_number = models.CharField(max_length=50, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Account(BaseModel):
    class AccountType(models.TextChoices):
        GENERAL = "GENERAL", "General"
        BANK = "BANK", "Bank"
        CASH = "CASH", "Cash"
        RECEIVABLE = "RECEIVABLE", "Receivable"
        PAYABLE = "PAYABLE", "Payable"
        INVENTORY = "INVENTORY", "Inventory"
        REVENUE = "REVENUE", "Revenue"
        COGS = "COGS", "Cost of Goods Sold"

    class AccountGroup(models.TextChoices):
        ASSET = "ASSET", "Asset"
        LIABILITY = "LIABILITY", "Liability"
        EQUITY = "EQUITY", "Equity"
        REVENUE = "REVENUE", "Revenue"
        COGS = "COGS", "Cost of Goods Sold"
        EXPENSE = "EXPENSE", "Expense"
        TAX = "TAX", "Tax"
        PURCHASE = "PURCHASE", "Purchase"

    class AccountNature(models.TextChoices):
        DEBIT = "DEBIT", "Debit"
        CREDIT = "CREDIT", "Credit"

    code = models.CharField(max_length=10)
    name = models.CharField(max_length=255)

    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="children"
    )

    account_group = models.CharField(max_length=20, choices=AccountGroup.choices)
    account_type = models.CharField(
        max_length=20,
        choices=AccountType.choices,
        default=AccountType.GENERAL,
    )

    account_nature = models.CharField(max_length=10, choices=AccountNature.choices)

    level = models.PositiveSmallIntegerField()

    is_postable = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    sort_order = models.IntegerField(default=0)

    class Meta:
        db_table = "accounts"
        ordering = ["code"]

        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "code"],
                condition=Q(deleted_at__isnull=True),
                name="unique_active_account_code_per_tenant",
            ),
            models.UniqueConstraint(
                fields=["tenant_id", "parent", "name"],
                condition=Q(deleted_at__isnull=True),
                name="unique_account_name_per_parent_per_tenant",
            ),
        ]

        indexes = [
            models.Index(fields=["tenant_id", "code"]),
            models.Index(fields=["tenant_id", "parent"]),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"

    def clean(self):
        if self.parent and self.parent == self:
            raise ValidationError("Account cannot be its own parent.")

        if self.parent and self.parent.deleted_at is not None:
            raise ValidationError("Parent account cannot be soft deleted.")

        if self.parent and self.parent.tenant_id != self.tenant_id:
            raise ValidationError("Parent account must belong to the same tenant.")

        if self.parent and self.parent.is_postable:
            raise ValidationError("Cannot create a child under a postable account.")

        parent = self.parent
        while parent:
            if parent == self:
                raise ValidationError("Circular parent relationship detected.")
            parent = parent.parent

        if self.pk and self.is_postable and self.children.filter(deleted_at__isnull=True).exists():
            raise ValidationError("Postable account cannot have children.")

        if self.level > 5:
            raise ValidationError("Account level cannot be greater than 5.")

        allowed_group_by_type = {
            self.AccountType.BANK: self.AccountGroup.ASSET,
            self.AccountType.CASH: self.AccountGroup.ASSET,
            self.AccountType.RECEIVABLE: self.AccountGroup.ASSET,
            self.AccountType.INVENTORY: self.AccountGroup.ASSET,
            self.AccountType.PAYABLE: self.AccountGroup.LIABILITY,
            self.AccountType.REVENUE: self.AccountGroup.REVENUE,
            self.AccountType.COGS: self.AccountGroup.COGS,
        }
        expected_group = allowed_group_by_type.get(self.account_type)
        if expected_group and self.account_group != expected_group:
            raise ValidationError(
                f"Account type {self.account_type} must belong to account group {expected_group}."
            )

    def validate_can_soft_delete(self):
        if self.children.filter(deleted_at__isnull=True).exists():
            raise ValidationError("Cannot delete account with children.")

        from inventory.models import Category, Customer, Product, RawMaterial, Supplier
        from purchase.models import PurchaseBankPayment
        from sales.models import SalesBankReceiptLine

        dependencies = [
            Category.objects.filter(
                deleted_at__isnull=True,
            ).filter(
                Q(inventory_account=self)
                | Q(cogs_account=self)
                | Q(revenue_account=self)
            ),
            RawMaterial.objects.filter(
                deleted_at__isnull=True,
                inventory_account=self,
            ),
            Product.objects.filter(
                deleted_at__isnull=True,
            ).filter(
                Q(inventory_account=self)
                | Q(cogs_account=self)
                | Q(revenue_account=self)
            ),
            Customer.objects.filter(
                deleted_at__isnull=True,
                account=self,
            ),
            Supplier.objects.filter(
                deleted_at__isnull=True,
                account=self,
            ),
            PurchaseBankPayment.objects.filter(
                deleted_at__isnull=True,
                bank_account=self,
            ),
            SalesBankReceiptLine.objects.filter(
                deleted_at__isnull=True,
                bank_account=self,
            ).filter(receipt__deleted_at__isnull=True),
            ExpenseLine.objects.filter(
                deleted_at__isnull=True,
            )
            .filter(Q(bank_account=self) | Q(expense_account=self))
            .filter(expense__deleted_at__isnull=True),
        ]

        if any(queryset.exists() for queryset in dependencies):
            raise ValidationError(
                "Cannot delete account because it is referenced by active records."
            )

    def save(self, *args, **kwargs):
        # auto level
        if self.parent:
            self.level = self.parent.level + 1
        else:
            self.level = 1

        # run validations
        self.full_clean()

        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        self.validate_can_soft_delete()
        self.deleted_at = timezone.now()
        self.save()

    @property
    def is_leaf(self):
        return not self.children.exists()


class JournalEntry(BaseModel):
    class SourceType(models.TextChoices):
        PURCHASE_INVOICE = "PURCHASE_INVOICE", "Purchase Invoice"
        PURCHASE_RETURN = "PURCHASE_RETURN", "Purchase Return"
        PURCHASE_BANK_PAYMENT = "PURCHASE_BANK_PAYMENT", "Purchase Bank Payment"
        SALES_INVOICE = "SALES_INVOICE", "Sales Invoice"
        SALES_RETURN = "SALES_RETURN", "Sales Return"
        SALES_BANK_RECEIPT = "SALES_BANK_RECEIPT", "Sales Bank Receipt"
        SALESMAN_COMMISSION_PAYMENT = "SALESMAN_COMMISSION_PAYMENT", "Salesman Commission Payment"
        EXPENSE = "EXPENSE", "Expense"
        PARTY_OPENING_BALANCE = "PARTY_OPENING_BALANCE", "Party Opening Balance"
        BANK_TRANSFER = "BANK_TRANSFER", "Bank Transfer"

    date = models.DateField()
    reference = models.CharField(max_length=50)
    source_type = models.CharField(max_length=40, choices=SourceType.choices)
    source_id = models.UUIDField()
    document_type = models.CharField(max_length=80)
    description = models.TextField(blank=True, default="")
    people_type = models.CharField(max_length=20, blank=True, default="")
    people_name = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ["date", "reference"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "source_type", "source_id"],
                condition=Q(deleted_at__isnull=True),
                name="unique_active_journal_entry_per_source",
            )
        ]

    def __str__(self):
        return self.reference


class JournalLine(BaseModel):
    journal_entry = models.ForeignKey(
        JournalEntry,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="journal_lines",
    )
    debit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    line_description = models.TextField(blank=True, default="")
    people_type = models.CharField(max_length=20, blank=True, default="")
    people_name = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.journal_entry.reference} - {self.account.code}"


class Expense(BaseModel):
    expense_number = models.CharField(max_length=50)
    date = models.DateField()
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    remarks = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-date", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "expense_number"],
                condition=Q(deleted_at__isnull=True),
                name="unique_active_expense_number_per_tenant",
            )
        ]

    def __str__(self):
        return self.expense_number

    @property
    def bank_account(self):
        """Compatibility shim: bank lives on expense lines after multi-line refactor."""
        line = (
            self.lines.filter(deleted_at__isnull=True)
            .select_related("bank_account")
            .first()
        )
        return line.bank_account if line else None

    @property
    def expense_account(self):
        """Compatibility shim: expense COA lives on expense lines."""
        line = (
            self.lines.filter(deleted_at__isnull=True)
            .select_related("expense_account")
            .first()
        )
        return line.expense_account if line else None


class ExpenseLine(BaseModel):
    expense = models.ForeignKey(
        Expense,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    bank_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="expense_bank_entries",
    )
    expense_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="expense_entries",
    )
    description = models.CharField(max_length=255, blank=True, default="")
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.expense.expense_number} - {self.expense_account.code}"


class BankTransfer(BaseModel):
    transfer_number = models.CharField(max_length=50)
    date = models.DateField()
    from_bank_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="outgoing_bank_transfers",
    )
    to_bank_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="incoming_bank_transfers",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    remarks = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-date", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant_id", "transfer_number"],
                condition=Q(deleted_at__isnull=True),
                name="unique_active_bank_transfer_number_per_tenant",
            )
        ]

    def __str__(self):
        return self.transfer_number


class Inquiry(BaseModel):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        CLOSED = "CLOSED", "Closed"

    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="inquiries",
    )
    user_name = models.CharField(max_length=255)
    subject = models.CharField(max_length=255)
    message = models.TextField()
    admin_reply = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user_name}: {self.subject}"


class AuditLog(BaseModel):
    """Append-only user activity log. Soft-delete is unused."""

    class Action(models.TextChoices):
        LOGIN = "LOGIN", "Login"
        LOGOUT = "LOGOUT", "Logout"
        CREATE = "CREATE", "Create"
        UPDATE = "UPDATE", "Update"
        DELETE = "DELETE", "Delete"

    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    actor_username = models.CharField(max_length=150, blank=True, default="")
    action = models.CharField(max_length=20, choices=Action.choices)
    entity_type = models.CharField(max_length=80, blank=True, default="")
    entity_id = models.CharField(max_length=64, blank=True, default="")
    summary = models.CharField(max_length=500, blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant_id", "-created_at"]),
            models.Index(fields=["tenant_id", "action"]),
            models.Index(fields=["tenant_id", "entity_type"]),
        ]

    def __str__(self):
        return f"{self.actor_username} {self.action} {self.entity_type}"
