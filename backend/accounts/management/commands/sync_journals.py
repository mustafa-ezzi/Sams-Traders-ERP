from django.core.management.base import BaseCommand

from accounts.journal import sync_all_journals


class Command(BaseCommand):
    help = "Backfill and rebuild journal entries from active purchase and sales documents."

    def handle(self, *args, **options):
        sync_all_journals()
        self.stdout.write(self.style.SUCCESS("Journal sync completed successfully."))
