'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import Header from './Header';

const NO_SHELL_PREFIXES = ['/public'];
const NO_SHELL_PATHS = new Set(['/','/login','/forgot-password','/reset-password','/activate']);

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const hideShell = !pathname || NO_SHELL_PATHS.has(pathname) || NO_SHELL_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (hideShell) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 sidebar-content">
        <Header />
        {children}
      </div>
    </div>
  );
}

