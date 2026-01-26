"""
Management command to list all superusers in the system.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone


class Command(BaseCommand):
    help = 'List all superusers in the system'

    def add_arguments(self, parser):
        parser.add_argument(
            '--detailed',
            action='store_true',
            help='Show detailed information about each superuser',
        )

    def handle(self, *args, **options):
        User = get_user_model()
        superusers = User.objects.filter(is_superuser=True).order_by('date_joined')
        
        if not superusers.exists():
            self.stdout.write(
                self.style.WARNING('No superusers found in the system.')
            )
            return
        
        self.stdout.write(
            self.style.SUCCESS(f'\nFound {superusers.count()} superuser(s):\n')
        )
        
        for idx, user in enumerate(superusers, 1):
            if options['detailed']:
                self.stdout.write(f"{idx}. {user.username}")
                self.stdout.write(f"   Email: {user.email or 'N/A'}")
                self.stdout.write(f"   Role: {user.role}")
                self.stdout.write(f"   Scope: {user.scope}")
                self.stdout.write(f"   Staff: {'Yes' if user.is_staff else 'No'}")
                self.stdout.write(f"   Active: {'Yes' if user.is_active else 'No'}")
                self.stdout.write(f"   Date Joined: {user.date_joined.strftime('%Y-%m-%d %H:%M:%S') if user.date_joined else 'N/A'}")
                if user.last_login:
                    self.stdout.write(f"   Last Login: {user.last_login.strftime('%Y-%m-%d %H:%M:%S')}")
                else:
                    self.stdout.write(f"   Last Login: Never")
                if user.division:
                    self.stdout.write(f"   Division: {user.division.name}")
                self.stdout.write('')
            else:
                status = 'Active' if user.is_active else 'Inactive'
                last_login = user.last_login.strftime('%Y-%m-%d') if user.last_login else 'Never'
                self.stdout.write(
                    f"{idx}. {user.username:<20} | {user.email or 'N/A':<30} | "
                    f"Role: {user.role:<20} | Status: {status:<8} | Last Login: {last_login}"
                )
        
        self.stdout.write('')
