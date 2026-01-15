/**
 * Common utility types shared across the application
 */

// IPC Types
export interface IPCResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Health Check Types
export interface HealthCheckResult {
  healthy: boolean;
  checks: Record<string, boolean>;
  details: Record<string, any>;
  message: string;
}

export interface SystemHealthCheck {
  healthy: boolean;
  timestamp: string;
  checks: {
    python: HealthCheckResult;
    git: HealthCheckResult;
    claude_auth: HealthCheckResult;
    integrations: HealthCheckResult;
    environment: HealthCheckResult;
  };
  summary: {
    total_checks: number;
    passed: number;
    failed: number;
  };
}
