"use client";

import { useState, useEffect, createContext, useContext, type ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { getAuthClient } from "@shared/lib/convex/auth-client";

// ConvexClient type is the instance type of ConvexReactClient
type ConvexClientType = InstanceType<typeof ConvexReactClient>;

interface AuthContextValue {
  convex: ConvexClientType | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  convex: null,
  isAuthenticated: false,
  isLoading: true,
});

/**
 * Convex Auth Provider Component
 *
 * Fetches the Convex URLs, initializes both Convex and Better Auth clients,
 * and provides auth context to the app.
 */
export function ConvexAuthProvider({ children }: { children: ReactNode }) {
  const [convex, setConvex] = useState<ConvexClientType | null>(null);
  const [authClient, setAuthClientState] = useState<ReturnType<typeof getAuthClient> | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initializeConvex = async () => {
      try {
        // Fetch Convex URLs from the main process
        const result = await window.electronAPI.convex.getUrl();
        if (result.success && result.data) {
          const { convexUrl, siteUrl } = result.data;

          // Initialize Convex client with convexUrl (for WebSocket/real-time)
          const convexClient = new ConvexReactClient(convexUrl);

          // Initialize Better Auth client with siteUrl (for auth actions like sign in/sign up)
          const client = getAuthClient(siteUrl);

          // Log the configuration for debugging
          console.info('Convex initialized:', {
            convexUrl,
            siteUrl,
            authBaseURL: `${siteUrl}/api/auth`
          });

          setConvex(convexClient);
          setAuthClientState(client);
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

  // If Convex is not configured or still loading, render children without auth
  // The no-op auth client will prevent errors, but auth features won't work
  if (!isReady) {
    return (
      <AuthContext.Provider value={{ convex: null, isAuthenticated: false, isLoading: true }}>
        {children}
      </AuthContext.Provider>
    );
  }

  // If Convex is not configured, render children without ConvexBetterAuthProvider
  // Components should check isAuthenticated before using auth features
  if (!convex || !authClient) {
    return (
      <AuthContext.Provider value={{ convex: null, isAuthenticated: false, isLoading: false }}>
        {children}
      </AuthContext.Provider>
    );
  }

  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient as any}>
      <AuthContext.Provider value={{ convex, isAuthenticated: true, isLoading: false }}>
        {children}
      </AuthContext.Provider>
    </ConvexBetterAuthProvider>
  );
}

/**
 * Hook to access the Convex auth context
 */
export function useConvexAuth() {
  return useContext(AuthContext);
}
