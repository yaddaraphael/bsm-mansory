from django.db import models
from django.core.validators import MaxLengthValidator


class SpectrumJob(models.Model):
    """
    Stores job information imported from Spectrum's GetJob and GetJobMain services.
    """
    # GetJob fields
    company_code = models.CharField(max_length=3, help_text="Valid Spectrum Company")
    job_number = models.CharField(max_length=10, help_text="Job File Maintenance")
    job_description = models.CharField(max_length=50, blank=True, null=True)  # Increased from 25 to 50
    division = models.CharField(max_length=5, blank=True, null=True)
    address_1 = models.CharField(max_length=50, blank=True, null=True)  # Increased from 30 to 50
    address_2 = models.CharField(max_length=50, blank=True, null=True)  # Increased from 30 to 50
    city = models.CharField(max_length=50, blank=True, null=True)  # Increased from 25 to 50
    state = models.CharField(max_length=2, blank=True, null=True)
    zip_code = models.CharField(max_length=10, blank=True, null=True)
    project_manager = models.CharField(max_length=15, blank=True, null=True)
    certified_flag = models.CharField(max_length=1, blank=True, null=True)
    customer_code = models.CharField(max_length=10, blank=True, null=True)
    status_code = models.CharField(
        max_length=1,
        blank=True,
        null=True,
        help_text="(A)ctive, (I)nactive or (C)omplete"
    )
    work_state_tax_code = models.CharField(max_length=10, blank=True, null=True)
    contract_number = models.CharField(max_length=30, blank=True, null=True)  # Updated from 15 to 30 for GetJobMain
    cost_center = models.CharField(max_length=10, blank=True, null=True)
    
    # GetJobMain additional fields
    phone = models.CharField(max_length=14, blank=True, null=True, help_text="Telephone")
    fax_phone = models.CharField(max_length=14, blank=True, null=True, help_text="Fax")
    job_site_phone = models.CharField(max_length=14, blank=True, null=True, help_text="Site phone")
    customer_name = models.CharField(max_length=30, blank=True, null=True)
    original_contract = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True, help_text="Original Contract (Numeric 14)")
    owner_name = models.CharField(max_length=50, blank=True, null=True)
    wo_site = models.CharField(max_length=10, blank=True, null=True, help_text="Site")
    comment = models.TextField(max_length=250, blank=True, null=True)
    price_method_code = models.CharField(
        max_length=1,
        blank=True,
        null=True,
        help_text="(F)ixed Price; (T)ime & Material; (C)ost Plus or (U)nit Price"
    )
    total_units = models.DecimalField(max_digits=9, decimal_places=2, blank=True, null=True, help_text="Job units (Numeric 9)")
    unit_of_measure = models.CharField(max_length=5, blank=True, null=True)
    latitude = models.DecimalField(max_digits=11, decimal_places=8, blank=True, null=True, help_text="Latitude (Numeric 11)")
    longitude = models.DecimalField(max_digits=11, decimal_places=8, blank=True, null=True, help_text="Longitude (Numeric 11)")
    legal_desc = models.TextField(max_length=350, blank=True, null=True, help_text="Legal Description")
    field_1 = models.CharField(max_length=30, blank=True, null=True, help_text="Placeholder for future fields")
    field_2 = models.CharField(max_length=30, blank=True, null=True, help_text="Placeholder for future fields")
    field_3 = models.CharField(max_length=30, blank=True, null=True, help_text="Placeholder for future fields")
    field_4 = models.CharField(max_length=30, blank=True, null=True, help_text="Placeholder for future fields")
    field_5 = models.CharField(max_length=30, blank=True, null=True, help_text="Placeholder for future fields")
    
    # Error fields (for error handling)
    error_code = models.CharField(max_length=1, blank=True, null=True, help_text="Error Code if any")
    error_description = models.CharField(max_length=250, blank=True, null=True, help_text="Error Description if any")
    error_column = models.CharField(max_length=100, blank=True, null=True, help_text="Error Column if any")
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_synced_at = models.DateTimeField(null=True, blank=True, help_text="Last time this job was synced from Spectrum")
    
    class Meta:
        db_table = 'spectrum_job'
        unique_together = [['company_code', 'job_number']]
        indexes = [
            models.Index(fields=['company_code', 'job_number']),
            models.Index(fields=['status_code']),
            models.Index(fields=['project_manager']),
        ]
        verbose_name = 'Spectrum Job'
        verbose_name_plural = 'Spectrum Jobs'
    
    def __str__(self):
        return f"{self.company_code}-{self.job_number}: {self.job_description or 'N/A'}"


