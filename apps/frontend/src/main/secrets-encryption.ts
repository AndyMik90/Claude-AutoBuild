import { safeStorage } from 'electron';

/**
 * Encryption utilities for secrets management
 * Uses Electron's safeStorage API which leverages OS-level encryption:
 * - macOS: Keychain
 * - Windows: DPAPI
 * - Linux: libsecret
 */

export class SecretsEncryption {
  /**
   * Check if encryption is available
   */
  static isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  /**
   * Encrypt a secret value
   * @param plainText - The plain text value to encrypt
   * @returns Base64-encoded encrypted value
   */
  static encrypt(plainText: string): string {
    if (!this.isEncryptionAvailable()) {
      throw new Error('Encryption is not available on this system');
    }

    const buffer = safeStorage.encryptString(plainText);
    return buffer.toString('base64');
  }

  /**
   * Decrypt a secret value
   * @param encryptedValue - Base64-encoded encrypted value
   * @returns Decrypted plain text
   */
  static decrypt(encryptedValue: string): string {
    if (!this.isEncryptionAvailable()) {
      throw new Error('Encryption is not available on this system');
    }

    const buffer = Buffer.from(encryptedValue, 'base64');
    return safeStorage.decryptString(buffer);
  }

  /**
   * Re-encrypt a value (useful for key rotation)
   * @param encryptedValue - Current encrypted value
   * @returns New encrypted value
   */
  static reEncrypt(encryptedValue: string): string {
    const plainText = this.decrypt(encryptedValue);
    return this.encrypt(plainText);
  }
}
