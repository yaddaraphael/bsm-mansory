import { ReactNode } from 'react';
import clsx from 'clsx';

export interface BadgeProps {
  children: ReactNode;
  variant?: 'green' | 'yellow' | 'red' | 'blue' | 'gray';
  size?: 'sm' | 'md' | 'lg';
}

export default function Badge({ children, variant = 'gray', size = 'md' }: BadgeProps) {
  const variants = {
    green: 'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    red: 'bg-red-100 text-red-800',
    blue: 'bg-blue-100 text-blue-800',
    gray: 'bg-gray-100 text-gray-800',
  };

  const sizes = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-2',
  };

  return (
    <span className={clsx('inline-flex items-center rounded-full font-medium', variants[variant], sizes[size])}>
      {children}
    </span>
  );
}

