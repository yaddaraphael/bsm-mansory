from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("spectrum", "0008_rename_spectrum_ra_endpoin_3a96d4_idx_spectrum_ra_endpoin_0e0c02_idx_and_more"),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name="spectrumjob",
            name="spectrum_jo_superin_f49026_idx",
        ),
        migrations.RemoveField(
            model_name="spectrumjob",
            name="superintendent",
        ),
        migrations.RemoveField(
            model_name="spectrumjob",
            name="estimator",
        ),
        migrations.RemoveField(
            model_name="spectrumjobcontact",
            name="superintendent",
        ),
        migrations.RemoveField(
            model_name="spectrumjobcontact",
            name="estimator",
        ),
    ]