class SpectrumJobContact(models.Model):
    """
    Stores job contact information imported from Spectrum's GetJobContact service.
    """
    company_code = models.CharField(max_length=3, help_text="Valid Spectrum Company")
    job_number = models.CharField(max_length=10, help_text="Job File Maintenance")
    job_description = models.CharField(max_length=25, blank=True, null=True)
    status_code = models.CharField(max_length=1, blank=True, null=True, help_text="Job status")
    project_manager = models.CharField(max_length=15, blank=True, null=True)
    cost_center = models.CharField(max_length=10, blank=True, null=True)
    
    # Contact fields
    contact_id = models.IntegerField(help_text="Contact Id (Number 10)")
    first_name = models.CharField(max_length=20, blank=True, null=True)
    last_name = models.CharField(max_length=30, blank=True, null=True)
    title = models.CharField(max_length=50, blank=True, null=True)
    
    # Contact address
    addr_1 = models.CharField(max_length=30, blank=True, null=True, help_text="Contact Primary Address 1")
    addr_2 = models.CharField(max_length=30, blank=True, null=True, help_text="Contact Primary Address 2")
    addr_city = models.CharField(max_length=25, blank=True, null=True)
    addr_state = models.CharField(max_length=2, blank=True, null=True)
    addr_zip = models.CharField(max_length=10, blank=True, null=True)
    addr_country = models.CharField(max_length=25, blank=True, null=True)
    
    # Contact communication
    phone_number = models.CharField(max_length=14, blank=True, null=True, help_text="Contact Primary Phone")
    email1 = models.CharField(max_length=80, blank=True, null=True, help_text="Contact Email 1")
    email2 = models.CharField(max_length=80, blank=True, null=True, help_text="Contact Email 2")
    email3 = models.CharField(max_length=80, blank=True, null=True, help_text="Contact Email 3")
    remarks = models.TextField(max_length=250, blank=True, null=True)
    
    # Contact status and organization
    status = models.CharField(max_length=1, blank=True, null=True, help_text="Contact Status")
    otype = models.CharField(max_length=1, blank=True, null=True, help_text="Organization Type: V(endor), C(ustomer), E(mployee) or O(ther)")
    oname = models.CharField(max_length=40, blank=True, null=True, help_text="Organization Name")
    ocity = models.CharField(max_length=25, blank=True, null=True, help_text="Organization City")
    ostate = models.CharField(max_length=2, blank=True, null=True, help_text="Organization State")
    ostatus = models.CharField(max_length=1, blank=True, null=True, help_text="Organization Status")
    
    # Error fields
    error_code = models.CharField(max_length=1, blank=True, null=True)
    error_description = models.CharField(max_length=250, blank=True, null=True)
    error_column = models.CharField(max_length=100, blank=True, null=True)
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'spectrum_job_contact'
        unique_together = [['company_code', 'job_number', 'contact_id']]
        indexes = [
            models.Index(fields=['company_code', 'job_number']),
            models.Index(fields=['contact_id']),
            models.Index(fields=['last_name']),
        ]
        verbose_name = 'Spectrum Job Contact'
        verbose_name_plural = 'Spectrum Job Contacts'
    
    def __str__(self):
        return f"{self.company_code}-{self.job_number}: {self.first_name} {self.last_name} (ID: {self.contact_id})"


class SpectrumJobDates(models.Model):
    """
    Stores job dates information imported from Spectrum's GetJobDates service.
    """
    company_code = models.CharField(max_length=3, help_text="Valid Spectrum Company")
    job_number = models.CharField(max_length=10, help_text="Job File Maintenance")
    job_description = models.CharField(max_length=25, blank=True, null=True)
    
    # Date fields
    est_start_date = models.DateField(blank=True, null=True, help_text="Estimated Start Date")
    est_complete_date = models.DateField(blank=True, null=True, help_text="Estimated Complete Date")
    projected_complete_date = models.DateField(blank=True, null=True, help_text="Projected Complete Date")
    create_date = models.DateField(blank=True, null=True, help_text="Job Created Date")
    start_date = models.DateField(blank=True, null=True, help_text="Actual Start Date")
    complete_date = models.DateField(blank=True, null=True, help_text="Actual Complete Date")
    
    # Placeholder fields
    field_1 = models.CharField(max_length=10, blank=True, null=True, help_text="Place holder for other dates")
    field_2 = models.CharField(max_length=10, blank=True, null=True, help_text="Place holder for other dates")
    field_3 = models.CharField(max_length=10, blank=True, null=True, help_text="Place holder for other dates")
    field_4 = models.CharField(max_length=10, blank=True, null=True, help_text="Place holder for other dates")
    field_5 = models.CharField(max_length=10, blank=True, null=True, help_text="Place holder for other dates")
    
    # Error fields
    error_code = models.CharField(max_length=1, blank=True, null=True, help_text="Error Code if any")
    error_description = models.CharField(max_length=250, blank=True, null=True, help_text="Error Description if any")
    error_column = models.CharField(max_length=100, blank=True, null=True, help_text="Error Column if any")
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_synced_at = models.DateTimeField(null=True, blank=True, help_text="Last time this job dates was synced from Spectrum")
    
    class Meta:
        db_table = 'spectrum_job_dates'
        unique_together = [['company_code', 'job_number']]
        indexes = [
            models.Index(fields=['company_code', 'job_number']),
        ]
        verbose_name = 'Spectrum Job Dates'
        verbose_name_plural = 'Spectrum Job Dates'
    
    def __str__(self):
        return f"{self.company_code}-{self.job_number}: Dates"


