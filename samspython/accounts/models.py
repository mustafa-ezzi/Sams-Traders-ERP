from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.db.models import Q
from django.contrib.auth.models import AbstractUser

from common.models import BaseModel


class User(AbstractUser):
    tenant_id = models.CharField(max_length=50)


class Account(BaseModel):
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

        parent = self.parent
        while parent:
            if parent == self:
                raise ValidationError("Circular parent relationship detected.")
            parent = parent.parent

        if self.pk and self.is_postable and self.children.exists():
            raise ValidationError("Postable account cannot have children.")

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
        self.deleted_at = timezone.now()
        self.save()

    @property
    def is_leaf(self):
        return not self.children.exists()
