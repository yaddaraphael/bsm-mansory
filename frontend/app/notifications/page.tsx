'use client';

import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Button from '@/components/ui/Button';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { BellIcon, CheckIcon } from '@heroicons/react/24/outline';

export default function NotificationsPage() {
  const { notifications, loading, markAsRead, markAllAsRead } = useNotifications();
  const router = useRouter();

  interface Notification {
    id: number;
    is_read: boolean;
    link?: string;
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    if (notification.link) {
      router.push(notification.link);
    }
  };

  const unreadNotifications = notifications.filter(n => !n.is_read);

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
            <Header />
            <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
              <LoadingSpinner />
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main className="flex-1 p-4 md:p-6 bg-gray-50 overflow-y-auto pt-16 md:pt-20">
            <div className="max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">Notifications</h1>
                <p className="text-sm text-gray-500 mt-1">
                  {unreadNotifications.length} unread notification{unreadNotifications.length !== 1 ? 's' : ''}
                </p>
              </div>
              {unreadNotifications.length > 0 && (
                <Button
                  onClick={markAllAsRead}
                  variant="secondary"
                  className="w-full sm:w-auto"
                >
                  <CheckIcon className="h-5 w-5 mr-2" />
                  Mark All as Read
                </Button>
              )}
            </div>

            {notifications.length === 0 ? (
              <Card>
                <div className="text-center py-12">
                  <BellIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No notifications</p>
                </div>
              </Card>
            ) : (
              <div className="space-y-3">
                {notifications.map((notification) => (
                  <Card
                    key={notification.id}
                    className={`cursor-pointer hover:shadow-md transition-shadow ${
                      !notification.is_read ? 'border-l-4 border-primary' : ''
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <h3 className={`text-base font-medium ${
                            !notification.is_read ? 'text-gray-900' : 'text-gray-700'
                          }`}>
                            {notification.title}
                          </h3>
                          {!notification.is_read && (
                            <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0"></div>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                        <p className="text-xs text-gray-400 mt-2">
                          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}

