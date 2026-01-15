import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";

// Create the Better Auth client with Convex plugin
// This client provides methods for authentication (signIn, signOut, etc.)
export const authClient = createAuthClient({
  plugins: [convexClient()],
});

// Export hooks for use in React components
export const useAuthClient = () => {
  return {
    signIn: authClient.signIn,
    signOut: authClient.signOut,
    signUp: authClient.signUp,
    useSession: authClient.useSession,
  };
};
