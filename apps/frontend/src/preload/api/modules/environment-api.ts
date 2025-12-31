import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult } from '../../../shared/types';
import { createIpcListener, invokeIpc, IpcListenerCleanup } from './ipc-utils';

/**
 * Environment validation status types (matches environment-handlers.ts)
 */
export interface EnvironmentValidationStatus {
  isValidating: boolean;
  isComplete: boolean;
  buildToolsResult: {
    success: boolean;
    platform: string;
    missingTools: string[];
    errors: string[];
    installationInstructions: string;
  } | null;
  environmentResult: {
    success: boolean;
    bundled: { success: boolean; errors: string[] } | null;
    venv: { success: boolean; errors: string[] } | null;
    summary: string;
  } | null;
  overallSuccess: boolean;
  lastValidatedAt: string | null;
}

/**
 * Environment Validation API operations
 */
export interface EnvironmentAPI {
  // Operations
  getValidationStatus: () => Promise<IPCResult<EnvironmentValidationStatus>>;
  startValidation: () => Promise<IPCResult<EnvironmentValidationStatus>>;

  // Event Listeners
  onValidationProgress: (callback: (message: string) => void) => IpcListenerCleanup;
  onValidationComplete: (callback: (status: EnvironmentValidationStatus) => void) => IpcListenerCleanup;
  onValidationError: (callback: (error: string) => void) => IpcListenerCleanup;
}

/**
 * Creates the Environment Validation API implementation
 */
export const createEnvironmentAPI = (): EnvironmentAPI => ({
  // Operations
  getValidationStatus: (): Promise<IPCResult<EnvironmentValidationStatus>> =>
    invokeIpc(IPC_CHANNELS.ENV_VALIDATE_STATUS),

  startValidation: (): Promise<IPCResult<EnvironmentValidationStatus>> =>
    invokeIpc(IPC_CHANNELS.ENV_VALIDATE_START),

  // Event Listeners
  onValidationProgress: (callback: (message: string) => void): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.ENV_VALIDATE_PROGRESS, callback),

  onValidationComplete: (callback: (status: EnvironmentValidationStatus) => void): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.ENV_VALIDATE_COMPLETE, callback),

  onValidationError: (callback: (error: string) => void): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.ENV_VALIDATE_ERROR, callback)
});
