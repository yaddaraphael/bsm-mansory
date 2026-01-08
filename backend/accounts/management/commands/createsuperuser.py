"""
Custom createsuperuser command that sets role to ROOT_SUPERADMIN.
This overrides Django's default createsuperuser to ensure superusers
get the ROOT_SUPERADMIN role instead of the default WORKER role.
"""
from django.contrib.auth.management.commands.createsuperuser import Command as BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone


class Command(BaseCommand):
    help = 'Create a superuser with ROOT_SUPERADMIN role'

    def handle(self, *args, **options):
        User = get_user_model()
        
        # Store username before calling parent
        username = options.get('username')
        
        # Call parent handle to create the user
        # This handles all the interactive prompts
        try:
            # Call parent to create user
            super().handle(*args, **options)
            
            # Find the newly created user
            # If username was provided, use it; otherwise find the most recently created superuser
            if username:
                try:
                    user = User.objects.get(username=username)
                except User.DoesNotExist:
                    # If username wasn't found, get the most recent superuser
                    user = User.objects.filter(is_superuser=True).order_by('-date_joined').first()
            else:
                # Get the most recently created superuser (created in last 5 seconds)
                recent_time = timezone.now() - timezone.timedelta(seconds=5)
                user = User.objects.filter(
                    is_superuser=True,
                    date_joined__gte=recent_time
                ).order_by('-date_joined').first()
            
            if user:
                # Update role and scope
                old_role = user.role
                user.role = 'ROOT_SUPERADMIN'
                user.scope = 'COMPANY_WIDE'
                user.is_staff = True
                user.is_superuser = True
                user.save(update_fields=['role', 'scope', 'is_staff', 'is_superuser'])
                
                self.stdout.write(
                    self.style.SUCCESS(
                        f'\n✓ Successfully created superuser "{user.username}" with ROOT_SUPERADMIN role.'
                    )
                )
                if old_role and old_role != 'ROOT_SUPERADMIN':
                    self.stdout.write(
                        self.style.WARNING(
                            f'  Note: Role was automatically changed from {old_role} to ROOT_SUPERADMIN.'
                        )
                    )
            else:
                self.stdout.write(
                    self.style.WARNING(
                        '\n⚠ Could not automatically find created user to update role.'
                    )
                )
                self.stdout.write(
                    self.style.WARNING(
                        '  Please manually set the role to ROOT_SUPERADMIN in Django admin.'
                    )
                )
        except KeyboardInterrupt:
            self.stdout.write('\n\nOperation cancelled.')
            raise
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'\n✗ Error creating superuser: {str(e)}')
            )
            raise
