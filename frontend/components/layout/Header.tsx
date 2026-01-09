'use client';

import AccountDropdown from './AccountDropdown';
import NotificationBell from './NotificationBell';

export default function Header() {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200 fixed top-0 z-30 sidebar-header">
      <div className="flex items-center justify-between pl-14 md:pl-6 pr-4 md:pr-6 py-3 md:py-4">
        <div className="flex items-center min-w-0 flex-1 mr-2">
          <h2 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 whitespace-nowrap">
            BSM System
          </h2>
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0">
          <NotificationBell />
          <AccountDropdown />
        </div>
      </div>
    </header>
  );
}