class SpectrumPhase(models.Model):
    """
    Stores phase information imported from Spectrum's GetPhase service.
    """
    company_code = models.CharField(max_length=3, help_text="Valid Spectrum Company")
    job_number = models.CharField(max_length=10, help_text="Job File Maintenance")
    phase_code = models.CharField(max_length=20, help_text="Phase Number")
    cost_type = models.CharField(max_length=3, blank=True, null=True, help_text="Cost Type File Maintenance")
    description = models.CharField(max_length=25, blank=True, null=True)
    status_code = models.CharField(
        max_length=1,
        blank=True,
        null=True,
        help_text="(A)ctive, (I)nactive or (C)omplete"
    )
    unit_of_measure = models.CharField(max_length=3, blank=True, null=True)
    
    # JTD (Job To Date) fields
    jtd_quantity = models.DecimalField(max_digits=11, decimal_places=2, blank=True, null=True, help_text="JTD Quantity")
    jtd_hours = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True, help_text="JTD Hours")
    jtd_actual_dollars = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True, help_text="JTD Cost")
    
    # Projected fields
    projected_quantity = models.DecimalField(max_digits=11, decimal_places=2, blank=True, null=True, help_text="Projected Quantity")
    projected_hours = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True, help_text="Projected Hours")
    projected_dollars = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True, help_text="Projected Cost")
    
    # Estimated fields
    estimated_quantity = models.DecimalField(max_digits=11, decimal_places=2, blank=True, null=True, help_text="Estimated Quantity")
    estimated_hours = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True, help_text="Estimated Hours")
    current_estimated_dollars = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True, help_text="Estimated Cost")
    
    cost_center = models.CharField(max_length=10, blank=True, null=True, help_text="Phase Cost Center")
    
    # Error fields
    error_code = models.CharField(max_length=1, blank=True, null=True, help_text="Error Code if any")
    error_description = models.CharField(max_length=250, blank=True, null=True, help_text="Error Description if any")
    error_column = models.CharField(max_length=100, blank=True, null=True, help_text="Error Column if any")
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_synced_at = models.DateTimeField(null=True, blank=True, help_text="Last time this phase was synced from Spectrum")
    
    class Meta:
        db_table = 'spectrum_phase'
        unique_together = [['company_code', 'job_number', 'phase_code', 'cost_type']]
        indexes = [
            models.Index(fields=['company_code', 'job_number']),
            models.Index(fields=['status_code']),
            models.Index(fields=['cost_type']),
        ]
        verbose_name = 'Spectrum Phase'
        verbose_name_plural = 'Spectrum Phases'
    
    def __str__(self):
        return f"{self.company_code}-{self.job_number}: {self.phase_code} ({self.cost_type})"


