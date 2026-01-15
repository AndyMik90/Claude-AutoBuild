import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { authStore } from "../../../renderer/stores/auth-store";

// Singleton instance - initialized once by ConvexAuthProvider
let authClientInstance: ReturnType<typeof createAuthClient> | null = null;
let fetchInterceptorInstalled = false;

// No-op fallback client (singleton to prevent infinite loops)
let noOpClientInstance: ReturnType<typeof createAuthClient> | null = null;

function getNoOpClient() {
  if (!noOpClientInstance) {
    noOpClientInstance = createAuthClient({
      baseURL: '',
      plugins: [],
    });
  }
  return noOpClientInstance;
}

/**
 * Get the Bearer token from the session stored in localStorage
 */
function getBearerToken(): string | null {
  const session = authStore.getSession();

  // The session object from Better Auth has the token in different locations
  // Try to get it from various possible locations
  let token = session?.token || session?.sessionToken;

  // If no token found, try getting from nested session object
  if (!token && (session as any)?.session?.token) {
    token = (session as any).session.token;
  }

  return token || null;
}

/**
 * Install a global fetch interceptor for Better Auth requests
 * This intercepts ALL fetch calls to /api/auth/ endpoints and adds Bearer token
 */
function installFetchInterceptor() {
  if (fetchInterceptorInstalled) {
    console.log('[auth-client] Fetch interceptor already installed');
    return;
  }

  const originalFetch = window.fetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    // Intercept all requests to /api/auth/ endpoints
    if (url.includes('/api/auth/')) {
      const token = getBearerToken();

      if (token) {
        console.log('[auth-client] Intercepted fetch for:', url);
        console.log('[auth-client] Adding Bearer token to request');

        const headers = new Headers(init?.headers);
        headers.set('Authorization', `Bearer ${token}`);

        return originalFetch(input, {
          ...init,
          headers,
        });
      } else {
        console.warn('[auth-client] No token found for auth request:', url);
      }
    }

    return originalFetch(input, init);
  };

  fetchInterceptorInstalled = true;
  console.log('[auth-client] Global fetch interceptor installed');
}

/**
 * Get or create the Better Auth client with the Convex plugin
 * Configured to use Bearer token authentication from localStorage
 */
export function getAuthClient(convexUrl: string) {
  if (!authClientInstance) {
    const baseURL = `${convexUrl}/api/auth`;
    console.log('[auth-client] Creating Better Auth client with baseURL:', baseURL);

    // Install global fetch interceptor first
    installFetchInterceptor();

    const client = createAuthClient({
      baseURL,
      plugins: [convexClient()],
    });

    authClientInstance = client;

    console.log('[auth-client] Auth client created with Bearer token authentication');
  }
  return authClientInstance;
}

/**
 * Reset the auth client instance
 */
export function resetAuthClient() {
  authClientInstance = null;
}

/**
 * Better Auth hooks that use the singleton client
 * Returns the initialized client or a no-op fallback if not initialized
 */
export function useAuthClient() {
  if (!authClientInstance) {
    // Return a singleton no-op client to prevent infinite loops
    return getNoOpClient();
  }
  return authClientInstance;
}
