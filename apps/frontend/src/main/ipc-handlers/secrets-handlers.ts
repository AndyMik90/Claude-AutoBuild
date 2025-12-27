import { ipcMain, app } from 'electron';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  SecretGroup,
  SecretsStore,
  SecretGroupInput,
  SecretAccountInput,
  IPCResult
} from '../../shared/types';
import { v4 as uuidv4, validate as validateUUID } from 'uuid';
import { SecretsEncryption } from '../secrets-encryption';

/**
 * Security: Validate UUID format to prevent injection attacks
 */
const validateId = (id: string, fieldName: string): void => {
  if (!validateUUID(id)) {
    throw new Error(`Invalid ${fieldName}: must be a valid UUID`);
  }
};

/**
 * Security: Validate string length to prevent DoS attacks
 */
const validateStringLength = (value: string, fieldName: string, maxLength: number = 1000): void => {
  if (value.length > maxLength) {
    throw new Error(`${fieldName} exceeds maximum length of ${maxLength} characters`);
  }
};

/**
 * Security: Validate object/array size to prevent DoS attacks
 * Handles both objects (by key count) and arrays (by length)
 */
const validateObjectSize = (obj: Record<string, any> | unknown[], fieldName: string, maxItems: number = 100): void => {
  const itemCount = Array.isArray(obj) ? obj.length : Object.keys(obj).length;
  const itemType = Array.isArray(obj) ? 'items' : 'keys';

  if (itemCount > maxItems) {
    throw new Error(`${fieldName} exceeds maximum of ${maxItems} ${itemType}`);
  }
};

const getSecretsPath = (): string => {
  const userDataPath = app.getPath('userData');
  const storeDir = path.join(userDataPath, 'store');

  if (!existsSync(storeDir)) {
    mkdirSync(storeDir, { recursive: true });
  }

  return path.join(storeDir, 'secrets.json');
};

const readSecretsFile = (): SecretsStore => {
  const secretsPath = getSecretsPath();

  if (!existsSync(secretsPath)) {
    return { version: 1, groups: [] };
  }

  try {
    const data = readFileSync(secretsPath, 'utf-8');
    return JSON.parse(data) as SecretsStore;
  } catch (error) {
    console.error('[SECRETS] Failed to read secrets file:', error);
    return { version: 1, groups: [] };
  }
};

const writeSecretsFile = (store: SecretsStore): void => {
  const secretsPath = getSecretsPath();
  writeFileSync(secretsPath, JSON.stringify(store, null, 2), 'utf-8');
};

