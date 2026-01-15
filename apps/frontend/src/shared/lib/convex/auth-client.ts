import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";

// Singleton instance - initialized once by ConvexAuthProvider
let authClientInstance: ReturnType<typeof createAuthClient> | null = null;

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
 * Get or create the Better Auth client with the Convex plugin
 * This is called by ConvexAuthProvider during initialization
 */
export function getAuthClient(convexUrl: string) {
  if (!authClientInstance) {
    const baseURL = `${convexUrl}/api/auth`;
    console.log('[auth-client] Creating Better Auth client with baseURL:', baseURL);
    authClientInstance = createAuthClient({
      baseURL,
      plugins: [convexClient()],
    });
    console.log('[auth-client] Auth client created successfully');
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
