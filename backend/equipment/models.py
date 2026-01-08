from django.db import models
from django.utils import timezone
from datetime import timedelta
from accounts.models import User
from projects.models import Project
from branches.models import Branch


class Equipment(models.Model):
    """
    Equipment master registry.
    """
    EQUIPMENT_STATUS_CHOICES = [
        ('IN_YARD', 'In Yard'),
        ('ON_SITE', 'On Site'),
        ('IN_TRANSIT', 'In Transit'),
        ('MAINTENANCE', 'Maintenance'),
    ]
    
    asset_number = models.CharField(max_length=50, unique=True, db_index=True)
    type = models.CharField(max_length=100, help_text="Equipment type/category")
    billing_date = models.DateField(null=True, blank=True)
    cycle_length = models.IntegerField(default=28, help_text="Billing cycle length in days")
    status = models.CharField(
        max_length=20,
        choices=EQUIPMENT_STATUS_CHOICES,
        default='IN_YARD'
    )
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Equipment'
        verbose_name_plural = 'Equipment'
        ordering = ['asset_number']
    
    def __str__(self):
        return f"{self.asset_number} - {self.type}"
    
    @property
    def cycle_date(self):
        """Calculate cycle date from billing date + cycle length."""
        if not self.billing_date:
            return None
        return self.billing_date + timedelta(days=self.cycle_length)
    
    @property
    def current_site(self):
        """Get current site assignment."""
        current_assignment = self.assignments.filter(
            status='ACTIVE'
        ).order_by('-assigned_on').first()
        if current_assignment:
            return {
                'project': current_assignment.project,
                'branch': current_assignment.branch,
                'foreman': current_assignment.foreman,
                'assigned_on': current_assignment.assigned_on,
            }
        return None


class EquipmentAssignment(models.Model):
    """
    Equipment assignment to project/branch.
    """
    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name='assignments')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, null=True, blank=True, related_name='equipment_assignments')
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, null=True, blank=True, related_name='equipment_assignments')
    foreman = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='equipment_assignments')
    assigned_on = models.DateTimeField(auto_now_add=True)
    status = models.CharField(
        max_length=20,
        choices=[('ACTIVE', 'Active'), ('ENDED', 'Ended')],
        default='ACTIVE'
    )
    notes = models.TextField(null=True, blank=True)
    
    class Meta:
        verbose_name = 'Equipment Assignment'
        verbose_name_plural = 'Equipment Assignments'
        ordering = ['-assigned_on']
    
    def __str__(self):
        location = self.project or self.branch
        return f"{self.equipment.asset_number} -> {location} ({self.status})"


class EquipmentTransfer(models.Model):
    """
    Equipment transfer between sites (handover chain).
    """
    TRANSFER_STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('ACCEPTED', 'Accepted'),
        ('REJECTED', 'Rejected'),
    ]
    
    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name='transfers')
    from_project = models.ForeignKey(Project, on_delete=models.SET_NULL, null=True, blank=True, related_name='transfers_out')
    from_branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name='transfers_out')
    to_project = models.ForeignKey(Project, on_delete=models.SET_NULL, null=True, blank=True, related_name='transfers_in')
    to_branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name='transfers_in')
    
    sending_foreman = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='transfers_sent',
        limit_choices_to={'role': 'FOREMAN'}
    )
    receiving_foreman = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='transfers_received',
        limit_choices_to={'role': 'FOREMAN'}
    )
    
    transfer_out_date = models.DateTimeField()
    transfer_out_notes = models.TextField(null=True, blank=True)
    condition_notes = models.TextField(null=True, blank=True, help_text="Equipment condition at transfer")
    
    status = models.CharField(
        max_length=20,
        choices=TRANSFER_STATUS_CHOICES,
        default='PENDING'
    )
    
    receipt_date = models.DateTimeField(null=True, blank=True)
    receipt_notes = models.TextField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Equipment Transfer'
        verbose_name_plural = 'Equipment Transfers'
        ordering = ['-transfer_out_date']
    
    def __str__(self):
        from_loc = self.from_project or self.from_branch
        to_loc = self.to_project or self.to_branch
        return f"{self.equipment.asset_number}: {from_loc} -> {to_loc} ({self.status})"
    
    def accept(self, user, notes=None):
        """Accept the transfer."""
        if self.status != 'PENDING':
            return False
        
        self.status = 'ACCEPTED'
        self.receipt_date = timezone.now()
        if notes:
            self.receipt_notes = notes
        self.save()
        
        # Update equipment assignment
        old_assignment = EquipmentAssignment.objects.filter(
            equipment=self.equipment,
            status='ACTIVE'
        ).first()
        
        if old_assignment:
            old_assignment.status = 'ENDED'
            old_assignment.save()
        
        # Create new assignment
        new_assignment = EquipmentAssignment.objects.create(
            equipment=self.equipment,
            project=self.to_project,
            branch=self.to_branch,
            foreman=self.receiving_foreman,
            status='ACTIVE',
            notes=f"Transferred from {self.from_project or self.from_branch}"
        )
        
        # Update equipment status
        self.equipment.status = 'ON_SITE'
        self.equipment.save()
        
        return True
    
    def reject(self, user, reason=None):
        """Reject the transfer."""
        if self.status != 'PENDING':
            return False
        
        self.status = 'REJECTED'
        if reason:
            self.receipt_notes = f"Rejected: {reason}"
        self.save()
        return True

