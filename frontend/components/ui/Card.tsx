import { ReactNode } from 'react';
import clsx from 'clsx';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  onClick?: () => void;
  action?: ReactNode;
}

export default function Card({ children, className, title, onClick, action }: CardProps) {
  return (
    <div 
      className={clsx('bg-white rounded-lg shadow-md p-4 md:p-6', className, onClick && 'cursor-pointer')}
      onClick={onClick}
    >
      {(title || action) && (
        <div className="flex justify-between items-center mb-3 md:mb-4">
          {title && (
            <h3 className="text-base md:text-lg font-semibold text-gray-900">{title}</h3>
          )}
          {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