class SpectrumPhaseEnhanced(models.Model):
    """
    Stores enhanced phase information imported from Spectrum's GetPhaseEnhanced service.
    Extends SpectrumPhase with additional fields.
    """
    company_code = models.CharField(max_length=3, help_text="Valid Spectrum Company")
    job_number = models.CharField(max_length=10, help_text="Job File Maintenance")
    phase_code = models.CharField(max_length=20, help_text="Phase Number")
    cost_type = models.CharField(max_length=3, blank=True, null=True, help_text="Cost Type File Maintenance")
    description = models.CharField(max_length=25, blank=True, null=True)
    status_code = models.CharField(
        max_length=1,
        blank=True,
        null=True,
        help_text="(A)ctive, (I)nactive or (C)omplete"
    )
    unit_of_measure = models.CharField(max_length=3, blank=True, null=True)
    
    # JTD (Job To Date) fields
    jtd_quantity = models.DecimalField(max_digits=11, decimal_places=2, blank=True, null=True, help_text="JTD Quantity")
    jtd_hours = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True, help_text="JTD Hours")
    jtd_actual_dollars = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True, help_text="JTD Cost")
    
    # Projected fields
    projected_quantity = models.DecimalField(max_digits=11, decimal_places=2, blank=True, null=True, help_text="Projected Quantity")
    projected_hours = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True, help_text="Projected Hours")
    projected_dollars = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True, help_text="Projected Cost")
    
    # Estimated fields
    estimated_quantity = models.DecimalField(max_digits=11, decimal_places=2, blank=True, null=True, help_text="Estimated Quantity")
    estimated_hours = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True, help_text="Estimated Hours")
    current_estimated_dollars = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True, help_text="Estimated Cost")
    
    cost_center = models.CharField(max_length=10, blank=True, null=True, help_text="Phase Cost Center")
    
    # Enhanced fields (additional to GetPhase)
    price_method_code = models.CharField(
        max_length=1,
        blank=True,
        null=True,
        help_text="(F)ixed Price; (T)ime & Material; (C)ost Plus; (U)nit Price OR (J)ob default"
    )
    complete_date = models.DateField(blank=True, null=True, help_text="Complete Date")
    start_date = models.DateField(blank=True, null=True, help_text="Estimated Start Date")
    end_date = models.DateField(blank=True, null=True, help_text="Estimated End Date")
    comment = models.TextField(max_length=250, blank=True, null=True)
    
    # Error fields
    error_code = models.CharField(max_length=1, blank=True, null=True, help_text="Error Code if any")
    error_description = models.CharField(max_length=250, blank=True, null=True, help_text="Error Description if any")
    error_column = models.CharField(max_length=100, blank=True, null=True, help_text="Error Column if any")
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_synced_at = models.DateTimeField(null=True, blank=True, help_text="Last time this enhanced phase was synced from Spectrum")
    
    class Meta:
        db_table = 'spectrum_phase_enhanced'
        unique_together = [['company_code', 'job_number', 'phase_code', 'cost_type']]
        indexes = [
            models.Index(fields=['company_code', 'job_number']),
            models.Index(fields=['status_code']),
            models.Index(fields=['cost_type']),
        ]
        verbose_name = 'Spectrum Phase Enhanced'
        verbose_name_plural = 'Spectrum Phases Enhanced'
    
    def __str__(self):
        return f"{self.company_code}-{self.job_number}: {self.phase_code} ({self.cost_type}) - Enhanced"


class SpectrumJobCostProjection(models.Model):
    """
    Stores job cost projection information imported from Spectrum's JobCostProjections service.
    This is used to POST/UPDATE projections to Spectrum.
    """
    company_code = models.CharField(max_length=3, help_text="Valid Spectrum Company")
    job_number = models.CharField(max_length=10, help_text="Job File Maintenance")
    phase_code = models.CharField(max_length=20, help_text="Phase number (no dashes)")
    cost_type = models.CharField(max_length=3, help_text="Cost type")
    transaction_date = models.DateField(help_text="Transaction Date (MM/DD/CCYY)")
    
    # Projection values (at least one required: Amount, Projected_Hours, or Projected_Quantity)
    amount = models.DecimalField(
        max_digits=14, 
        decimal_places=2, 
        blank=True, 
        null=True, 
        help_text="Projected Dollars At Completion (allows negative)"
    )
    projected_hours = models.DecimalField(
        max_digits=14, 
        decimal_places=2, 
        blank=True, 
        null=True, 
        help_text="Projected Hours At Completion (allows negative)"
    )
    projected_quantity = models.DecimalField(
        max_digits=14, 
        decimal_places=2, 
        blank=True, 
        null=True, 
        help_text="Projected Quantity At Completion (allows negative)"
    )
    
    # Optional fields
    note = models.CharField(max_length=80, blank=True, null=True, help_text="Memo")
    operator = models.CharField(max_length=3, blank=True, null=True, help_text="Operator code")
    
    # Error fields (for error handling from Spectrum)
    error_code = models.CharField(max_length=1, blank=True, null=True, help_text="Error Code if any")
    error_description = models.CharField(max_length=250, blank=True, null=True, help_text="Error Description if any")
    error_column = models.CharField(max_length=100, blank=True, null=True, help_text="Error Column if any")
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_synced_at = models.DateTimeField(null=True, blank=True, help_text="Last time this projection was synced to Spectrum")
    
    class Meta:
        db_table = 'spectrum_job_cost_projection'
        unique_together = [['company_code', 'job_number', 'phase_code', 'cost_type', 'transaction_date']]
        indexes = [
            models.Index(fields=['company_code', 'job_number']),
            models.Index(fields=['transaction_date']),
            models.Index(fields=['phase_code', 'cost_type']),
        ]
        verbose_name = 'Spectrum Job Cost Projection'
        verbose_name_plural = 'Spectrum Job Cost Projections'
    
    def __str__(self):
        return f"{self.company_code}-{self.job_number}: {self.phase_code} ({self.cost_type}) - {self.transaction_date}"


