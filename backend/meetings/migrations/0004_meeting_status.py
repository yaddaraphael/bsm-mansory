# Generated migration for adding status field to Meeting model

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('meetings', '0003_meetingjob_saturdays_full_weekends_selected_scope'),
    ]

    operations = [
        migrations.AddField(
            model_name='meeting',
            name='status',
            field=models.CharField(
                choices=[('DRAFT', 'Draft'), ('COMPLETED', 'Completed')],
                default='DRAFT',
                help_text='Meeting status - Draft or Completed',
                max_length=20
            ),
        ),
    ]
