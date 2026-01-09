'use client';

import { useState, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useSidebar } from './SidebarContext';
import {
  HomeIcon,
  FolderIcon,
  ClockIcon,
  WrenchScrewdriverIcon,
  UserGroupIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  BuildingOfficeIcon,
  Bars3Icon,
  XMarkIcon,
  ArrowRightOnRectangleIcon,
  CloudIcon,
  ChevronDownIcon,
  SignalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [usersDropdownOpen, setUsersDropdownOpen] = useState(false);
  const [reportsDropdownOpen, setReportsDropdownOpen] = useState(false);
  const { isCollapsed, toggleCollapse } = useSidebar();
  
  const isSuperadmin = user?.role === 'ROOT_SUPERADMIN' || user?.role === 'SUPERADMIN';
  
  const baseNavigation = [
    { name: 'Dashboard', href: '/dashboard', icon: HomeIcon, roles: 'all' },
    { name: 'Projects', href: '/projects', icon: FolderIcon, roles: 'all' },
    { name: 'Branches', href: '/branches', icon: BuildingOfficeIcon, roles: ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN'] },
  ];
  
  const timeNavigation = [
    { name: 'Clock In/Out', href: '/time/clock', icon: ClockIcon, roles: ['LABORER', 'MASON', 'OPERATOR', 'BRICKLAYER', 'PLASTER', 'FOREMAN', 'SUPERINTENDENT'] },
    { name: 'My Time', href: '/time/my-time', icon: ClockIcon, roles: ['LABORER', 'MASON', 'OPERATOR', 'BRICKLAYER', 'PLASTER', 'FOREMAN', 'SUPERINTENDENT'] },
  ];
  
  const adminNavigation = [
    { name: 'Equipment', href: '/equipment', icon: WrenchScrewdriverIcon, roles: 'all' },
    { name: 'Users', href: '/users', icon: UserGroupIcon, roles: ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'HR'], hasDropdown: true },
    { name: 'Reports', href: '/reports', icon: ChartBarIcon, roles: ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'PROJECT_MANAGER', 'SUPERINTENDENT', 'FOREMAN'], hasDropdown: true },
    { name: 'SharePoint', href: '/sharepoint', icon: CloudIcon, roles: ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'PROJECT_MANAGER', 'HR', 'FINANCE'] },
    { name: 'Spectrum', href: '/spectrum', icon: SignalIcon, roles: ['ROOT_SUPERADMIN', 'SUPERADMIN', 'ADMIN', 'PROJECT_MANAGER', 'HR', 'FINANCE'] },
    { name: 'Settings', href: '/settings', icon: Cog6ToothIcon, roles: 'all' },
  ];

  interface RoleOption {
    value: string;
    label: string;
  }

  const roleOptions: RoleOption[] = [
    { value: '', label: 'All Users' },
    { value: 'LABORER', label: 'Laborers' },
    { value: 'MASON', label: 'Masons' },
    { value: 'OPERATOR', label: 'Operators' },
    { value: 'BRICKLAYER', label: 'Bricklayers' },
    { value: 'PLASTER', label: 'Plasters' },
    { value: 'FOREMAN', label: 'Foremen' },
    { value: 'SUPERINTENDENT', label: 'Superintendents' },
    { value: 'PROJECT_MANAGER', label: 'Project Managers' },
    { value: 'GENERAL_CONTRACTOR', label: 'General Contractors' },
    { value: 'HR', label: 'HR' },
    { value: 'FINANCE', label: 'Finance' },
    { value: 'AUDITOR', label: 'Auditors' },
    { value: 'ADMIN', label: 'Admins' },
    { value: 'SYSTEM_ADMIN', label: 'System Admins' },
    { value: 'SUPERADMIN', label: 'Superadmins' },
    { value: 'ROOT_SUPERADMIN', label: 'Root Superadmins' },
  ];
  
  const getNavigation = () => {
    const nav: typeof baseNavigation = [];
    
    // Add base navigation
    nav.push(...baseNavigation);
    
    // Add time navigation if not superadmin
    if (!isSuperadmin) {
      timeNavigation.forEach(item => {
        if ((typeof item.roles === 'string' && item.roles === 'all') || (Array.isArray(item.roles) && item.roles.includes(user?.role || ''))) {
          nav.push(item);
        }
      });
    }
    
    // Add admin navigation
    adminNavigation.forEach(item => {
      if ((typeof item.roles === 'string' && item.roles === 'all') || (Array.isArray(item.roles) && item.roles.includes(user?.role || ''))) {
        nav.push(item);
      }
    });
    
    return nav;
  };

  const navigation = getNavigation();

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Keep users dropdown open when on users page
  useEffect(() => {
    if (pathname?.startsWith('/users')) {
      setUsersDropdownOpen(true);
    } else if (!pathname?.startsWith('/users') && pathname !== '/users') {
      // Optionally close when navigating away (comment out if you want it to stay open)
      // setUsersDropdownOpen(false);
    }
  }, [pathname]);

  // Keep reports dropdown open when on reports page
  useEffect(() => {
    if (pathname?.startsWith('/reports')) {
      setReportsDropdownOpen(true);
    }
  }, [pathname]);

  // Close mobile menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isMobileMenuOpen && !target.closest('.sidebar-container') && !target.closest('.mobile-menu-button')) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobileMenuOpen]);

  // Close dropdowns when collapsing
  useEffect(() => {
    if (isCollapsed) {
      setUsersDropdownOpen(false);
      setReportsDropdownOpen(false);
    }
  }, [isCollapsed]);

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        className="mobile-menu-button fixed top-4 left-4 z-50 lg:hidden bg-primary text-white p-2 rounded-md shadow-lg"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        aria-label="Toggle menu"
      >
        {isMobileMenuOpen ? (
          <XMarkIcon className="h-6 w-6" />
        ) : (
          <Bars3Icon className="h-6 w-6" />
        )}
      </button>

      {/* Overlay for mobile */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={clsx(
          'sidebar-container fixed inset-y-0 left-0 z-40 bg-gray-900 text-white min-h-screen transform transition-all duration-300 ease-in-out',
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          // On mobile/tablet, always show full width (w-64). On desktop, use collapsed state
          'w-64',
          isCollapsed && 'lg:w-20'
        )}
      >
        {/* Header with Toggle Button */}
        <div className={clsx('p-4 border-b border-gray-800', isCollapsed ? 'lg:px-2' : 'md:p-6')}>
          <div className="flex items-center justify-between">
            <div className={clsx('flex items-center', isCollapsed ? 'lg:justify-center lg:w-full' : 'space-x-3')}>
              <div className="bg-primary rounded-lg p-2 flex-shrink-0">
                <BuildingOfficeIcon className="h-6 w-6 text-white" />
              </div>
              <div className={clsx('min-w-0', isCollapsed && 'lg:hidden')}>
                <h1 className="text-xl font-bold text-white truncate">BSM</h1>
                <p className="text-xs text-gray-400 truncate">Building Systems</p>
              </div>
            </div>
            {/* Collapse Toggle Button - Desktop Only, positioned to not conflict with mobile close */}
            <button
              onClick={toggleCollapse}
              className={clsx(
                'hidden lg:flex items-center justify-center w-8 h-8 rounded-md hover:bg-gray-800 transition-colors flex-shrink-0',
                isCollapsed && 'mx-auto'
              )}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? (
                <ChevronRightIcon className="h-5 w-5 text-gray-300" />
              ) : (
                <ChevronLeftIcon className="h-5 w-5 text-gray-300" />
              )}
            </button>
          </div>
        </div>
        <nav className="mt-6 overflow-y-auto h-[calc(100vh-180px)]">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            interface NavigationItem {
              name: string;
              href: string;
              icon?: React.ComponentType<{ className?: string }>;
              hasDropdown?: boolean;
            }
            const hasDropdown = (item as NavigationItem).hasDropdown;
            
            if (hasDropdown && item.name === 'Users') {
              const isUsersPage = pathname?.startsWith('/users');
              // On mobile, always show full with text. On desktop, show collapsed version when collapsed
              if (isCollapsed) {
                return (
                  <Link
                    key={item.name}
                    href="/users"
                    className={clsx(
                      'flex items-center px-4 md:px-6 py-3 text-sm font-medium transition-colors',
                      'lg:justify-center lg:px-2',
                      isUsersPage
                        ? 'bg-primary text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    )}
                    title={item.name}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <item.icon className={clsx('h-5 w-5 flex-shrink-0', !isCollapsed && 'mr-3', isCollapsed && 'lg:mr-0')} />
                    <span className={clsx('truncate', isCollapsed && 'lg:hidden')}>{item.name}</span>
                  </Link>
                );
              }
              return (
                <div key={item.name}>
                  <button
                    onClick={() => setUsersDropdownOpen(!usersDropdownOpen)}
                    className={clsx(
                      'w-full flex items-center justify-between px-4 md:px-6 py-3 text-sm font-medium transition-all duration-200',
                      isUsersPage || usersDropdownOpen
                        ? 'bg-primary text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    )}
                  >
                    <div className="flex items-center">
                      <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </div>
                    <div className="flex-shrink-0 transition-transform duration-200" style={{
                      transform: usersDropdownOpen ? 'rotate(0deg)' : 'rotate(-90deg)'
                    }}>
                      <ChevronDownIcon className="h-4 w-4" />
                    </div>
                  </button>
                  <div 
                    className={clsx(
                      'overflow-hidden transition-all duration-300 ease-in-out',
                      usersDropdownOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
                    )}
                  >
                    <div className="bg-gray-800 border-t border-gray-700">
                      {roleOptions.map((role, index) => {
                        const currentRole = searchParams?.get('role') || '';
                        const isRoleActive = pathname === '/users' && (
                          (role.value === '' && !currentRole) || 
                          (role.value === currentRole)
                        );
                        return (
                          <Link
                            key={role.value}
                            href={`/users${role.value ? `?role=${role.value}` : ''}`}
                            className={clsx(
                              'flex items-center px-8 md:px-10 py-2.5 text-sm transition-all duration-150',
                              'border-l-2',
                              isRoleActive
                                ? 'bg-gray-700 text-white border-primary'
                                : 'text-gray-400 hover:bg-gray-700 hover:text-white border-transparent hover:border-gray-600'
                            )}
                            onClick={() => {
                              setIsMobileMenuOpen(false);
                            }}
                            style={{
                              animationDelay: `${index * 20}ms`
                            }}
                          >
                            <span className="truncate font-normal">{role.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            }

            if (hasDropdown && item.name === 'Reports') {
              const isReportsPage = pathname?.startsWith('/reports');
              // On mobile, always show full with text. On desktop, show collapsed version when collapsed
              if (isCollapsed) {
                return (
                  <Link
                    key={item.name}
                    href="/reports"
                    className={clsx(
                      'flex items-center px-4 md:px-6 py-3 text-sm font-medium transition-colors',
                      'lg:justify-center lg:px-2',
                      isReportsPage
                        ? 'bg-primary text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    )}
                    title={item.name}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <item.icon className={clsx('h-5 w-5 flex-shrink-0', !isCollapsed && 'mr-3', isCollapsed && 'lg:mr-0')} />
                    <span className={clsx('truncate', isCollapsed && 'lg:hidden')}>{item.name}</span>
                  </Link>
                );
              }
              return (
                <div key={item.name}>
                  <button
                    onClick={() => setReportsDropdownOpen(!reportsDropdownOpen)}
                    className={clsx(
                      'w-full flex items-center justify-between px-4 md:px-6 py-3 text-sm font-medium transition-all duration-200',
                      isReportsPage || reportsDropdownOpen
                        ? 'bg-primary text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    )}
                  >
                    <div className="flex items-center">
                      <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </div>
                    <div className="flex-shrink-0 transition-transform duration-200" style={{
                      transform: reportsDropdownOpen ? 'rotate(0deg)' : 'rotate(-90deg)'
                    }}>
                      <ChevronDownIcon className="h-4 w-4" />
                    </div>
                  </button>
                  <div 
                    className={clsx(
                      'overflow-hidden transition-all duration-300 ease-in-out',
                      reportsDropdownOpen ? 'max-h-[200px] opacity-100' : 'max-h-0 opacity-0'
                    )}
                  >
                    <div className="bg-gray-800 border-t border-gray-700">
                      <Link
                        href="/reports/daily"
                        className={clsx(
                          'flex items-center px-8 md:px-10 py-2.5 text-sm transition-all duration-150',
                          'border-l-2',
                          pathname?.startsWith('/reports/daily')
                            ? 'bg-gray-700 text-white border-primary'
                            : 'text-gray-400 hover:bg-gray-700 hover:text-white border-transparent hover:border-gray-600'
                        )}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <span className="truncate font-normal">Daily Reports from Foreman</span>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            }
            
            return (
              <Link
                key={item.name}
                href={item.href}
                className={clsx(
                  'flex items-center text-sm font-medium transition-colors',
                  isCollapsed 
                    ? 'lg:justify-center lg:px-2 px-4 md:px-6 py-3' 
                    : 'px-4 md:px-6 py-3',
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                )}
                title={isCollapsed ? item.name : undefined}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <item.icon className={clsx('h-5 w-5 flex-shrink-0', !isCollapsed && 'mr-3', isCollapsed && 'lg:mr-0')} />
                <span className={clsx('truncate', isCollapsed && 'lg:hidden')}>{item.name}</span>
              </Link>
            );
          })}
        </nav>
        
        {/* Logout Button at Bottom */}
        <div className={clsx('absolute bottom-0 left-0 right-0 border-t border-gray-800', isCollapsed ? 'p-2' : 'p-4')}>
          <button
            onClick={() => {
              logout();
              router.push('/login');
            }}
            className={clsx(
              'w-full flex items-center text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors rounded',
              isCollapsed ? 'lg:justify-center lg:px-2 px-4 md:px-6 py-3' : 'px-4 md:px-6 py-3'
            )}
            title={isCollapsed ? 'Logout' : undefined}
          >
            <ArrowRightOnRectangleIcon className={clsx('h-5 w-5 flex-shrink-0', !isCollapsed && 'mr-3', isCollapsed && 'lg:mr-0')} />
            <span className={clsx('truncate', isCollapsed && 'lg:hidden')}>Logout</span>
          </button>
        </div>
      </div>
    </>
  );
}