class SpectrumJobUDF(models.Model):
    """
    Stores job user-defined fields information imported from Spectrum's GetJobUDF service.
    """
    company_code = models.CharField(max_length=3, help_text="Valid Spectrum Company")
    job_number = models.CharField(max_length=10, help_text="Job File Maintenance")
    
    # User Defined Fields (UDF1 through UDF20)
    # These can be Numeric, Date, or Text depending on how they're configured in Spectrum
    udf1 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 1")
    udf2 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 2")
    udf3 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 3")
    udf4 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 4")
    udf5 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 5")
    udf6 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 6")
    udf7 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 7")
    udf8 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 8")
    udf9 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 9")
    udf10 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 10")
    udf11 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 11")
    udf12 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 12")
    udf13 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 13")
    udf14 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 14")
    udf15 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 15")
    udf16 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 16")
    udf17 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 17")
    udf18 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 18")
    udf19 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 19")
    udf20 = models.CharField(max_length=20, blank=True, null=True, help_text="User Defined Field 20")
    
    # Error fields
    error_code = models.CharField(max_length=1, blank=True, null=True, help_text="Error Code if any")
    error_description = models.CharField(max_length=250, blank=True, null=True, help_text="Error Description if any")
    error_column = models.CharField(max_length=100, blank=True, null=True, help_text="Error Column if any")
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_synced_at = models.DateTimeField(null=True, blank=True, help_text="Last time this UDF was synced from Spectrum")
    
    class Meta:
        db_table = 'spectrum_job_udf'
        unique_together = [['company_code', 'job_number']]
        indexes = [
            models.Index(fields=['company_code', 'job_number']),
        ]
        verbose_name = 'Spectrum Job UDF'
        verbose_name_plural = 'Spectrum Job UDFs'
    
    def __str__(self):
        return f"{self.company_code}-{self.job_number}: UDF"




class SpectrumSyncRun(models.Model):
    """
    Tracks each Spectrum sync run (manual or scheduled) for audit + troubleshooting.
    """
    RUN_MANUAL = "MANUAL"
    RUN_AUTO = "AUTO"

    STATUS_RUNNING = "RUNNING"
    STATUS_SUCCESS = "SUCCESS"
    STATUS_FAILED = "FAILED"

    run_type = models.CharField(max_length=10, choices=[(RUN_MANUAL, RUN_MANUAL), (RUN_AUTO, RUN_AUTO)], default=RUN_AUTO)
    status = models.CharField(max_length=10, choices=[(STATUS_RUNNING, STATUS_RUNNING), (STATUS_SUCCESS, STATUS_SUCCESS), (STATUS_FAILED, STATUS_FAILED)], default=STATUS_RUNNING)

    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(blank=True, null=True)

    company_code = models.CharField(max_length=3, blank=True, null=True)
    divisions = models.JSONField(default=list, blank=True)  # list[str]
    status_code = models.CharField(max_length=5, blank=True, null=True)

    stats = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True, null=True)

    class Meta:
        db_table = "spectrum_sync_run"
        indexes = [
            models.Index(fields=["started_at"]),
            models.Index(fields=["status"]),
            models.Index(fields=["run_type"]),
        ]

    def __str__(self) -> str:
        return f"SpectrumSyncRun({self.id}) {self.run_type} {self.status}"


class SpectrumRawPayload(models.Model):
    """
    Optional raw payload storage (compressed XML) for auditing and re-processing.

    NOTE: This can grow quickly. Use the cleanup command / retention settings.
    """
    run = models.ForeignKey(SpectrumSyncRun, on_delete=models.CASCADE, related_name="payloads")
    endpoint = models.CharField(max_length=50)
    request_params = models.JSONField(default=dict, blank=True)

    # Compressed XML stored as bytes (gzip). Use utils to compress/decompress.
    raw_xml_gzip = models.BinaryField(blank=True, null=True)

    # Lightweight parsed summary to make searching/debugging easier
    item_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "spectrum_raw_payload"
        indexes = [
            models.Index(fields=["endpoint", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"SpectrumRawPayload({self.id}) {self.endpoint} items={self.item_count}"
