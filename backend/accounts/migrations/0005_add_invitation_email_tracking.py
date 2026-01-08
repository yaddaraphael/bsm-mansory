# Generated manually
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_user_notification_preferences'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='invitation_email_sent',
            field=models.BooleanField(default=False, help_text='Whether invitation email was sent successfully'),
        ),
        migrations.AddField(
            model_name='user',
            name='invitation_email_sent_at',
            field=models.DateTimeField(blank=True, help_text='When invitation email was last sent', null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='invitation_email_error',
            field=models.TextField(blank=True, help_text='Error message if email failed to send', null=True),
        ),
    ]

