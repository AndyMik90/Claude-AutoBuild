/**
 * Debug Logger
 * Only logs when DEBUG=true in environment
 */

export const isDebugEnabled = (): boolean => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env.DEBUG === 'true';
  }
  return false;
};

export const debugLog = (...args: unknown[]): void => {
  if (isDebugEnabled()) {
    console.warn(...args);
  }
};

export const debugWarn = (...args: unknown[]): void => {
  if (isDebugEnabled()) {
    console.warn(...args);
  }
};

export const debugError = (...args: unknown[]): void => {
  if (isDebugEnabled()) {
    console.error(...args);
  }
};
