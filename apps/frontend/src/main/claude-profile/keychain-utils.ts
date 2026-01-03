/**
 * macOS Keychain Utilities
 *
 * Provides functions to retrieve Claude Code OAuth tokens and email from macOS Keychain.
 * Mirrors the functionality of apps/backend/core/auth.py get_token_from_keychain()
 */

import { execFileSync } from 'child_process';

/**
 * Credentials retrieved from macOS Keychain
 */
export interface KeychainCredentials {
  token: string | null;
  email: string | null;
}

/**
 * Cache for keychain credentials to avoid repeated blocking calls
 */
interface KeychainCache {
  credentials: KeychainCredentials;
  timestamp: number;
}

let keychainCache: KeychainCache | null = null;
// Cache for 5 minutes (300,000 ms)
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Validate the structure of parsed Keychain JSON data
 * @param data - Parsed JSON data from Keychain
 * @returns true if data structure is valid, false otherwise
 */
function validateKeychainData(data: unknown): data is { claudeAiOauth?: { accessToken?: string; email?: string }; email?: string } {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Check if claudeAiOauth exists and is an object
  if (obj.claudeAiOauth !== undefined) {
    if (typeof obj.claudeAiOauth !== 'object' || obj.claudeAiOauth === null) {
      return false;
    }
    const oauth = obj.claudeAiOauth as Record<string, unknown>;
    // Validate accessToken if present
    if (oauth.accessToken !== undefined && typeof oauth.accessToken !== 'string') {
      return false;
    }
    // Validate email if present
    if (oauth.email !== undefined && typeof oauth.email !== 'string') {
      return false;
    }
  }

  // Validate top-level email if present
  if (obj.email !== undefined && typeof obj.email !== 'string') {
    return false;
  }

  return true;
}

/**
 * Retrieve Claude Code OAuth credentials (token and email) from macOS Keychain.
 *
 * Reads from the "Claude Code-credentials" service in macOS Keychain
 * and extracts both the OAuth access token and email address.
 *
 * Uses caching (5-minute TTL) to avoid repeated blocking calls.
 * Only works on macOS (Darwin platform).
 *
 * @param forceRefresh - Set to true to bypass cache and fetch fresh credentials
 * @returns Object with token and email (both may be null if not found or invalid)
 */
export function getCredentialsFromKeychain(forceRefresh = false): KeychainCredentials {
  // Only attempt on macOS
  if (process.platform !== 'darwin') {
    return { token: null, email: null };
  }

  // Return cached credentials if available and fresh
  const now = Date.now();
  if (!forceRefresh && keychainCache && (now - keychainCache.timestamp) < CACHE_TTL_MS) {
    return keychainCache.credentials;
  }

  try {
    // Query macOS Keychain for Claude Code credentials
    // Use execFileSync with argument array to prevent command injection
    const result = execFileSync(
      '/usr/bin/security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
      }
    );

    const credentialsJson = result.trim();
    if (!credentialsJson) {
      const emptyResult = { token: null, email: null };
      keychainCache = { credentials: emptyResult, timestamp: now };
      return emptyResult;
    }

    // Parse JSON response
    let data: unknown;
    try {
      data = JSON.parse(credentialsJson);
    } catch (parseError) {
      console.warn('[KeychainUtils] Keychain access failed');
      const errorResult = { token: null, email: null };
      keychainCache = { credentials: errorResult, timestamp: now };
      return errorResult;
    }

    // Validate JSON structure
    if (!validateKeychainData(data)) {
      console.warn('[KeychainUtils] Keychain access failed');
      const invalidResult = { token: null, email: null };
      keychainCache = { credentials: invalidResult, timestamp: now };
      return invalidResult;
    }

    // Extract OAuth token from nested structure
    const token = data?.claudeAiOauth?.accessToken;

    // Extract email (might be in different locations depending on Claude Code version)
    const email = data?.claudeAiOauth?.email || data?.email || null;

    // Validate token format if present (Claude OAuth tokens start with sk-ant-oat01-)
    if (token && !token.startsWith('sk-ant-oat01-')) {
      console.warn('[KeychainUtils] Keychain access failed');
      const result = { token: null, email };
      keychainCache = { credentials: result, timestamp: now };
      return result;
    }

    const credentials = { token: token || null, email };
    keychainCache = { credentials, timestamp: now };
    return credentials;
  } catch (error) {
    // Check for exit code 44 (errSecItemNotFound) which indicates item not found
    if (error && typeof error === 'object' && 'status' in error && error.status === 44) {
      // Item not found - this is expected if user hasn't run claude setup-token
      const notFoundResult = { token: null, email: null };
      keychainCache = { credentials: notFoundResult, timestamp: now };
      return notFoundResult;
    }

    // Other errors (keychain locked, access denied, etc.) - use generic message
    console.warn('[KeychainUtils] Keychain access failed');
    const errorResult = { token: null, email: null };
    keychainCache = { credentials: errorResult, timestamp: now };
    return errorResult;
  }
}

/**
 * Clear the keychain credentials cache.
 * Useful when you know the credentials have changed (e.g., after running claude setup-token)
 */
export function clearKeychainCache(): void {
  keychainCache = null;
}
