from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()

class Command(BaseCommand):
    help = "Seed default tenant users"

    def handle(self, *args, **kwargs):
        defaults = [
            {
                "email": "am@test.com",
                "password": "amtraders123",
                "tenant_id": "AM_TRADERS",
                "username": "am_user"
            },
            {
                "email": "sams@test.com",
                "password": "sams123",
                "tenant_id": "SAMS_TRADERS",
                "username": "sams_user"
            }
        ]

        for u in defaults:
            if not User.objects.filter(email=u["email"]).exists():
                user = User.objects.create_user(
                    username=u["username"],
                    email=u["email"],
                    password=u["password"],
                    tenant_id=u["tenant_id"]
                )
                self.stdout.write(self.style.SUCCESS(f'User created: {u["email"]}'))
            else:
                self.stdout.write(self.style.WARNING(f'User already exists: {u["email"]}'))