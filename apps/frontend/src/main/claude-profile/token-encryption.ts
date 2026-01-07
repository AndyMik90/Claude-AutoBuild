/**
 * Token Encryption Module
 * Handles OAuth token encryption/decryption using OS keychain
 */

import { safeStorage } from 'electron';

/**
 * Encrypt a token using the OS keychain (safeStorage API).
 * Returns base64-encoded encrypted data, or the raw token if encryption unavailable.
 */
export function encryptToken(token: string): string {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(token);
      // Prefix with 'enc:' to identify encrypted tokens
      return 'enc:' + encrypted.toString('base64');
    }
  } catch (error) {
    console.warn('[TokenEncryption] Encryption not available, storing token as-is:', error);
  }
  return token;
}

/**
 * Decrypt a token. Handles both encrypted (enc:...) and legacy plain tokens.
 */
export function decryptToken(storedToken: string): string {
  try {
    if (storedToken.startsWith('enc:') && safeStorage.isEncryptionAvailable()) {
      const encryptedData = Buffer.from(storedToken.slice(4), 'base64');
      return safeStorage.decryptString(encryptedData);
    }
  } catch (error) {
    console.error('[TokenEncryption] Failed to decrypt token:', error);
    return ''; // Return empty string on decryption failure
  }
  // Return as-is for legacy unencrypted tokens
  return storedToken;
}

/**
 * Check if a token is encrypted
 */
export function isTokenEncrypted(storedToken: string): boolean {
  return storedToken.startsWith('enc:');
}
