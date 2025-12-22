/**
 * Memory Infrastructure IPC Handlers
 *
 * Provides memory database status and validation for the Graphiti integration.
 * Uses LadybugDB (embedded Kuzu-based database) - no Docker required.
 */

import { ipcMain } from 'electron';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  IPCResult,
  InfrastructureStatus,
  GraphitiValidationResult,
  GraphitiConnectionTestResult,
} from '../../shared/types';
import {
  getMemoryServiceStatus,
  getMemoryService,
  getDefaultDbPath,
  isKuzuAvailable,
} from '../memory-service';
import { validateOpenAIApiKey } from '../api-validation-service';
import { findPythonCommand, parsePythonCommand } from '../python-detector';

// Ollama types
interface OllamaStatus {
  running: boolean;
  url: string;
  version?: string;
  message?: string;
}

interface OllamaModel {
  name: string;
  size_bytes: number;
  size_gb: number;
  modified_at: string;
  is_embedding: boolean;
  embedding_dim?: number | null;
  description?: string;
}

interface OllamaEmbeddingModel {
  name: string;
  embedding_dim: number | null;
  description: string;
  size_bytes: number;
  size_gb: number;
}

interface OllamaRecommendedModel {
  name: string;
  description: string;
  size_estimate: string;
  dim: number;
  installed: boolean;
}

interface OllamaPullResult {
  model: string;
  status: 'completed' | 'failed';
  output: string[];
}

/**
 * Execute the ollama_model_detector.py script
 */
async function executeOllamaDetector(
  command: string,
  baseUrl?: string
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const pythonCmd = findPythonCommand();
  if (!pythonCmd) {
    return { success: false, error: 'Python not found' };
  }

  // Find the ollama_model_detector.py script
  const possiblePaths = [
    // Development paths
    path.resolve(__dirname, '..', '..', '..', '..', 'backend', 'ollama_model_detector.py'),
    path.resolve(process.cwd(), 'apps', 'backend', 'ollama_model_detector.py'),
    // Legacy paths (for backwards compatibility)
    path.resolve(__dirname, '..', '..', '..', 'auto-claude', 'ollama_model_detector.py'),
    path.resolve(process.cwd(), 'auto-claude', 'ollama_model_detector.py'),
  ];

  let scriptPath: string | null = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      scriptPath = p;
      break;
    }
  }

  if (!scriptPath) {
    return { success: false, error: 'ollama_model_detector.py script not found' };
  }

  const [pythonExe, baseArgs] = parsePythonCommand(pythonCmd);
  const args = [...baseArgs, scriptPath, command];
  if (baseUrl) {
    args.push('--base-url', baseUrl);
  }

  return new Promise((resolve) => {
    let resolved = false;
    const proc = spawn(pythonExe, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Single timeout mechanism to avoid race condition
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        resolve({ success: false, error: 'Timeout' });
      }
    }, 10000);

    proc.on('close', (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      if (code === 0 && stdout) {
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve({ success: false, error: `Invalid JSON: ${stdout}` });
        }
      } else {
        resolve({ success: false, error: stderr || `Exit code ${code}` });
      }
    });

    proc.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Register all memory-related IPC handlers
 */
