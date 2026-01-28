from django.db import migrations


def add_kc_residential(apps, schema_editor):
    Branch = apps.get_model('branches', 'Branch')
    Branch.objects.get_or_create(
        spectrum_division_code='115',
        defaults={
            'name': 'KC Residential',
            'code': 'KCRES',
            'status': 'ACTIVE',
        },
    )


def remove_kc_residential(apps, schema_editor):
    Branch = apps.get_model('branches', 'Branch')
    Branch.objects.filter(spectrum_division_code='115').delete()


class Migration(migrations.Migration):
    dependencies = [
        ('branches', '0004_branch_portal_password'),
    ]

    operations = [
        migrations.RunPython(add_kc_residential, reverse_code=remove_kc_residential),
    ]
