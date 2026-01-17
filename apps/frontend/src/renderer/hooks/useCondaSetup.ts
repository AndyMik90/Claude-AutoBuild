import { useState, useEffect, useCallback, useRef } from 'react';
import type { CondaSetupStep, SetupProgress } from '../../shared/types';

/**
 * Log entry accumulated during setup
 */
export interface CondaSetupLogEntry {
  step: CondaSetupStep;
  message: string;
  detail?: string;
}

/**
 * Options for the useCondaSetup hook
 */
export interface UseCondaSetupOptions {
  /** Type of environment to set up */
  type: 'app' | 'project';
  /** Project path (required for project type) */
  projectPath?: string;
  /** Project name (required for project type) */
  projectName?: string;
  /** Python version to install (e.g., '3.12'). If not provided, auto-detects from project files */
  pythonVersion?: string;
}

/**
 * Return type for the useCondaSetup hook
 */
export interface UseCondaSetupReturn {
  /** Current step in the setup process */
  step: CondaSetupStep;
  /** Current progress message */
  message: string;
  /** Detailed log output for current step */
  detail: string;
  /** Progress percentage (0-100) if available */
  progress: number | undefined;
  /** All logs collected during setup */
  logs: CondaSetupLogEntry[];
  /** Whether setup is currently running */
  isRunning: boolean;
  /** Error message if setup failed */
  error: string | null;
  /** Start the setup process */
  startSetup: () => Promise<void>;
  /** Cancel the setup process */
  cancelSetup: () => void;
  /** Reset state to allow retry */
  reset: () => void;
}

/**
 * React hook for managing Conda environment setup.
 *
 * Handles both app-level (Auto Claude) and project-level environment setup,
 * tracking progress and collecting logs throughout the process.
 *
 * @param options - Configuration for the setup process
 * @returns Setup state and control functions
 *
 * @example
 * ```tsx
 * // App-level setup
 * const { step, message, isRunning, startSetup } = useCondaSetup({ type: 'app' });
 *
 * // Project-level setup
 * const { step, message, isRunning, startSetup } = useCondaSetup({
 *   type: 'project',
 *   projectPath: '/path/to/project',
 *   projectName: 'my-project'
 * });
 * ```
 */
export function useCondaSetup(options: UseCondaSetupOptions): UseCondaSetupReturn {
  const { type, projectPath, projectName, pythonVersion } = options;

  // State for tracking setup progress
  const [step, setStep] = useState<CondaSetupStep>('detecting');
  const [message, setMessage] = useState<string>('');
  const [detail, setDetail] = useState<string>('');
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [logs, setLogs] = useState<CondaSetupLogEntry[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Ref to track if component is mounted (for async cleanup)
  const isMountedRef = useRef<boolean>(true);
  // Ref to store cleanup function for progress listener
  const cleanupRef = useRef<(() => void) | null>(null);

  // Subscribe to progress events
  useEffect(() => {
    // Reset mounted ref on each effect run (important for React 18 StrictMode)
    isMountedRef.current = true;

    const handleProgress = (progressData: SetupProgress) => {
      if (!isMountedRef.current) return;

      // Update current state
      setStep(progressData.step);
      setMessage(progressData.message);
      setDetail(progressData.detail || '');
      setProgress(progressData.progress);

      // Accumulate log entry (limit to last 50 entries to prevent memory issues)
      setLogs((prevLogs) => {
        const newLogs = [
          ...prevLogs,
          {
            step: progressData.step,
            message: progressData.message,
            detail: progressData.detail,
          },
        ];
        // Keep only the last 50 entries
        return newLogs.length > 50 ? newLogs.slice(-50) : newLogs;
      });

      // Check for completion or error states
      if (progressData.step === 'complete' || progressData.step === 'error') {
        setIsRunning(false);
        if (progressData.step === 'error') {
          setError(progressData.message);
        }
      }
    };

    // Subscribe to progress events
    cleanupRef.current = window.electronAPI.conda.onSetupProgress(handleProgress);

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  /**
   * Start the setup process
   */
  const startSetup = useCallback(async () => {
    // Validate project options for project type
    if (type === 'project' && (!projectPath || !projectName)) {
      setError('Project path and name are required for project environment setup');
      setStep('error');
      return;
    }

    // Reset state for new setup
    setIsRunning(true);
    setError(null);
    setLogs([]);
    setStep('detecting');
    setMessage('Starting setup...');
    setDetail('');
    setProgress(undefined);

    try {
      if (type === 'app') {
        const result = await window.electronAPI.conda.setupAutoClaudeEnv();
        if (!result.success && result.error) {
          throw new Error(result.error);
        }
      } else {
        const result = await window.electronAPI.conda.setupProjectEnv(projectPath!, projectName!, pythonVersion);
        if (!result.success && result.error) {
          throw new Error(result.error);
        }
      }
      // For successful completion, the progress event handler sets
      // isRunning to false when step becomes 'complete'.
    } catch (err) {
      if (isMountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : 'Setup failed';
        setError(errorMessage);
        setStep('error');
        setMessage(errorMessage);
        setIsRunning(false);
      }
    }
  }, [type, projectPath, projectName, pythonVersion]);

  /**
   * Cancel the setup process
   * Note: Currently just resets state as actual cancellation would require
   * backend support for interrupting conda commands
   */
  const cancelSetup = useCallback(() => {
    setIsRunning(false);
    setMessage('Setup cancelled');
    setStep('error');
    setError('Setup was cancelled');
  }, []);

  /**
   * Reset state to allow retry
   */
  const reset = useCallback(() => {
    setStep('detecting');
    setMessage('');
    setDetail('');
    setProgress(undefined);
    setLogs([]);
    setIsRunning(false);
    setError(null);
  }, []);

  return {
    step,
    message,
    detail,
    progress,
    logs,
    isRunning,
    error,
    startSetup,
    cancelSetup,
    reset,
  };
}
