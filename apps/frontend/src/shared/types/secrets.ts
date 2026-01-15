/**
 * Secrets management types for encrypted storage
 *
 * Structure:
 * - SecretGroup: Template/schema that defines what keys are needed (e.g., "AWS Credentials")
 * - SecretAccount: Instance of a group with actual encrypted values (e.g., "Production AWS")
 */

export interface SecretAccount {
  id: string;
  title: string;  // e.g., "Production", "Staging", "Personal"
  keys: Record<string, string>;  // Map of keyId -> encrypted value
  createdAt: number;
  updatedAt: number;
}

export interface SecretGroup {
  id: string;
  title: string;  // e.g., "AWS Credentials", "OpenAI Keys"
  description?: string;
  imagePath?: string;  // Optional icon/image
  keyIds: string[];  // Schema - the key names this group requires (e.g., ["ACCESS_KEY", "SECRET_KEY", "REGION"])
  accounts: SecretAccount[];  // Instances with actual encrypted values
  createdAt: number;
  updatedAt: number;
}

export interface SecretsStore {
  version: number;
  groups: SecretGroup[];
}

// For creating/updating groups (just the schema, no values)
export interface SecretGroupInput {
  title: string;
  description?: string;
  imagePath?: string;
  keyIds: string[];  // The key names this group will have
}

// For creating/updating accounts (actual values)
export interface SecretAccountInput {
  title: string;
  keys: Record<string, string>;  // Map of keyId -> plain text value (will be encrypted)
}
