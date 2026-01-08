from django.utils import timezone
from .models import Project, DailyReport


def generate_daily_report_number():
    """
    Generate daily report number in format: YYYYMMDDSEQ
    Example: 20260106001
    """
    today = timezone.now().date()
    date_prefix = today.strftime('%Y%m%d')
    
    # Find the highest sequence number for today
    existing_reports = DailyReport.objects.filter(report_number__startswith=date_prefix)
    
    if existing_reports.exists():
        sequences = []
        for report in existing_reports:
            try:
                if report.report_number and len(report.report_number) > 8:
                    seq_part = report.report_number[8:]  # After YYYYMMDD
                    sequences.append(int(seq_part))
            except (ValueError, IndexError):
                continue
        
        if sequences:
            next_seq = max(sequences) + 1
        else:
            next_seq = 1
    else:
        next_seq = 1
    
    # Format with leading zeros (3 digits)
    report_number = f"{date_prefix}{next_seq:03d}"
    
    return report_number


def generate_job_number(branch):
    """
    Generate job number in format: LOCATIONCODE-YY-SEQ
    Example: KC-26-0142
    """
    year = timezone.now().year % 100  # Last 2 digits
    code = branch.code.upper()
    
    # Find the highest sequence number for this branch and year
    prefix = f"{code}-{year:02d}-"
    existing_jobs = Project.objects.filter(job_number__startswith=prefix)
    
    if existing_jobs.exists():
        # Extract sequence numbers and find max
        sequences = []
        for job in existing_jobs:
            try:
                seq_part = job.job_number.split('-')[-1]
                sequences.append(int(seq_part))
            except (ValueError, IndexError):
                continue
        
        if sequences:
            next_seq = max(sequences) + 1
        else:
            next_seq = 1
    else:
        next_seq = 1
    
    # Format with leading zeros (4 digits)
    job_number = f"{prefix}{next_seq:04d}"
    
    return job_number

