/**
 * Authentication Store
 *
 * Manages user authentication state, tokens, and auth operations.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Auth types
export interface User {
  id: string;
  email: string;
  username: string;
  role: 'admin' | 'user';
}

export interface AuthState {
  // State
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Setup state
  setupRequired: boolean | null;

  // Actions
  setUser: (user: User | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSetupRequired: (required: boolean) => void;
  logout: () => void;
  clearError: () => void;
}

// Token storage keys
const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,
      setupRequired: null,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: user !== null,
        }),

      setTokens: (accessToken, refreshToken) =>
        set({
          accessToken,
          refreshToken,
          isAuthenticated: true,
        }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      setSetupRequired: (setupRequired) => set({ setupRequired }),

      logout: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
        }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);

// API base URL
const API_BASE = '/api';

// Helper for API calls with auth
async function authFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const { accessToken } = useAuthStore.getState();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (accessToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
  }

  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
}

/**
 * Check auth status (is setup required?)
 */
export async function checkAuthStatus(): Promise<void> {
  const store = useAuthStore.getState();
  store.setLoading(true);

  try {
    const response = await fetch(`${API_BASE}/auth/status`);
    const data = await response.json();

    store.setSetupRequired(data.setup_required);

    // If we have a stored token, try to validate it
    if (store.accessToken && !data.setup_required) {
      await fetchCurrentUser();
    }
  } catch (error) {
    console.error('Failed to check auth status:', error);
    store.setError('Failed to connect to server');
  } finally {
    store.setLoading(false);
  }
}

/**
 * Fetch current user info
 */
export async function fetchCurrentUser(): Promise<boolean> {
  const store = useAuthStore.getState();

  try {
    const response = await authFetch('/auth/me');

    if (response.ok) {
      const user = await response.json();
      store.setUser(user);
      return true;
    } else if (response.status === 401) {
      // Token expired, try to refresh
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return fetchCurrentUser();
      }
      store.logout();
      return false;
    }
    return false;
  } catch (error) {
    console.error('Failed to fetch user:', error);
    return false;
  }
}

/**
 * Setup initial admin account
 */
export async function setupAdmin(
  email: string,
  username: string,
  password: string
): Promise<boolean> {
  const store = useAuthStore.getState();
  store.setLoading(true);
  store.clearError();

  try {
    const response = await fetch(`${API_BASE}/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password }),
    });

    if (response.ok) {
      const data = await response.json();
      store.setTokens(data.access_token, data.refresh_token);
      store.setSetupRequired(false);
      await fetchCurrentUser();
      return true;
    } else {
      const error = await response.json();
      store.setError(error.detail?.message || error.detail || 'Setup failed');
      return false;
    }
  } catch (error) {
    store.setError('Failed to connect to server');
    return false;
  } finally {
    store.setLoading(false);
  }
}

/**
 * Login with email/username and password
 */
export async function login(
  emailOrUsername: string,
  password: string
): Promise<boolean> {
  const store = useAuthStore.getState();
  store.setLoading(true);
  store.clearError();

  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_or_username: emailOrUsername,
        password,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      store.setTokens(data.access_token, data.refresh_token);
      await fetchCurrentUser();
      return true;
    } else {
      const error = await response.json();
      store.setError(error.detail?.message || error.detail || 'Invalid credentials');
      return false;
    }
  } catch (error) {
    store.setError('Failed to connect to server');
    return false;
  } finally {
    store.setLoading(false);
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(): Promise<boolean> {
  const store = useAuthStore.getState();
  const { refreshToken } = store;

  if (!refreshToken) {
    return false;
  }

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      store.setTokens(data.access_token, data.refresh_token);
      return true;
    } else {
      store.logout();
      return false;
    }
  } catch (error) {
    console.error('Failed to refresh token:', error);
    return false;
  }
}

/**
 * Logout user
 */
export async function logout(): Promise<void> {
  const store = useAuthStore.getState();
  const { refreshToken } = store;

  try {
    if (refreshToken) {
      await authFetch('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    }
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    store.logout();
  }
}

/**
 * Validate invitation code
 */
export async function validateInvitation(code: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/register/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Register with invitation code
 */
export async function register(
  code: string,
  email: string,
  username: string,
  password: string
): Promise<boolean> {
  const store = useAuthStore.getState();
  store.setLoading(true);
  store.clearError();

  try {
    const response = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, email, username, password }),
    });

    if (response.ok) {
      const data = await response.json();
      store.setTokens(data.access_token, data.refresh_token);
      await fetchCurrentUser();
      return true;
    } else {
      const error = await response.json();
      store.setError(error.detail?.message || error.detail || 'Registration failed');
      return false;
    }
  } catch (error) {
    store.setError('Failed to connect to server');
    return false;
  } finally {
    store.setLoading(false);
  }
}

/**
 * Get current access token (for use in API calls)
 */
export function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}

/**
 * Set tokens (used by OIDC callback)
 */
export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  const store = useAuthStore.getState();
  store.setTokens(accessToken, refreshToken);
  await fetchCurrentUser();
}
