# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('meetings', '0002_meetingjob_handoff_from_estimator_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='meetingjob',
            name='saturdays',
            field=models.BooleanField(blank=True, help_text='Saturday work (Yes/No)', null=True),
        ),
        migrations.AddField(
            model_name='meetingjob',
            name='full_weekends',
            field=models.BooleanField(blank=True, help_text='Full weekends work (Yes/No)', null=True),
        ),
        migrations.AddField(
            model_name='meetingjob',
            name='selected_scope',
            field=models.CharField(blank=True, help_text='Selected scope type for this meeting', max_length=50, null=True),
        ),
    ]
