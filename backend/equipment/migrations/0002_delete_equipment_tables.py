# Generated migration to delete equipment tables
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('equipment', '0001_initial'),
    ]

    operations = [
        migrations.DeleteModel(
            name='EquipmentTransfer',
        ),
        migrations.DeleteModel(
            name='EquipmentAssignment',
        ),
        migrations.DeleteModel(
            name='Equipment',
        ),
    ]
