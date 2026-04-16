from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import Account


class Command(BaseCommand):
    help = "Seed Chart of Accounts (COA) for SAMS"
    TARGET_TENANTS = ("SAMS_TRADERS", "AM_TRADERS")

    COA_DATA = [
        # ===== LEVEL 1 =====
        {
            "code": "1000",
            "name": "Asset",
            "parent": None,
            "level": 1,
            "group": "ASSET",
            "nature": "DEBIT",
            "postable": False,
            "sort_order": 1,
        },
        {
            "code": "2000",
            "name": "Liabilities",
            "parent": None,
            "level": 1,
            "group": "LIABILITY",
            "nature": "CREDIT",
            "postable": False,
            "sort_order": 2,
        },
        {
            "code": "3000",
            "name": "Equity",
            "parent": None,
            "level": 1,
            "group": "EQUITY",
            "nature": "CREDIT",
            "postable": False,
            "sort_order": 3,
        },
        {
            "code": "4000",
            "name": "Cost of Good Sales",
            "parent": None,
            "level": 1,
            "group": "COGS",
            "nature": "DEBIT",
            "postable": False,
            "sort_order": 4,
        },
        {
            "code": "5000",
            "name": "Revenue",
            "parent": None,
            "level": 1,
            "group": "REVENUE",
            "nature": "CREDIT",
            "postable": False,
            "sort_order": 5,
        },
        {
            "code": "6000",
            "name": "Expenses",
            "parent": None,
            "level": 1,
            "group": "EXPENSE",
            "nature": "DEBIT",
            "postable": False,
            "sort_order": 6,
        },
        {
            "code": "7000",
            "name": "Taxation",
            "parent": None,
            "level": 1,
            "group": "TAX",
            "nature": "DEBIT",
            "postable": False,
            "sort_order": 7,
        },
        {
            "code": "8000",
            "name": "Purchases",
            "parent": None,
            "level": 1,
            "group": "PURCHASE",
            "nature": "DEBIT",
            "postable": False,
            "sort_order": 8,
        },
        # ===== LEVEL 2 + 3 =====
        {
            "code": "1100",
            "name": "Current Asset",
            "parent": "1000",
            "level": 2,
            "group": "ASSET",
            "nature": "DEBIT",
            "postable": False,
            "sort_order": 9,
        },
        {
            "code": "1110",
            "name": "Bank",
            "parent": "1100",
            "level": 3,
            "group": "ASSET",
            "nature": "DEBIT",
            "postable": True,
            "sort_order": 10,
        },
        {
            "code": "1120",
            "name": "Cash",
            "parent": "1100",
            "level": 3,
            "group": "ASSET",
            "nature": "DEBIT",
            "postable": True,
            "sort_order": 11,
        },
        {
            "code": "1130",
            "name": "Petty Cash",
            "parent": "1100",
            "level": 3,
            "group": "ASSET",
            "nature": "DEBIT",
            "postable": True,
            "sort_order": 12,
        },
        {
            "code": "1140",
            "name": "A/c Receivables",
            "parent": "1100",
            "level": 3,
            "group": "ASSET",
            "nature": "DEBIT",
            "postable": True,
            "sort_order": 13,
        },
        {
            "code": "1150",
            "name": "Inventory",
            "parent": "1100",
            "level": 3,
            "group": "ASSET",
            "nature": "DEBIT",
            "postable": True,
            "sort_order": 14,
        },
        {
            "code": "1200",
            "name": "Fixed Asset",
            "parent": "1000",
            "level": 2,
            "group": "ASSET",
            "nature": "DEBIT",
            "postable": False,
            "sort_order": 15,
        },
        {
            "code": "1210",
            "name": "Furniture & Fixture",
            "parent": "1200",
            "level": 3,
            "group": "ASSET",
            "nature": "DEBIT",
            "postable": True,
            "sort_order": 16,
        },
        {
            "code": "1220",
            "name": "Machinery",
            "parent": "1200",
            "level": 3,
            "group": "ASSET",
            "nature": "DEBIT",
            "postable": True,
            "sort_order": 17,
        },
        {
            "code": "2100",
            "name": "Current Liabilites",
            "parent": "2000",
            "level": 2,
            "group": "LIABILITY",
            "nature": "CREDIT",
            "postable": False,
            "sort_order": 18,
        },
        {
            "code": "2110",
            "name": "Loan",
            "parent": "2100",
            "level": 3,
            "group": "LIABILITY",
            "nature": "CREDIT",
            "postable": True,
            "sort_order": 19,
        },
        {
            "code": "2120",
            "name": "Bank Overdraft",
            "parent": "2100",
            "level": 3,
            "group": "LIABILITY",
            "nature": "CREDIT",
            "postable": True,
            "sort_order": 20,
        },
        {
            "code": "2130",
            "name": "A/c Payables",
            "parent": "2100",
            "level": 3,
            "group": "LIABILITY",
            "nature": "CREDIT",
            "postable": True,
            "sort_order": 21,
        },
        {
            "code": "3100",
            "name": "Owners Equity",
            "parent": "3000",
            "level": 2,
            "group": "EQUITY",
            "nature": "CREDIT",
            "postable": True,
            "sort_order": 22,
        },
        {
            "code": "3200",
            "name": "Retained Earning",
            "parent": "3000",
            "level": 2,
            "group": "EQUITY",
            "nature": "CREDIT",
            "postable": True,
            "sort_order": 23,
        },
        {
            "code": "4100",
            "name": "Product xxx",
            "parent": "4000",
            "level": 2,
            "group": "COGS",
            "nature": "DEBIT",
            "postable": True,
            "sort_order": 24,
        },
        {
            "code": "4200",
            "name": "Product yyy",
            "parent": "4000",
            "level": 2,
            "group": "COGS",
            "nature": "DEBIT",
            "postable": True,
            "sort_order": 25,
        },
        {
            "code": "4300",
            "name": "Product zzz",
            "parent": "4000",
            "level": 2,
            "group": "COGS",
            "nature": "DEBIT",
            "postable": True,
            "sort_order": 26,
        },
        {
            "code": "5100",
            "name": "Sales - Parent Co",
            "parent": "5000",
            "level": 2,
            "group": "REVENUE",
            "nature": "CREDIT",
            "postable": True,
            "sort_order": 27,
        },
        {
            "code": "5200",
            "name": "Sales - Sistet Concern",
            "parent": "5000",
            "level": 2,
            "group": "REVENUE",
            "nature": "CREDIT",
            "postable": True,
            "sort_order": 28,
        },
        {
            "code": "5300",
            "name": "Sales Return",
            "parent": "5000",
            "level": 2,
            "group": "REVENUE",
            "nature": "CREDIT",
            "postable": True,
            "sort_order": 29,
        },
        {
            "code": "5400",
            "name": "Sales Discounts",
            "parent": "5000",
            "level": 2,
            "group": "REVENUE",
            "nature": "CREDIT",
            "postable": True,
            "sort_order": 30,
        },
        {
            "code": "5500",
            "name": "Other Income",
            "parent": "5000",
            "level": 2,
            "group": "REVENUE",
            "nature": "CREDIT",
            "postable": True,
            "sort_order": 31,
        },
        {
            "code": "6100",
            "name": "Fixed Expenses",
            "parent": "6000",
            "level": 2,
            "group": "EXPENSE",
            "nature": "DEBIT",
            "postable": True,
            "sort_order": 32,
        },
        {
            "code": "6200",
            "name": "Var. Expenses",
            "parent": "6000",
            "level": 2,
            "group": "EXPENSE",
            "nature": "DEBIT",
            "postable": True,
            "sort_order": 33,
        },
        {
            "code": "6300",
            "name": "Var. Fixed Expenses",
            "parent": "6000",
            "level": 2,
            "group": "EXPENSE",
            "nature": "DEBIT",
            "postable": True,
            "sort_order": 34,
        },
        {
            "code": "7100",
            "name": "VAT/Sales Tax",
            "parent": "7000",
            "level": 2,
            "group": "TAX",
            "nature": "DEBIT",
            "postable": True,
            "sort_order": 35,
        },
        {
            "code": "7200",
            "name": "Adv. Taxation",
            "parent": "7000",
            "level": 2,
            "group": "TAX",
            "nature": "DEBIT",
            "postable": True,
            "sort_order": 36,
        },
        {
            "code": "8100",
            "name": "Products",
            "parent": "8000",
            "level": 2,
            "group": "PURCHASE",
            "nature": "DEBIT",
            "postable": True,
            "sort_order": 37,
        },
        {
            "code": "8200",
            "name": "Purchase Returns",
            "parent": "8000",
            "level": 2,
            "group": "PURCHASE",
            "nature": "DEBIT",
            "postable": True,
            "sort_order": 38,
        },
        {
            "code": "8300",
            "name": "Purchase Discounts",
            "parent": "8000",
            "level": 2,
            "group": "PURCHASE",
            "nature": "DEBIT",
            "postable": True,
            "sort_order": 39,
        },
    ]

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("Seeding COA..."))

        with transaction.atomic():
            created = 0
            updated = 0

            for tenant_id in self.TARGET_TENANTS:
                code_map = {}

                for item in self.COA_DATA:
                    parent = code_map.get(item["parent"]) if item["parent"] else None

                    defaults = {
                        "code": item["code"],  # ✅ ADD THIS
                        "name": item["name"],
                        "parent": parent,
                        "account_group": item["group"],
                        "account_nature": item["nature"],
                        "level": item["level"],
                        "is_postable": item["postable"],
                        "is_active": True,
                        "sort_order": item["sort_order"],
                        "deleted_at": None,
                    }

                    obj = (
                        Account.objects.filter(
                            tenant_id=tenant_id,
                            code=item["code"],
                        )
                        .order_by("created_at")
                        .first()
                    )

                    if obj is None:
                        obj = Account.objects.create(
                            tenant_id=tenant_id,
                            **defaults,
                        )
                        created += 1
                    else:
                        has_changes = False
                        for field, value in defaults.items():
                            if getattr(obj, field) != value:
                                setattr(obj, field, value)
                                has_changes = True

                        if has_changes:
                            obj.save()
                            updated += 1

                    code_map[item["code"]] = obj

        self.stdout.write(
            self.style.SUCCESS(
                f"COA Seeding Completed. Created: {created}, Updated: {updated}"
            )
        )
