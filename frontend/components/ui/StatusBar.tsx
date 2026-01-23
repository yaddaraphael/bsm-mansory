interface StatusBarProps {
  status: 'GREEN' | 'YELLOW' | 'RED' | string;
  className?: string;
}

export default function StatusBar({ status, className = '' }: StatusBarProps) {
  const getStatusColor = () => {
    switch (status?.toUpperCase()) {
      case 'GREEN':
        return 'bg-green-500';
      case 'YELLOW':
        return 'bg-yellow-500';
      case 'RED':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusText = () => {
    switch (status?.toUpperCase()) {
      case 'GREEN':
        return 'On Track';
      case 'YELLOW':
        return 'Mid Range';
      case 'RED':
        return 'Not On Track';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} title={getStatusText()} />
      <span className="text-xs text-gray-600 hidden sm:inline">{getStatusText()}</span>
    </div>
  );
}
