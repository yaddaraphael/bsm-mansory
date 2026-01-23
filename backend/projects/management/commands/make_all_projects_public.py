"""
Management command to mark all existing projects as public.
This ensures all projects are visible on public portals.
"""
from django.core.management.base import BaseCommand
from projects.models import Project


class Command(BaseCommand):
    help = 'Mark all existing projects as public'

    def handle(self, *args, **options):
        updated_count = Project.objects.filter(is_public=False).update(is_public=True)
        total_public = Project.objects.filter(is_public=True).count()
        
        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully marked {updated_count} projects as public. '
                f'Total public projects: {total_public}'
            )
        )