export function registerMemoryHandlers(): void {
  // Get memory infrastructure status
  ipcMain.handle(
    IPC_CHANNELS.MEMORY_STATUS,
    async (_): Promise<IPCResult<InfrastructureStatus>> => {
      try {
        const status = getMemoryServiceStatus();
        return {
          success: true,
          data: {
            memory: status,
            ready: status.kuzuInstalled && status.databaseExists,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to check memory status',
        };
      }
    }
  );

  // List available databases
  ipcMain.handle(
    IPC_CHANNELS.MEMORY_LIST_DATABASES,
    async (_, dbPath?: string): Promise<IPCResult<string[]>> => {
      try {
        const status = getMemoryServiceStatus(dbPath);
        return { success: true, data: status.databases };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list databases',
        };
      }
    }
  );

  // Test memory database connection
  ipcMain.handle(
    IPC_CHANNELS.MEMORY_TEST_CONNECTION,
    async (_, dbPath?: string, database?: string): Promise<IPCResult<GraphitiValidationResult>> => {
      try {
        if (!isKuzuAvailable()) {
          return {
            success: true,
            data: {
              success: false,
              message: 'kuzu-node is not installed. Memory features require Python 3.12+ with LadybugDB.',
            },
          };
        }

        const service = getMemoryService({
          dbPath: dbPath || getDefaultDbPath(),
          database: database || 'auto_claude_memory',
        });

        const result = await service.testConnection();
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to test connection',
        };
      }
    }
  );

  // ============================================
  // Graphiti Validation Handlers
  // ============================================

  // Validate LLM provider API key (OpenAI, Anthropic, etc.)
  ipcMain.handle(
    IPC_CHANNELS.GRAPHITI_VALIDATE_LLM,
    async (_, provider: string, apiKey: string): Promise<IPCResult<GraphitiValidationResult>> => {
      try {
        // For now, we only validate OpenAI - other providers can be added later
        if (provider === 'openai') {
          const result = await validateOpenAIApiKey(apiKey);
          return { success: true, data: result };
        }

        // For other providers, do basic validation
        if (!apiKey || !apiKey.trim()) {
          return {
            success: true,
            data: {
              success: false,
              message: 'API key is required',
            },
          };
        }

        return {
          success: true,
          data: {
            success: true,
            message: `${provider} API key format appears valid`,
            details: { provider },
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to validate API key',
        };
      }
    }
  );

  // Test full Graphiti connection (Database + LLM provider)
  ipcMain.handle(
    IPC_CHANNELS.GRAPHITI_TEST_CONNECTION,
    async (
      _,
      config: {
        dbPath?: string;
        database?: string;
        llmProvider: string;
        apiKey: string;
      }
    ): Promise<IPCResult<GraphitiConnectionTestResult>> => {
      try {
        // Test database connection
        let databaseResult: GraphitiValidationResult;

        if (!isKuzuAvailable()) {
          databaseResult = {
            success: false,
            message: 'kuzu-node is not installed. Memory features require Python 3.12+ with LadybugDB.',
          };
        } else {
          const service = getMemoryService({
            dbPath: config.dbPath || getDefaultDbPath(),
            database: config.database || 'auto_claude_memory',
          });
          databaseResult = await service.testConnection();
        }

        // Test LLM provider
        let llmResult: GraphitiValidationResult;

        if (config.llmProvider === 'openai') {
          llmResult = await validateOpenAIApiKey(config.apiKey);
        } else if (config.llmProvider === 'ollama') {
          // Ollama doesn't need API key validation
          llmResult = {
            success: true,
            message: 'Ollama (local) does not require API key validation',
            details: { provider: 'ollama' },
          };
        } else {
          // Basic validation for other providers
          llmResult = config.apiKey && config.apiKey.trim()
            ? {
                success: true,
                message: `${config.llmProvider} API key format appears valid`,
                details: { provider: config.llmProvider },
              }
            : {
                success: false,
                message: 'API key is required',
              };
        }

        return {
          success: true,
          data: {
            database: databaseResult,
            llmProvider: llmResult,
            ready: databaseResult.success && llmResult.success,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to test Graphiti connection',
        };
      }
    }
  );

  // ============================================
  // Ollama Model Detection Handlers
  // ============================================

  // Check if Ollama is running
  ipcMain.handle(
    IPC_CHANNELS.OLLAMA_CHECK_STATUS,
    async (_, baseUrl?: string): Promise<IPCResult<OllamaStatus>> => {
      try {
        const result = await executeOllamaDetector('check-status', baseUrl);

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to check Ollama status',
          };
        }

        return {
          success: true,
          data: result.data as OllamaStatus,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to check Ollama status',
        };
      }
    }
  );

  // List all Ollama models
  ipcMain.handle(
    IPC_CHANNELS.OLLAMA_LIST_MODELS,
    async (_, baseUrl?: string): Promise<IPCResult<{ models: OllamaModel[]; count: number }>> => {
      try {
        const result = await executeOllamaDetector('list-models', baseUrl);

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to list Ollama models',
          };
        }

        const data = result.data as { models: OllamaModel[]; count: number; url: string };
        return {
          success: true,
          data: {
            models: data.models,
            count: data.count,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list Ollama models',
        };
      }
    }
  );

  // List only embedding models from Ollama
  ipcMain.handle(
    IPC_CHANNELS.OLLAMA_LIST_EMBEDDING_MODELS,
    async (
      _,
      baseUrl?: string
    ): Promise<IPCResult<{ embedding_models: OllamaEmbeddingModel[]; count: number }>> => {
      try {
        const result = await executeOllamaDetector('list-embedding-models', baseUrl);

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to list Ollama embedding models',
          };
        }

        const data = result.data as {
          embedding_models: OllamaEmbeddingModel[];
          count: number;
          url: string;
        };
        return {
          success: true,
          data: {
            embedding_models: data.embedding_models,
            count: data.count,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list embedding models',
        };
      }
    }
  );

  // Pull (download) an Ollama model
  ipcMain.handle(
    IPC_CHANNELS.OLLAMA_PULL_MODEL,
    async (
      _,
      modelName: string,
      baseUrl?: string
    ): Promise<IPCResult<OllamaPullResult>> => {
      try {
        const pythonCmd = findPythonCommand();
        if (!pythonCmd) {
          return { success: false, error: 'Python not found' };
        }

        // Find the ollama_model_detector.py script
        const possiblePaths = [
          path.resolve(__dirname, '..', '..', '..', 'auto-claude', 'ollama_model_detector.py'),
          path.resolve(process.cwd(), 'auto-claude', 'ollama_model_detector.py'),
          path.resolve(process.cwd(), '..', 'auto-claude', 'ollama_model_detector.py'),
        ];

        let scriptPath: string | null = null;
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            scriptPath = p;
            break;
          }
        }

        if (!scriptPath) {
          return { success: false, error: 'ollama_model_detector.py script not found' };
        }

        const [pythonExe, baseArgs] = parsePythonCommand(pythonCmd);
        const args = [...baseArgs, scriptPath, 'pull-model', modelName];

        return new Promise((resolve) => {
          const proc = spawn(pythonExe, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 600000, // 10 minute timeout for large models
          });

          let stdout = '';
          let stderr = '';

          proc.stdout.on('data', (data) => {
            stdout += data.toString();
          });

          proc.stderr.on('data', (data) => {
            stderr += data.toString();
            // Could emit progress events here in the future
          });

          proc.on('close', (code) => {
            if (code === 0 && stdout) {
              try {
                const result = JSON.parse(stdout);
                if (result.success) {
                  resolve({
                    success: true,
                    data: result.data as OllamaPullResult,
                  });
                } else {
                  resolve({
                    success: false,
                    error: result.error || 'Failed to pull model',
                  });
                }
              } catch {
                resolve({ success: false, error: `Invalid JSON: ${stdout}` });
              }
            } else {
              resolve({ success: false, error: stderr || `Exit code ${code}` });
            }
          });

          proc.on('error', (err) => {
            resolve({ success: false, error: err.message });
          });
        });
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to pull model',
        };
      }
    }
  );
}
