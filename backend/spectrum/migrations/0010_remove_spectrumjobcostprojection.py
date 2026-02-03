from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("spectrum", "0009_remove_superintendent_estimator"),
    ]

    operations = [
        migrations.DeleteModel(
            name="SpectrumJobCostProjection",
        ),
    ]
