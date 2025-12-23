import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import type {
  APIProfile,
  ProfileFormData,
  ProfilesFile,
  TestConnectionResult
} from '@auto-claude/profile-service';

export interface ProfileAPI {
  // Get all profiles
  getAPIProfiles: () => Promise<IPCResult<ProfilesFile>>;

  // Save/create a profile
  saveAPIProfile: (
    profile: ProfileFormData
  ) => Promise<IPCResult<APIProfile>>;

  // Update an existing profile
  updateAPIProfile: (
    profile: APIProfile
  ) => Promise<IPCResult<APIProfile>>;

  // Delete a profile
  deleteAPIProfile: (profileId: string) => Promise<IPCResult>;

  // Set active profile (null to switch to OAuth)
  setActiveAPIProfile: (profileId: string | null) => Promise<IPCResult>;

  // Test API profile connection
  testConnection: (
    baseUrl: string,
    apiKey: string,
    signal?: AbortSignal
  ) => Promise<IPCResult<TestConnectionResult>>;
}

let testConnectionRequestId = 0;

export const createProfileAPI = (): ProfileAPI => ({
  // Get all profiles
  getAPIProfiles: (): Promise<IPCResult<ProfilesFile>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROFILES_GET),

  // Save/create a profile
  saveAPIProfile: (
    profile: ProfileFormData
  ): Promise<IPCResult<APIProfile>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROFILES_SAVE, profile),

  // Update an existing profile
  updateAPIProfile: (
    profile: APIProfile
  ): Promise<IPCResult<APIProfile>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROFILES_UPDATE, profile),

  // Delete a profile
  deleteAPIProfile: (profileId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROFILES_DELETE, profileId),

  // Set active profile (null to switch to OAuth)
  setActiveAPIProfile: (profileId: string | null): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROFILES_SET_ACTIVE, profileId),

  // Test API profile connection
  testConnection: (
    baseUrl: string,
    apiKey: string,
    signal?: AbortSignal
  ): Promise<IPCResult<TestConnectionResult>> => {
    // Check if already aborted before initiating request
    if (signal?.aborted) {
      return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
    }
    
    const requestId = ++testConnectionRequestId;
    
    if (signal) {
      signal.addEventListener('abort', () => {
        ipcRenderer.send(IPC_CHANNELS.PROFILES_TEST_CONNECTION_CANCEL, requestId);
      }, { once: true });
    }
    
    return ipcRenderer.invoke(IPC_CHANNELS.PROFILES_TEST_CONNECTION, baseUrl, apiKey, requestId);
  }
});
