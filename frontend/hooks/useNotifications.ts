import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { authService } from '@/lib/auth';

export interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  link?: string;
  is_read: boolean;
  created_at: string;
  read_at?: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchNotifications = async () => {
    // Don't fetch if user is not authenticated (prevents 401 errors after logout)
    if (!authService.isAuthenticated()) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    
    try {
      const response = await api.get('/auth/notifications/');
      setNotifications(response.data.results || response.data || []);
      setError(null);
    } catch (err: any) {
      // Silently handle 401 (unauthorized) - user is logged out
      if (err.response?.status === 401) {
        setNotifications([]);
        setError(null);
      } else {
        setError(err.response?.data?.detail || 'Failed to fetch notifications');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchUnreadCount = async () => {
    // Don't fetch if user is not authenticated (prevents 401 errors after logout)
    if (!authService.isAuthenticated()) {
      setUnreadCount(0);
      return;
    }
    
    try {
      const response = await api.get('/auth/notifications/unread-count/');
      setUnreadCount(response.data.unread_count || 0);
    } catch (err: any) {
      // Silently fail for 401 (unauthorized) - user is logged out
      // Also ignore network errors and 404s
      if (err.response?.status === 401) {
        // User is logged out, stop polling
        setUnreadCount(0);
        return;
      }
      if (err.code !== 'ERR_NETWORK' && err.response?.status !== 404) {
        console.error('Failed to fetch unread count:', err);
      }
      // Set to 0 on error to prevent UI issues
      setUnreadCount(0);
    }
  };

  const markAsRead = async (id: number) => {
    try {
      await api.patch(`/auth/notifications/${id}/`, { is_read: true });
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err: any) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post('/auth/notifications/mark-all-read/');
      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true }))
      );
      setUnreadCount(0);
    } catch (err: any) {
      console.error('Failed to mark all as read:', err);
    }
  };

  useEffect(() => {
    // Only fetch if user is authenticated
    if (authService.isAuthenticated()) {
      fetchNotifications();
      fetchUnreadCount();

      // Poll for new notifications every 30 seconds (only if authenticated)
      intervalRef.current = setInterval(() => {
        // Check authentication before each poll
        if (authService.isAuthenticated()) {
          fetchUnreadCount();
        } else {
          // Stop polling if user logged out
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      }, 30000);
    } else {
      setLoading(false);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refetch: fetchNotifications,
    markAsRead,
    markAllAsRead,
    refreshUnreadCount: fetchUnreadCount,
  };
}

