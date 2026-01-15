"use client";

import { useState, useEffect, createContext, useContext, type ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexProvider } from "convex/react";
import type { ConvexClient as ConvexClientType } from "convex/react/client";
import { getAuthClient } from "@shared/lib/convex/auth-client";
import { authStore } from "../../stores/auth-store";

interface AuthContextValue {
  convex: ConvexClientType | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: any | null;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  convex: null,
  isAuthenticated: false,
  isLoading: true,
  user: null,
  refetch: async () => {},
});

/**
 * Convex Auth Provider Component
 *
 * Provides Convex client for data queries and exposes auth state.
 * Authentication state is stored locally in localStorage for persistence.
 */
export function ConvexAuthProvider({ children }: { children: ReactNode }) {
  const [convex, setConvex] = useState<ConvexClientType | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [authState, setAuthState] = useState(authStore.getState());

  useEffect(() => {
    const initializeConvex = async () => {
      try {
        // Fetch Convex URLs from the main process
        const result = await window.electronAPI.convex.getUrl();
        if (result.success && result.data) {
          const { convexUrl, siteUrl } = result.data;

          // Initialize Convex client with convexUrl (for WebSocket/real-time)
          const convexClient = new ConvexReactClient(convexUrl);

          // Load saved session from local storage first
          authStore.loadFromStorage();
          const storedAuthState = authStore.getState();

          // Initialize Better Auth client with siteUrl (for auth actions)
          const authClient = getAuthClient(siteUrl);

          // If we have a stored session, verify it with the server
          // This restores the Better Auth client's internal session state
          if (storedAuthState.isAuthenticated && storedAuthState.session) {
            try {
              console.log('[ConvexAuthProvider] Found stored session, verifying with server...');
              console.log('[ConvexAuthProvider] Stored session keys:', Object.keys(storedAuthState.session));

              // Make a direct request to get-session endpoint to verify the session
              // The fetch interceptor will add the Bearer token automatically
              const response = await fetch(`${siteUrl}/api/auth/get-session`, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                },
              });

              if (response.ok) {
                const data = await response.json();
                console.log('[ConvexAuthProvider] Session verified successfully');
                console.log('[ConvexAuthProvider] Response data keys:', data ? Object.keys(data) : 'null');
                console.log('[ConvexAuthProvider] Response data:', data);

                // Check the structure of the response
                // Better Auth might return { user, session } or just { session } or other formats
                if (data) {
                  // If the response has a user object, use it
                  // Otherwise keep the existing user from stored session
                  if (data.user) {
                    console.log('[ConvexAuthProvider] Response has user, updating session');
                    authStore.setSession(data);
                  } else if (data.session?.user) {
                    console.log('[ConvexAuthProvider] Response has nested user, updating session');
                    authStore.setSession(data.session);
                  } else {
                    console.log('[ConvexAuthProvider] Response has no user, keeping stored session');
                    // Session is valid, keep using the stored one
                    // Just update the token if provided
                    if (data.session?.token || data.token) {
                      const newToken = data.session?.token || data.token;
                      const updatedSession = {
                        ...storedAuthState.session,
                        token: newToken,
                      };
                      authStore.setSession(updatedSession);
                    }
                  }
                }
              } else if (response.status === 401) {
                console.warn('[ConvexAuthProvider] Stored session is expired (401), clearing it');
                authStore.clearSession();
              } else {
                console.warn('[ConvexAuthProvider] Session verification failed (HTTP ' + response.status + ')');
                // Keep the stored session - might be a temporary server issue
              }
            } catch (error) {
              console.warn('[ConvexAuthProvider] Failed to verify session with server:', error);
              // Don't clear the session on network error - it might be a temporary issue
              // The user can still use the app with the stored session
              console.log('[ConvexAuthProvider] Keeping stored session despite verification failure');
            }
          }

          setAuthState(authStore.getState());

          // Log the configuration for debugging
          console.info('Convex initialized:', {
            convexUrl,
            siteUrl,
            authBaseURL: `${siteUrl}/api/auth`,
            hasStoredSession: storedAuthState.isAuthenticated
          });

          setConvex(convexClient);
          setIsReady(true);
        } else {
          // No Convex URL found - run without auth
          console.warn('Convex URL not found. Running without authentication.');
          setIsReady(true);
        }
      } catch (error) {
        console.error('Failed to initialize Convex:', error);
        setIsReady(true);
      }
    };

    initializeConvex();
  }, []);

  // Subscribe to auth store changes for reactivity
  useEffect(() => {
    const unsubscribe = authStore.subscribe(() => {
      setAuthState(authStore.getState());
    });
    return unsubscribe;
  }, []);

  // Get auth state from store
  const isAuthenticated = authState.isAuthenticated;
  const user = authState.user;
  const isLoading = false;

  // Refetch session from server
  const refetch = async () => {
    const authClient = getAuthClient('');
    if (authClient) {
      await authStore.fetchSession(authClient);
    }
  };

  // While initializing Convex, show loading state
  if (!isReady) {
    return (
      <AuthContext.Provider value={{ convex: null, isAuthenticated: false, isLoading: true, user: null, refetch }}>
        {children}
      </AuthContext.Provider>
    );
  }

  // If Convex is not configured, render without Convex provider
  // The app will work but auth features won't be available
  if (!convex) {
    return (
      <AuthContext.Provider value={{ convex: null, isAuthenticated: false, isLoading: false, user, refetch }}>
        {children}
      </AuthContext.Provider>
    );
  }

  // Convex is configured - use ConvexProvider for data queries
  // Auth state comes from local storage and is reactive
  return (
    <ConvexProvider client={convex}>
      <AuthContext.Provider
        value={{
          convex,
          isAuthenticated,
          isLoading,
          user,
          refetch,
        }}
      >
        {children}
      </AuthContext.Provider>
    </ConvexProvider>
  );
}

/**
 * Hook to access the Convex auth context
 */
export function useConvexAuth() {
  return useContext(AuthContext);
}
