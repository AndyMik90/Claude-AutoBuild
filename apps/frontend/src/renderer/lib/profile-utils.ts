/**
 * Profile Utility Functions
 *
 * Helper functions for API profile management in the renderer process.
 */

/**
 * Mask API key for display - shows only last 4 characters
 * Example: sk-ant-test-key-1234 -> ••••1234
 */
export function maskApiKey(key: string): string {
  if (!key || key.length <= 4) {
    return '••••';
  }
  return `••••${key.slice(-4)}`;
}

/**
 * Validate if a string is a valid URL format
 */
export function isValidUrl(url: string): boolean {
  if (!url || url.trim() === '') {
    return false;
  }

  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate if a string looks like a valid API key
 * (basic length and character check)
 */
export function isValidApiKey(key: string): boolean {
  if (!key || key.trim() === '') {
    return false;
  }

  const trimmed = key.trim();
  if (trimmed.length < 12) {
    return false;
  }

  return /^[a-zA-Z0-9\-_+.]+$/.test(trimmed);
}
