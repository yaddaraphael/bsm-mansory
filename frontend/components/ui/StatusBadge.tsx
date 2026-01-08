import Badge from './Badge';

interface StatusBadgeProps {
  status: 'GREEN' | 'YELLOW' | 'RED' | 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | string;
  size?: 'sm' | 'md' | 'lg';
}

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const statusMap: Record<string, { variant: 'green' | 'yellow' | 'red' | 'blue' | 'gray', label: string }> = {
    GREEN: { variant: 'green', label: 'On Track' },
    YELLOW: { variant: 'yellow', label: 'At Risk' },
    RED: { variant: 'red', label: 'Delayed' },
    PENDING: { variant: 'yellow', label: 'Pending' },
    ACTIVE: { variant: 'blue', label: 'Active' },
    COMPLETED: { variant: 'green', label: 'Completed' },
    DRAFT: { variant: 'gray', label: 'Draft' },
    SUBMITTED: { variant: 'yellow', label: 'Waiting Approval' },
    APPROVED: { variant: 'green', label: 'Approved' },
    REJECTED: { variant: 'red', label: 'Rejected' },
  };

  const { variant, label } = statusMap[status] || { variant: 'gray' as const, label: status };

  return <Badge variant={variant} size={size}>{label}</Badge>;
}

