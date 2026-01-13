interface SentryErrorEvent {
  [key: string]: unknown;
}

interface SentryScope {
  setContext: (key: string, value: Record<string, unknown>) => void;
}

interface SentryInitOptions {
  beforeSend?: (event: SentryErrorEvent) => SentryErrorEvent | null;
  tracesSampleRate?: number;
  profilesSampleRate?: number;
  dsn?: string;
  environment?: string;
  release?: string;
  debug?: boolean;
  enabled?: boolean;
}

declare module '@sentry/electron/main' {
  export type ErrorEvent = SentryErrorEvent;
  export function init(options: SentryInitOptions): void;
  export function captureException(error: Error): void;
  export function withScope(callback: (scope: SentryScope) => void): void;
}

declare module '@sentry/electron/renderer' {
  export type ErrorEvent = SentryErrorEvent;
  export function init(options: SentryInitOptions): void;
  export function captureException(error: Error): void;
  export function withScope(callback: (scope: SentryScope) => void): void;
}
