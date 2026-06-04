from django.core.management.base import BaseCommand

from accounts.models import Account


class Command(BaseCommand):
    help = "Fix account types for existing accounts based on their code"

    # Mapping of account codes/patterns to their correct account_type
    ACCOUNT_TYPE_MAPPING = {
        "1110": Account.AccountType.BANK,
        "1120": Account.AccountType.CASH,
        "1130": Account.AccountType.CASH,
        "1140": Account.AccountType.RECEIVABLE,
        "1150": Account.AccountType.INVENTORY,
        "2130": Account.AccountType.PAYABLE,
        "5100": Account.AccountType.REVENUE,
        "5200": Account.AccountType.REVENUE,
        "5300": Account.AccountType.REVENUE,
        "5400": Account.AccountType.REVENUE,
        "5500": Account.AccountType.REVENUE,
        "8100": Account.AccountType.COGS,
        "8200": Account.AccountType.COGS,
        "8300": Account.AccountType.COGS,
    }

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("Fixing account types..."))

        updated_count = 0
        for code, account_type in self.ACCOUNT_TYPE_MAPPING.items():
            updated = Account.objects.filter(code=code).update(account_type=account_type)
            if updated > 0:
                self.stdout.write(
                    self.style.SUCCESS(f"  Updated {updated} account(s) with code {code} to type {account_type}")
                )
                updated_count += updated

        self.stdout.write(
            self.style.SUCCESS(f"\n✓ Fixed account types for {updated_count} total accounts")
        )
