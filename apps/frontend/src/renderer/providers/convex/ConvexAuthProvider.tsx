"use client";

import { useState, useEffect } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { authClient } from "@/shared/lib/convex/auth-client";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  enabled?: boolean;
  convexUrl?: string;
}

/**
 * Convex Auth Provider Component
 *
 * Wraps the application with Convex and Better Auth providers.
 * Auth is optional - when disabled, children render without auth context.
 *
 * @param enabled - Whether Convex auth is enabled (from settings)
 * @param convexUrl - The Convex deployment URL
 * @param children - Child components to wrap
 */
export function ConvexAuthProvider({ children, enabled = false, convexUrl }: Props) {
  const [isReady, setIsReady] = useState(!enabled);

  useEffect(() => {
    if (enabled && convexUrl) {
      // Initialize Convex client when enabled
      setIsReady(true);
    } else if (!enabled) {
      // Reset when disabled
      setIsReady(true);
    }
  }, [enabled, convexUrl]);

  // If auth is disabled, render children without provider
  if (!enabled) {
    return <>{children}</>;
  }

  // If enabled but no URL, show loading state
  if (!convexUrl) {
    return <>{children}</>;
  }

  if (!isReady) {
    return <>{children}</>;
  }

  const convex = new ConvexReactClient(convexUrl);

  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      {children}
    </ConvexBetterAuthProvider>
  );
}
