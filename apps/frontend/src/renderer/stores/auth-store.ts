import type { Session } from "better-auth/types";

interface AuthState {
  session: Session | null;
  isAuthenticated: boolean;
}

const AUTH_STORAGE_KEY = 'better-auth-session';

/**
 * Local auth store that persists authentication state
 * Works in Electron without relying on HttpOnly cookies
 */
class AuthStore {
  private state: AuthState = {
    session: null,
    isAuthenticated: false,
  };
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Subscribe to auth state changes
   */
  subscribe(callback: () => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of state change
   */
  private notify() {
    this.listeners.forEach(callback => callback());
  }

  /**
   * Load saved session from localStorage
   */
  loadFromStorage() {
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      console.log('[AuthStore] loadFromStorage: Found saved data:', !!saved);

      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('[AuthStore] loadFromStorage: Parsed data keys:', parsed ? Object.keys(parsed) : 'null');

        // Check if we have a session object
        if (parsed.session) {
          // Check if session has an expiration date
          if (parsed.session.expiresAt) {
            const expiresAt = new Date(parsed.session.expiresAt);
            const now = new Date();
            console.log('[AuthStore] loadFromStorage: Session expires:', expiresAt, 'now:', now, 'valid:', expiresAt > now);

            if (expiresAt <= now) {
              // Session expired, clear it
              console.log('[AuthStore] loadFromStorage: Session expired, clearing');
              this.clearSession();
              return;
            }
          } else {
            console.log('[AuthStore] loadFromStorage: Session has no expiration, treating as valid');
          }

          // Session is valid, load it
          this.state = {
            session: parsed.session,
            isAuthenticated: true,
          };
          console.log('[AuthStore] loadFromStorage: Session loaded successfully, user:', parsed.session?.user ? {
            email: parsed.session.user.email,
            name: parsed.session.user.name,
          } : 'no user');
        }
      } else {
        console.log('[AuthStore] loadFromStorage: No saved session found');
      }
    } catch (error) {
      console.error('[AuthStore] Failed to load session:', error);
      this.clearSession();
    }
  }

  /**
   * Save session to localStorage
   */
  private saveToStorage(session: Session | null) {
    try {
      if (session) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
          session,
          isAuthenticated: true,
        }));
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch (error) {
      console.error('[AuthStore] Failed to save session:', error);
    }
  }

  /**
   * Get the current auth state
   */
  getState(): AuthState {
    return this.state;
  }

  /**
   * Get the current session value
   */
  getSession(): Session | null {
    return this.state.session;
  }

  /**
   * Get the authenticated user
   */
  getUser() {
    const user = this.state.session?.user || null;
    console.log('[AuthStore] getUser called, returning:', user ? {
      email: user.email,
      name: user.name,
      hasImage: !!user.image,
    } : null);
    return user;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.state.isAuthenticated;
  }

  /**
   * Set the session after successful login
   */
  setSession(session: Session | null) {
    console.log('[AuthStore] setSession called with:', session ? {
      hasToken: !!session.token,
      hasUser: !!(session as any).user,
      user: (session as any).user,
      keys: Object.keys(session),
    } : 'null');

    this.state = {
      session,
      isAuthenticated: !!session,
    };
    this.saveToStorage(session);
    this.notify();

    console.log('[AuthStore] State after setSession:', {
      isAuthenticated: this.state.isAuthenticated,
      user: this.getUser(),
    });
  }

  /**
   * Clear the session (logout)
   */
  clearSession() {
    this.state = {
      session: null,
      isAuthenticated: false,
    };
    this.saveToStorage(null);
    this.notify();
  }

  /**
   * Get the session token for API requests
   */
  getToken(): string | null {
    const session = this.state.session;
    if (!session) return null;

    // Log the session structure for debugging
    console.log('[AuthStore] Session structure:', {
      hasToken: !!session.token,
      hasSessionToken: !!(session as any).sessionToken,
      keys: Object.keys(session),
      sessionKeys: session.session ? Object.keys(session.session) : [],
    });

    // Try different possible token locations
    return session.token || (session as any).sessionToken || (session as any).session?.token || null;
  }

  /**
   * Fetch the current session from the server
   */
  async fetchSession(authClient: any) {
    try {
      const session = await authClient.getSession();
      this.setSession(session);
      return session;
    } catch (error) {
      console.error('[AuthStore] Failed to fetch session:', error);
      // If we can't fetch, clear the local session
      this.clearSession();
      return null;
    }
  }
}

// Singleton instance
export const authStore = new AuthStore();