export function registerSecretsHandlers(): void {
  // Check if encryption is available
  ipcMain.handle(
    IPC_CHANNELS.SECRETS_CHECK_ENCRYPTION,
    async (): Promise<IPCResult<boolean>> => {
      try {
        const available = SecretsEncryption.isEncryptionAvailable();
        return { success: true, data: available };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to check encryption availability'
        };
      }
    }
  );

  // Get all secret groups
  ipcMain.handle(
    IPC_CHANNELS.SECRETS_GET_GROUPS,
    async (): Promise<IPCResult<SecretGroup[]>> => {
      try {
        const store = readSecretsFile();
        return { success: true, data: store.groups };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get secret groups'
        };
      }
    }
  );

  // Get a single secret group
  ipcMain.handle(
    IPC_CHANNELS.SECRETS_GET_GROUP,
    async (_, groupId: string): Promise<IPCResult<SecretGroup>> => {
      try {
        // Security: Validate UUID format
        validateId(groupId, 'groupId');

        const store = readSecretsFile();
        const group = store.groups.find(g => g.id === groupId);

        if (!group) {
          return { success: false, error: 'Secret group not found' };
        }

        return { success: true, data: group };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get secret group'
        };
      }
    }
  );

  // Create a new secret group (schema only, no accounts)
  ipcMain.handle(
    IPC_CHANNELS.SECRETS_CREATE_GROUP,
    async (_, groupInput: SecretGroupInput): Promise<IPCResult<SecretGroup>> => {
      try {
        // Security: Validate input lengths
        validateStringLength(groupInput.title, 'title', 200);
        if (groupInput.description) {
          validateStringLength(groupInput.description, 'description', 1000);
        }
        if (groupInput.imagePath) {
          validateStringLength(groupInput.imagePath, 'imagePath', 500);
        }
        validateObjectSize(groupInput.keyIds, 'keyIds', 50);

        const store = readSecretsFile();
        const now = Date.now();

        const newGroup: SecretGroup = {
          id: uuidv4(),
          title: groupInput.title,
          description: groupInput.description,
          imagePath: groupInput.imagePath,
          keyIds: groupInput.keyIds,
          accounts: [],
          createdAt: now,
          updatedAt: now
        };

        store.groups.push(newGroup);
        writeSecretsFile(store);

        return { success: true, data: newGroup };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create secret group'
        };
      }
    }
  );

  // Update a secret group (schema only)
  ipcMain.handle(
    IPC_CHANNELS.SECRETS_UPDATE_GROUP,
    async (_, groupId: string, updates: Partial<SecretGroupInput>): Promise<IPCResult<SecretGroup>> => {
      try {
        // Security: Validate UUID format
        validateId(groupId, 'groupId');

        // Security: Validate input lengths
        if (updates.title !== undefined) {
          validateStringLength(updates.title, 'title', 200);
        }
        if (updates.description !== undefined) {
          validateStringLength(updates.description, 'description', 1000);
        }
        if (updates.imagePath !== undefined) {
          validateStringLength(updates.imagePath, 'imagePath', 500);
        }
        if (updates.keyIds !== undefined) {
          validateObjectSize(updates.keyIds, 'keyIds', 50);
        }

        const store = readSecretsFile();
        const group = store.groups.find(g => g.id === groupId);

        if (!group) {
          return { success: false, error: 'Secret group not found' };
        }

        if (updates.title !== undefined) group.title = updates.title;
        if (updates.description !== undefined) group.description = updates.description;
        if (updates.imagePath !== undefined) group.imagePath = updates.imagePath;
        if (updates.keyIds !== undefined) group.keyIds = updates.keyIds;

        group.updatedAt = Date.now();
        writeSecretsFile(store);

        return { success: true, data: group };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update secret group'
        };
      }
    }
  );

  // Delete a secret group
  ipcMain.handle(
    IPC_CHANNELS.SECRETS_DELETE_GROUP,
    async (_, groupId: string): Promise<IPCResult> => {
      try {
        // Security: Validate UUID format
        validateId(groupId, 'groupId');

        const store = readSecretsFile();
        const index = store.groups.findIndex(g => g.id === groupId);

        if (index === -1) {
          return { success: false, error: 'Secret group not found' };
        }

        store.groups.splice(index, 1);
        writeSecretsFile(store);

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete secret group'
        };
      }
    }
  );

  // Add an account to a group
  ipcMain.handle(
    IPC_CHANNELS.SECRETS_ADD_ACCOUNT,
    async (_, groupId: string, accountInput: SecretAccountInput): Promise<IPCResult<SecretGroup>> => {
      try {
        // Security: Validate UUID format
        validateId(groupId, 'groupId');

        // Security: Validate input lengths
        validateStringLength(accountInput.title, 'account title', 200);
        validateObjectSize(accountInput.keys, 'account keys', 50);

        // Security: Validate each key value length
        for (const [keyId, value] of Object.entries(accountInput.keys)) {
          validateStringLength(keyId, 'key ID', 100);
          validateStringLength(value, 'key value', 10000); // Secrets can be longer
        }

        const store = readSecretsFile();
        const group = store.groups.find(g => g.id === groupId);

        if (!group) {
          return { success: false, error: 'Secret group not found' };
        }

        const now = Date.now();

        // Encrypt all key values
        const encryptedKeys: Record<string, string> = {};
        for (const [keyId, value] of Object.entries(accountInput.keys)) {
          encryptedKeys[keyId] = SecretsEncryption.encrypt(value);
        }

        const newAccount = {
          id: uuidv4(),
          title: accountInput.title,
          keys: encryptedKeys,
          createdAt: now,
          updatedAt: now
        };

        group.accounts.push(newAccount);
        group.updatedAt = now;

        writeSecretsFile(store);

        return { success: true, data: group };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add account'
        };
      }
    }
  );

  // Update an account in a group
  ipcMain.handle(
    IPC_CHANNELS.SECRETS_UPDATE_ACCOUNT,
    async (_, groupId: string, accountId: string, accountInput: SecretAccountInput): Promise<IPCResult<SecretGroup>> => {
      try {
        // Security: Validate UUID formats
        validateId(groupId, 'groupId');
        validateId(accountId, 'accountId');

        // Security: Validate input lengths
        validateStringLength(accountInput.title, 'account title', 200);
        validateObjectSize(accountInput.keys, 'account keys', 50);

        // Security: Validate each key value length
        for (const [keyId, value] of Object.entries(accountInput.keys)) {
          validateStringLength(keyId, 'key ID', 100);
          validateStringLength(value, 'key value', 10000); // Secrets can be longer
        }

        const store = readSecretsFile();
        const group = store.groups.find(g => g.id === groupId);

        if (!group) {
          return { success: false, error: 'Secret group not found' };
        }

        const account = group.accounts.find(a => a.id === accountId);
        if (!account) {
          return { success: false, error: 'Account not found' };
        }

        const now = Date.now();

        // Encrypt all key values
        const encryptedKeys: Record<string, string> = {};
        for (const [keyId, value] of Object.entries(accountInput.keys)) {
          encryptedKeys[keyId] = SecretsEncryption.encrypt(value);
        }

        account.title = accountInput.title;
        account.keys = encryptedKeys;
        account.updatedAt = now;
        group.updatedAt = now;

        writeSecretsFile(store);

        return { success: true, data: group };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update account'
        };
      }
    }
  );

  // Delete an account from a group
  ipcMain.handle(
    IPC_CHANNELS.SECRETS_DELETE_ACCOUNT,
    async (_, groupId: string, accountId: string): Promise<IPCResult<SecretGroup>> => {
      try {
        // Security: Validate UUID formats
        validateId(groupId, 'groupId');
        validateId(accountId, 'accountId');

        const store = readSecretsFile();
        const group = store.groups.find(g => g.id === groupId);

        if (!group) {
          return { success: false, error: 'Secret group not found' };
        }

        const accountIndex = group.accounts.findIndex(a => a.id === accountId);
        if (accountIndex === -1) {
          return { success: false, error: 'Account not found' };
        }

        group.accounts.splice(accountIndex, 1);
        group.updatedAt = Date.now();

        writeSecretsFile(store);

        return { success: true, data: group };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete account'
        };
      }
    }
  );

  // SECURE DECRYPTION: Decrypt a specific account's values
  ipcMain.handle(
    IPC_CHANNELS.SECRETS_DECRYPT_ACCOUNT,
    async (_, groupId: string, accountId: string): Promise<IPCResult<Record<string, string>>> => {
      try {
        // Security: Validate UUID formats
        validateId(groupId, 'groupId');
        validateId(accountId, 'accountId');

        const store = readSecretsFile();
        const group = store.groups.find(g => g.id === groupId);

        if (!group) {
          return { success: false, error: 'Secret group not found' };
        }

        const account = group.accounts.find(a => a.id === accountId);
        if (!account) {
          return { success: false, error: 'Account not found' };
        }

        // Decrypt all keys (NO logging of decrypted values)
        const decryptedKeys: Record<string, string> = {};
        for (const [keyId, encryptedValue] of Object.entries(account.keys)) {
          decryptedKeys[keyId] = SecretsEncryption.decrypt(encryptedValue);
        }

        return { success: true, data: decryptedKeys };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to decrypt account'
        };
      }
    }
  );

  // SECURE DECRYPTION: Decrypt a specific key from an account
  ipcMain.handle(
    IPC_CHANNELS.SECRETS_DECRYPT_ACCOUNT_KEY,
    async (_, groupId: string, accountId: string, keyId: string): Promise<IPCResult<string>> => {
      try {
        // Security: Validate UUID formats
        validateId(groupId, 'groupId');
        validateId(accountId, 'accountId');

        // Security: Validate keyId length
        validateStringLength(keyId, 'keyId', 100);

        const store = readSecretsFile();
        const group = store.groups.find(g => g.id === groupId);

        if (!group) {
          return { success: false, error: 'Secret group not found' };
        }

        const account = group.accounts.find(a => a.id === accountId);
        if (!account) {
          return { success: false, error: 'Account not found' };
        }

        const encryptedValue = account.keys[keyId];
        if (!encryptedValue) {
          return { success: false, error: 'Key not found in account' };
        }

        // Decrypt value (NO logging of decrypted value)
        const decryptedValue = SecretsEncryption.decrypt(encryptedValue);

        return { success: true, data: decryptedValue };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to decrypt key'
        };
      }
    }
  );
}
