interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  variant?: 'page' | 'inline';
}

export default function LoadingSpinner({ size = 'md', text, variant = 'page' }: LoadingSpinnerProps) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  const containerClass =
    variant === 'page'
      ? 'flex items-center justify-center w-full min-h-[60vh] px-4'
      : 'flex items-center justify-center w-full py-6';

  return (
    <div className={containerClass}>
      <div className="flex items-center gap-3 rounded-lg bg-white/80 px-4 py-3 shadow-sm ring-1 ring-gray-200/60">
        <div className={`animate-spin rounded-full border-2 border-primary/30 border-t-primary ${sizes[size]}`}></div>
        {text ? (
          <div className="text-sm">
            <div className="font-semibold text-gray-900">Loading...</div>
            <div className="text-xs text-gray-500">{text}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

