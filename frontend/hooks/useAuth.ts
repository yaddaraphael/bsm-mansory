import { useState, useEffect } from 'react';
import { authService } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      if (authService.isAuthenticated()) {
        const profile = await authService.getProfile();
        setUser(profile);
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch (error) {
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (credentials: { username: string; password: string }) => {
    try {
      setLoading(true);
      const response = await authService.login(credentials);
      // Get user data from localStorage if available (set by login response)
      const userData = localStorage.getItem('user_data');
      if (userData) {
        const user = JSON.parse(userData);
        setUser(user);
        setIsAuthenticated(true);
      } else {
        // Fallback to profile fetch
        await checkAuth();
      }
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    // Clear state immediately for faster UI response
    setUser(null);
    setIsAuthenticated(false);
    // Clear auth data
    authService.logout();
    // Navigate immediately without waiting
    router.push('/login');
  };

  return {
    user,
    loading,
    isAuthenticated,
    login,
    logout,
    refresh: checkAuth,
  };
}

