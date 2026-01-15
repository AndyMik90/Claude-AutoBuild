import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { betterAuth } from "better-auth";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL || "http://localhost:5173";
const secret = process.env.BETTER_AUTH_SECRET || "default-secret-change-in-production";

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: siteUrl,
    secret,
    database: authComponent.adapter(ctx),
    // Configure trusted origins for CORS
    trustedOrigins: [siteUrl],
    // Configure session settings
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days in seconds
      updateAge: 60 * 60 * 24, // Update session every 24 hours
      cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache cookie for 5 minutes
    },
    },
    // Configure advanced cookies to work across origins
    advanced: {
      cookiePrefix: 'better-auth',
      crossSubDomainCookies: {
        enabled: false,
      },
      useSecureCookies: siteUrl.startsWith('https'),
    },
    // Configure email/password authentication
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }: { user: any; url: string }) => {
        // TODO: Implement email sending
        console.log('[Better Auth] Password reset requested:', { user, url });
      },
      sendVerificationEmail: async ({ user, url }: { user: any; url: string }) => {
        // TODO: Implement email sending
        console.log('[Better Auth] Verification email requested:', { user, url });
      },
    },
    plugins: [
      // The Convex plugin is required for Convex compatibility
      convex({
        authConfig,
      }),
    ],
  });
};

// Expose the getCurrentUser query using the clientApi method
// This ensures it's properly registered in Convex's generated API
export const { getAuthUser: getCurrentUser } = authComponent.clientApi();
