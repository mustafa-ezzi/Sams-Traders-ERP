from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import Account



class Command(BaseCommand):
    help = "Seed Chart of Accounts (COA) for SAMS"

    COA_DATA = [
        # ===== LEVEL 1 =====
        {"code": "1000", "name": "Asset", "parent": None, "level": 1, "group": "ASSET", "nature": "DEBIT", "postable": False},
        {"code": "2000", "name": "Liabilities", "parent": None, "level": 1, "group": "LIABILITY", "nature": "CREDIT", "postable": False},
        {"code": "3000", "name": "Equity", "parent": None, "level": 1, "group": "EQUITY", "nature": "CREDIT", "postable": False},
        {"code": "4000", "name": "Cost of Good Sales", "parent": None, "level": 1, "group": "COGS", "nature": "DEBIT", "postable": False},
        {"code": "5000", "name": "Revenue", "parent": None, "level": 1, "group": "REVENUE", "nature": "CREDIT", "postable": False},
        {"code": "6000", "name": "Expenses", "parent": None, "level": 1, "group": "EXPENSE", "nature": "DEBIT", "postable": False},
        {"code": "7000", "name": "Taxation", "parent": None, "level": 1, "group": "TAX", "nature": "DEBIT", "postable": False},
        {"code": "8000", "name": "Purchases", "parent": None, "level": 1, "group": "PURCHASE", "nature": "DEBIT", "postable": False},

        # ===== LEVEL 2 + 3 =====
        {"code": "1100", "name": "Current Asset", "parent": "1000", "level": 2, "group": "ASSET", "nature": "DEBIT", "postable": False},
        {"code": "1110", "name": "Bank", "parent": "1100", "level": 3, "group": "ASSET", "nature": "DEBIT", "postable": True},
        {"code": "1120", "name": "Cash", "parent": "1100", "level": 3, "group": "ASSET", "nature": "DEBIT", "postable": True},
        {"code": "1130", "name": "Petty Cash", "parent": "1100", "level": 3, "group": "ASSET", "nature": "DEBIT", "postable": True},
        {"code": "1140", "name": "A/c Receivables", "parent": "1100", "level": 3, "group": "ASSET", "nature": "DEBIT", "postable": True},
        {"code": "1150", "name": "Inventory", "parent": "1100", "level": 3, "group": "ASSET", "nature": "DEBIT", "postable": True},

        {"code": "1200", "name": "Fixed Asset", "parent": "1000", "level": 2, "group": "ASSET", "nature": "DEBIT", "postable": False},
        {"code": "1210", "name": "Furniture & Fixture", "parent": "1200", "level": 3, "group": "ASSET", "nature": "DEBIT", "postable": True},
        {"code": "1220", "name": "Machinery", "parent": "1200", "level": 3, "group": "ASSET", "nature": "DEBIT", "postable": True},

        {"code": "2100", "name": "Current Liabilities", "parent": "2000", "level": 2, "group": "LIABILITY", "nature": "CREDIT", "postable": False},
        {"code": "2110", "name": "Loan", "parent": "2100", "level": 3, "group": "LIABILITY", "nature": "CREDIT", "postable": True},
        {"code": "2120", "name": "Bank Overdraft", "parent": "2100", "level": 3, "group": "LIABILITY", "nature": "CREDIT", "postable": True},
        {"code": "2130", "name": "A/c Payables", "parent": "2100", "level": 3, "group": "LIABILITY", "nature": "CREDIT", "postable": True},

        {"code": "3100", "name": "Owners Equity", "parent": "3000", "level": 2, "group": "EQUITY", "nature": "CREDIT", "postable": True},
        {"code": "3200", "name": "Retained Earning", "parent": "3000", "level": 2, "group": "EQUITY", "nature": "CREDIT", "postable": True},

        {"code": "4100", "name": "Product xxx", "parent": "4000", "level": 2, "group": "COGS", "nature": "DEBIT", "postable": True},
        {"code": "4200", "name": "Product yyy", "parent": "4000", "level": 2, "group": "COGS", "nature": "DEBIT", "postable": True},
        {"code": "4300", "name": "Product zzz", "parent": "4000", "level": 2, "group": "COGS", "nature": "DEBIT", "postable": True},

        {"code": "5100", "name": "Sales - Parent Co", "parent": "5000", "level": 2, "group": "REVENUE", "nature": "CREDIT", "postable": True},
        {"code": "5200", "name": "Sales - Sister Concern", "parent": "5000", "level": 2, "group": "REVENUE", "nature": "CREDIT", "postable": True},
        {"code": "5300", "name": "Sales Return", "parent": "5000", "level": 2, "group": "REVENUE", "nature": "CREDIT", "postable": True},
        {"code": "5400", "name": "Sales Discounts", "parent": "5000", "level": 2, "group": "REVENUE", "nature": "CREDIT", "postable": True},
        {"code": "5500", "name": "Other Income", "parent": "5000", "level": 2, "group": "REVENUE", "nature": "CREDIT", "postable": True},

        {"code": "6100", "name": "Fixed Expenses", "parent": "6000", "level": 2, "group": "EXPENSE", "nature": "DEBIT", "postable": True},
        {"code": "6200", "name": "Variable Expenses", "parent": "6000", "level": 2, "group": "EXPENSE", "nature": "DEBIT", "postable": True},
        {"code": "6300", "name": "Variable Fixed Expenses", "parent": "6000", "level": 2, "group": "EXPENSE", "nature": "DEBIT", "postable": True},

        {"code": "7100", "name": "VAT/Sales Tax", "parent": "7000", "level": 2, "group": "TAX", "nature": "DEBIT", "postable": True},
        {"code": "7200", "name": "Advance Taxation", "parent": "7000", "level": 2, "group": "TAX", "nature": "DEBIT", "postable": True},

        {"code": "8100", "name": "Products", "parent": "8000", "level": 2, "group": "PURCHASE", "nature": "DEBIT", "postable": True},
        {"code": "8200", "name": "Purchase Returns", "parent": "8000", "level": 2, "group": "PURCHASE", "nature": "DEBIT", "postable": True},
        {"code": "8300", "name": "Purchase Discounts", "parent": "8000", "level": 2, "group": "PURCHASE", "nature": "DEBIT", "postable": True},
    ]

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("Seeding COA..."))

        with transaction.atomic():
            created = 0

            # Step 1: create all parent lookup map
            code_map = {}

            for item in self.COA_DATA:
                parent = None

                if item["parent"]:
                    parent = Account.objects.filter(code=item["parent"]).first()

                obj, is_created = Account.objects.get_or_create(
                    tenant_id=None,  # IMPORTANT: replace if multi-tenant seeding
                    code=item["code"],
                    defaults={
                        "name": item["name"],
                        "parent": parent,
                        "account_group": item["group"],
                        "account_nature": item["nature"],
                        "level": item["level"],
                        "is_postable": item["postable"],
                        "is_active": True,
                    }
                )

                if is_created:
                    created += 1

                code_map[item["code"]] = obj

        self.stdout.write(
            self.style.SUCCESS(f"COA Seeding Completed. Created: {created}")
        )