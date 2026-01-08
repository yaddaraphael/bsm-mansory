import api from './api';

export interface LoginCredentials {
  username?: string;
  email?: string;
  password: string;
}

export interface AuthResponse {
  access: string;
  refresh: string;
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    // Send username field (can be username or email)
    const loginData = {
      username: credentials.username || credentials.email,
      password: credentials.password,
    };
    interface LoginResponse {
      access: string;
      refresh: string;
      user?: unknown;
    }
    const response = await api.post<LoginResponse>('/auth/login/', loginData);
    const { access, refresh, user } = response.data;
    
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
    
    // Store user data if provided
    if (user) {
      localStorage.setItem('user_data', JSON.stringify(user));
    }
    
    return { access, refresh };
  },
  
  async forgotPassword(email: string): Promise<void> {
    await api.post('/auth/forgot-password/', { email });
  },
  
  async resetPassword(uid: string, token: string, newPassword: string): Promise<void> {
    await api.post('/auth/reset-password/', {
      uid,
      token,
      new_password: newPassword,
    });
  },

  async activateAccount(uid: string, token: string, password: string, passwordConfirm: string): Promise<void> {
    await api.post('/auth/activate/', {
      uid,
      token,
      password,
      password_confirm: passwordConfirm,
    });
  },

  async logout(): Promise<void> {
    // Clear all auth-related data synchronously
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_data');
  },

  async getProfile() {
    const response = await api.get('/auth/profile/');
    return response.data;
  },

  async refreshToken(): Promise<string | null> {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) return null;

      const response = await api.post<{ access: string }>('/auth/refresh/', {
        refresh: refreshToken,
      });

      const { access } = response.data;
      localStorage.setItem('access_token', access);
      return access;
    } catch {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      return null;
    }
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('access_token');
  },
};

