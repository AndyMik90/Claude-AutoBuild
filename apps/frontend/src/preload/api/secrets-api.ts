import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  SecretGroup,
  SecretGroupInput,
  SecretAccountInput,
  IPCResult
} from '../../shared/types';

export interface SecretsAPI {
  // Encryption availability check
  checkSecretsEncryption: () => Promise<IPCResult<boolean>>;

  // Secret group operations (schema/template)
  getSecretGroups: () => Promise<IPCResult<SecretGroup[]>>;
  getSecretGroup: (groupId: string) => Promise<IPCResult<SecretGroup>>;
  createSecretGroup: (groupInput: SecretGroupInput) => Promise<IPCResult<SecretGroup>>;
  updateSecretGroup: (groupId: string, updates: Partial<SecretGroupInput>) => Promise<IPCResult<SecretGroup>>;
  deleteSecretGroup: (groupId: string) => Promise<IPCResult>;

  // Secret account operations (instances with values)
  addSecretAccount: (groupId: string, accountInput: SecretAccountInput) => Promise<IPCResult<SecretGroup>>;
  updateSecretAccount: (groupId: string, accountId: string, accountInput: SecretAccountInput) => Promise<IPCResult<SecretGroup>>;
  deleteSecretAccount: (groupId: string, accountId: string) => Promise<IPCResult<SecretGroup>>;

  // Decryption operations (secure, on-demand)
  decryptSecretAccount: (groupId: string, accountId: string) => Promise<IPCResult<Record<string, string>>>;
  decryptSecretAccountKey: (groupId: string, accountId: string, keyId: string) => Promise<IPCResult<string>>;
}

export const createSecretsAPI = (): SecretsAPI => ({
  checkSecretsEncryption: (): Promise<IPCResult<boolean>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SECRETS_CHECK_ENCRYPTION),

  getSecretGroups: (): Promise<IPCResult<SecretGroup[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SECRETS_GET_GROUPS),

  getSecretGroup: (groupId: string): Promise<IPCResult<SecretGroup>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SECRETS_GET_GROUP, groupId),

  createSecretGroup: (groupInput: SecretGroupInput): Promise<IPCResult<SecretGroup>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SECRETS_CREATE_GROUP, groupInput),

  updateSecretGroup: (groupId: string, updates: Partial<SecretGroupInput>): Promise<IPCResult<SecretGroup>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SECRETS_UPDATE_GROUP, groupId, updates),

  deleteSecretGroup: (groupId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.SECRETS_DELETE_GROUP, groupId),

  addSecretAccount: (groupId: string, accountInput: SecretAccountInput): Promise<IPCResult<SecretGroup>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SECRETS_ADD_ACCOUNT, groupId, accountInput),

  updateSecretAccount: (groupId: string, accountId: string, accountInput: SecretAccountInput): Promise<IPCResult<SecretGroup>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SECRETS_UPDATE_ACCOUNT, groupId, accountId, accountInput),

  deleteSecretAccount: (groupId: string, accountId: string): Promise<IPCResult<SecretGroup>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SECRETS_DELETE_ACCOUNT, groupId, accountId),

  decryptSecretAccount: (groupId: string, accountId: string): Promise<IPCResult<Record<string, string>>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SECRETS_DECRYPT_ACCOUNT, groupId, accountId),

  decryptSecretAccountKey: (groupId: string, accountId: string, keyId: string): Promise<IPCResult<string>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SECRETS_DECRYPT_ACCOUNT_KEY, groupId, accountId, keyId)
});
