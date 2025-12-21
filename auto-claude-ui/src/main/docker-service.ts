/**
 * Docker & FalkorDB Service
 *
 * Provides automatic detection and management of Docker and FalkorDB
 * for non-technical users. This eliminates the need for manual
 * "docker --version" verification steps.
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { request as httpRequest, IncomingMessage } from 'http';
import { request as httpsRequest } from 'https';

const execAsync = promisify(exec);

// FalkorDB container configuration
const FALKORDB_CONTAINER_NAME = 'auto-claude-falkordb';
const FALKORDB_IMAGE = 'falkordb/falkordb:latest';
const FALKORDB_DEFAULT_PORT = 6380;

export interface DockerStatus {
  installed: boolean;
  running: boolean;
  version?: string;
  error?: string;
}

export interface FalkorDBStatus {
  containerExists: boolean;
  containerRunning: boolean;
  containerName: string;
  port: number;
  healthy: boolean;
  error?: string;
}

export interface InfrastructureStatus {
  docker: DockerStatus;
  falkordb: FalkorDBStatus;
  ready: boolean; // True if both Docker is running and FalkorDB is healthy
}

/**
 * Check if Docker is installed and running
 */
export async function checkDockerStatus(): Promise<DockerStatus> {
  try {
    // Check if Docker CLI is available
    const { stdout: versionOutput } = await execAsync('docker --version', {
      timeout: 5000,
    });

    const version = versionOutput.trim();

    // Check if Docker daemon is running by trying to ping it
    try {
      await execAsync('docker info', { timeout: 10000 });
      return {
        installed: true,
        running: true,
        version,
      };
    } catch {
      return {
        installed: true,
        running: false,
        version,
        error: 'Docker is installed but not running. Please start Docker Desktop.',
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Check if it's a "command not found" type error
    if (
      errorMsg.includes('not found') ||
      errorMsg.includes('ENOENT') ||
      errorMsg.includes('not recognized')
    ) {
      return {
        installed: false,
        running: false,
        error: 'Docker is not installed. Please install Docker Desktop.',
      };
    }

    return {
      installed: false,
      running: false,
      error: `Docker check failed: ${errorMsg}`,
    };
  }
}

/**
 * Get the actual port mapping for the FalkorDB container from Docker
 */
async function getContainerPortMapping(): Promise<number | null> {
  try {
    // Get the port mapping from Docker - format: "0.0.0.0:6380->6379/tcp"
    const { stdout } = await execAsync(
      `docker port ${FALKORDB_CONTAINER_NAME} 6379`,
      { timeout: 5000 }
    );

    const portMatch = stdout.trim().match(/:(\d+)/);
    if (portMatch) {
      return parseInt(portMatch[1], 10);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check FalkorDB container status
 */
export async function checkFalkorDBStatus(port: number = FALKORDB_DEFAULT_PORT): Promise<FalkorDBStatus> {
  const status: FalkorDBStatus = {
    containerExists: false,
    containerRunning: false,
    containerName: FALKORDB_CONTAINER_NAME,
    port,
    healthy: false,
  };

  try {
    // Check if container exists and get its status
    const { stdout } = await execAsync(
      `docker ps -a --filter "name=${FALKORDB_CONTAINER_NAME}" --format "{{.Status}}"`,
      { timeout: 5000 }
    );

    const containerStatus = stdout.trim();

    if (containerStatus) {
      status.containerExists = true;
      status.containerRunning = containerStatus.toLowerCase().startsWith('up');

      if (status.containerRunning) {
        // Get the actual port mapping from Docker
        const actualPort = await getContainerPortMapping();
        if (actualPort) {
          status.port = actualPort;
        }

        // Check if FalkorDB is responding
        status.healthy = await checkFalkorDBHealth(status.port);
      }
    }

    return status;
  } catch (error) {
    status.error = error instanceof Error ? error.message : String(error);
    return status;
  }
}

/**
 * Check if FalkorDB is responding to connections
 */
async function checkFalkorDBHealth(_port: number): Promise<boolean> {
  try {
    // Try to ping FalkorDB using redis-cli (FalkorDB uses Redis protocol)
    // Since we may not have redis-cli, we'll check if the port is listening
    await execAsync(`docker exec ${FALKORDB_CONTAINER_NAME} redis-cli PING`, {
      timeout: 5000,
    });
    return true;
  } catch {
    // Fallback: just check if container is running (less accurate)
    return false;
  }
}

/**
 * Get combined infrastructure status
 */
export async function getInfrastructureStatus(
  falkordbPort: number = FALKORDB_DEFAULT_PORT
): Promise<InfrastructureStatus> {
  const [docker, falkordb] = await Promise.all([
    checkDockerStatus(),
    checkFalkorDBStatus(falkordbPort),
  ]);

  return {
    docker,
    falkordb,
    ready: docker.running && falkordb.containerRunning && falkordb.healthy,
  };
}

/**
 * Start FalkorDB container
 * Creates a new container if it doesn't exist, or starts the existing one
 */
export async function startFalkorDB(
  port: number = FALKORDB_DEFAULT_PORT
): Promise<{ success: boolean; error?: string }> {
  try {
    // First, check Docker status
    const dockerStatus = await checkDockerStatus();
    if (!dockerStatus.running) {
      return {
        success: false,
        error: dockerStatus.error || 'Docker is not running',
      };
    }

    // Check if container already exists
    const falkordbStatus = await checkFalkorDBStatus(port);

    if (falkordbStatus.containerExists) {
      if (falkordbStatus.containerRunning) {
        // Already running
        return { success: true };
      }

      // Start existing container
      await execAsync(`docker start ${FALKORDB_CONTAINER_NAME}`, { timeout: 30000 });
    } else {
      // Create and start new container
      await execAsync(
        `docker run -d --name ${FALKORDB_CONTAINER_NAME} -p ${port}:6379 ${FALKORDB_IMAGE}`,
        { timeout: 60000 }
      );
    }

    // Wait for FalkorDB to be ready (up to 30 seconds)
    const ready = await waitForFalkorDB(port, 30000);

    if (!ready) {
      return {
        success: false,
        error: 'FalkorDB container started but is not responding. Please check Docker logs.',
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Stop FalkorDB container
 */
export async function stopFalkorDB(): Promise<{ success: boolean; error?: string }> {
  try {
    await execAsync(`docker stop ${FALKORDB_CONTAINER_NAME}`, { timeout: 30000 });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Wait for FalkorDB to be ready
 */
async function waitForFalkorDB(port: number, timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();
  const checkInterval = 1000; // Check every second

  while (Date.now() - startTime < timeoutMs) {
    const status = await checkFalkorDBStatus(port);
    if (status.containerRunning && status.healthy) {
      return true;
    }
    // If container is running but not healthy yet, wait
    if (status.containerRunning) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    } else {
      // Container stopped unexpectedly
      return false;
    }
  }

  return false;
}

/**
 * Open Docker Desktop application (macOS/Windows)
 */
export async function openDockerDesktop(): Promise<{ success: boolean; error?: string }> {
  try {
    if (process.platform === 'darwin') {
      // macOS
      await execAsync('open -a Docker', { timeout: 5000 });
    } else if (process.platform === 'win32') {
      // Windows
      spawn('cmd', ['/c', 'start', '', 'Docker Desktop'], {
        detached: true,
        stdio: 'ignore',
      });
    } else {
      // Linux - Docker doesn't have a GUI, suggest starting daemon
      return {
        success: false,
        error: 'On Linux, start Docker with: sudo systemctl start docker',
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get download URL for Docker Desktop
 */
export function getDockerDownloadUrl(): string {
  if (process.platform === 'darwin') {
    return 'https://www.docker.com/products/docker-desktop/';
  } else if (process.platform === 'win32') {
    return 'https://www.docker.com/products/docker-desktop/';
  }
  return 'https://docs.docker.com/engine/install/';
}

// ============================================
// Graphiti Validation Functions
// ============================================

export interface GraphitiValidationResult {
  success: boolean;
  message: string;
  details?: {
    provider?: string;
    model?: string;
    latencyMs?: number;
  };
}

/**
 * Validate FalkorDB connection by attempting to connect and ping
 * @param uri - FalkorDB URI (e.g., "bolt://localhost:6380" or "redis://localhost:6380")
 */
export async function validateFalkorDBConnection(
  uri: string
): Promise<GraphitiValidationResult> {
  try {
    // Parse the URI to extract host and port
    let host = 'localhost';
    let port = FALKORDB_DEFAULT_PORT;

    // Support both bolt:// and redis:// protocols
    const uriMatch = uri.match(/^(?:bolt|redis):\/\/([^:]+):(\d+)/);
    if (uriMatch) {
      host = uriMatch[1];
      port = parseInt(uriMatch[2], 10);
    } else {
      // Try simple host:port format
      const simpleMatch = uri.match(/^([^:]+):(\d+)/);
      if (simpleMatch) {
        host = simpleMatch[1];
        port = parseInt(simpleMatch[2], 10);
      }
    }

    const startTime = Date.now();

    // First, check the actual FalkorDB container status to get the correct port
    const falkorStatus = await checkFalkorDBStatus(port);

    // If container exists but user specified wrong port, try to detect the actual port
    if (!falkorStatus.containerRunning) {
      // Check if container is running on default port
      const defaultStatus = await checkFalkorDBStatus(FALKORDB_DEFAULT_PORT);
      if (defaultStatus.containerRunning && defaultStatus.healthy) {
        return {
          success: false,
          message: `FalkorDB is running on port ${FALKORDB_DEFAULT_PORT}, but you specified port ${port}. Please update the URI to bolt://localhost:${FALKORDB_DEFAULT_PORT}`,
        };
      }

      return {
        success: false,
        message: `FalkorDB container is not running. Please start FalkorDB first using Docker.`,
      };
    }

    // Try to ping FalkorDB using redis-cli in Docker container
    try {
      const { stdout } = await execAsync(
        `docker exec ${FALKORDB_CONTAINER_NAME} redis-cli PING`,
        { timeout: 10000 }
      );

      if (stdout.trim().toUpperCase() === 'PONG') {
        const latencyMs = Date.now() - startTime;
        return {
          success: true,
          message: `Connected to FalkorDB at ${host}:${port}`,
          details: { latencyMs },
        };
      }
    } catch {
      // redis-cli failed, try port check as fallback
    }

    // Fallback: check if the port is open using nc or direct connection
    try {
      // Check if we can connect to the mapped port from the host
      await execAsync(`nc -z -w 5 ${host} ${port}`, { timeout: 10000 });
      const latencyMs = Date.now() - startTime;
      return {
        success: true,
        message: `FalkorDB port ${port} is reachable at ${host}`,
        details: { latencyMs },
      };
    } catch {
      // Port check failed, but container is running - might be a different port mapping
      if (falkorStatus.containerRunning) {
        return {
          success: false,
          message: `FalkorDB container is running but port ${port} is not reachable. The container may be mapped to a different port.`,
        };
      }

      return {
        success: false,
        message: `Cannot connect to FalkorDB at ${host}:${port}. Make sure FalkorDB is running.`,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Validate OpenAI API key by attempting to list models
 * @param apiKey - OpenAI API key
 */
export async function validateOpenAIApiKey(
  apiKey: string
): Promise<GraphitiValidationResult> {
  if (!apiKey || !apiKey.trim()) {
    return {
      success: false,
      message: 'API key is required',
    };
  }

  // Basic format validation
  const trimmedKey = apiKey.trim();
  if (!trimmedKey.startsWith('sk-') && !trimmedKey.startsWith('sess-')) {
    return {
      success: false,
      message: 'Invalid API key format. OpenAI API keys should start with "sk-"',
    };
  }

  try {
    const startTime = Date.now();

    // Use native https module to avoid additional dependencies
    const result = await new Promise<GraphitiValidationResult>((resolve) => {
      const https = require('https');

      const options = {
        hostname: 'api.openai.com',
        port: 443,
        path: '/v1/models',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      };

      const req = https.request(options, (res: { statusCode: number; on: (event: string, callback: (chunk: Buffer) => void) => void }) => {
        let data = '';

        res.on('data', (chunk: Buffer) => {
          data += chunk;
        });

        res.on('end', () => {
          const latencyMs = Date.now() - startTime;

          if (res.statusCode === 200) {
            resolve({
              success: true,
              message: 'OpenAI API key is valid',
              details: {
                provider: 'openai',
                latencyMs,
              },
            });
          } else if (res.statusCode === 401) {
            resolve({
              success: false,
              message: 'Invalid API key. Please check your OpenAI API key.',
            });
          } else if (res.statusCode === 429) {
            // Rate limited but key is valid
            resolve({
              success: true,
              message: 'OpenAI API key is valid (rate limited, please wait)',
              details: {
                provider: 'openai',
                latencyMs,
              },
            });
          } else {
            try {
              const errorData = JSON.parse(data);
              resolve({
                success: false,
                message: errorData.error?.message || `API error: ${res.statusCode}`,
              });
            } catch {
              resolve({
                success: false,
                message: `API error: ${res.statusCode}`,
              });
            }
          }
        });
      });

      req.on('error', (error: Error) => {
        resolve({
          success: false,
          message: `Connection error: ${error.message}`,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          message: 'Connection timeout. Please check your network connection.',
        });
      });

      req.end();
    });

    return result;
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Test the full Graphiti connection (FalkorDB + OpenAI)
 * @param falkorDbUri - FalkorDB URI
 * @param openAiApiKey - OpenAI API key
 */
export async function testGraphitiConnection(
  falkorDbUri: string,
  openAiApiKey: string
): Promise<{
  falkordb: GraphitiValidationResult;
  openai: GraphitiValidationResult;
  ready: boolean;
}> {
  const [falkordb, openai] = await Promise.all([
    validateFalkorDBConnection(falkorDbUri),
    validateOpenAIApiKey(openAiApiKey),
  ]);

  return {
    falkordb,
    openai,
    ready: falkordb.success && openai.success,
  };
}

/**
 * Scan for all available Ollama models on the server
 * @param baseUrl - Ollama base URL (e.g., http://localhost:11434)
 * @returns List of available models with metadata
 */
export async function scanOllamaModels(
  baseUrl: string
): Promise<{
  success: boolean;
  models: Array<{
    name: string;
    size: number;
    modified_at: string;
    digest: string;
  }>;
  error?: string;
}> {
  if (!baseUrl || !baseUrl.trim()) {
    return {
      success: false,
      models: [],
      error: 'Ollama base URL is required'
    };
  }

  try {
    // Normalize the URL
    let normalizedUrl = baseUrl.trim();
    if (normalizedUrl.endsWith('/')) {
      normalizedUrl = normalizedUrl.slice(0, -1);
    }

    // Use native http/https module to check Ollama API
    const result = await new Promise<{
      success: boolean;
      models: any[];
      error?: string;
    }>((resolve) => {
      let url: URL;
      try {
        url = new URL(`${normalizedUrl}/api/tags`);
      } catch {
        resolve({
          success: false,
          models: [],
          error: `Invalid URL: ${normalizedUrl}. Please use format: http://hostname:port`
        });
        return;
      }

      const isHttps = url.protocol === 'https:';
      const request = isHttps ? httpsRequest : httpRequest;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'GET',
        timeout: 5000,
      };

      const req = request(options, (res: IncomingMessage) => {
        let data = '';

        res.on('data', (chunk: Buffer) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const response = JSON.parse(data);
              const models = response.models || [];
              resolve({
                success: true,
                models
              });
            } catch {
              resolve({
                success: false,
                models: [],
                error: 'Invalid response from Ollama server'
              });
            }
          } else {
            resolve({
              success: false,
              models: [],
              error: `Ollama server returned status ${res.statusCode}`
            });
          }
        });
      });

      req.on('error', (error: Error) => {
        if (error.message.includes('ECONNREFUSED')) {
          resolve({
            success: false,
            models: [],
            error: 'Cannot connect to Ollama. Is it running? Start with: ollama serve'
          });
        } else {
          resolve({
            success: false,
            models: [],
            error: `Connection error: ${error.message}`
          });
        }
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          models: [],
          error: 'Connection timeout. Please check your Ollama server.'
        });
      });

      req.end();
    });

    return result;
  } catch (error) {
    return {
      success: false,
      models: [],
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Download an Ollama model with progress tracking
 * @param baseUrl - Ollama base URL
 * @param modelName - Model name to download
 * @param onProgress - Optional progress callback
 * @returns Promise with download result
 */
export async function downloadOllamaModel(
  baseUrl: string,
  modelName: string,
  onProgress?: (progress: { status: string; completed: number; total: number }) => void
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  if (!baseUrl || !baseUrl.trim()) {
    return {
      success: false,
      message: 'Ollama base URL is required',
      error: 'Missing base URL'
    };
  }

  if (!modelName || !modelName.trim()) {
    return {
      success: false,
      message: 'Model name is required',
      error: 'Missing model name'
    };
  }

  try {
    // Normalize the URL
    let normalizedUrl = baseUrl.trim();
    if (normalizedUrl.endsWith('/')) {
      normalizedUrl = normalizedUrl.slice(0, -1);
    }

    // Use native http/https module to pull model
    const result = await new Promise<{
      success: boolean;
      message: string;
      error?: string;
    }>((resolve) => {
      let url: URL;
      try {
        url = new URL(`${normalizedUrl}/api/pull`);
      } catch {
        resolve({
          success: false,
          message: `Invalid URL: ${normalizedUrl}`,
          error: 'Invalid URL format'
        });
        return;
      }

      const isHttps = url.protocol === 'https:';
      const request = isHttps ? httpsRequest : httpRequest;

      const postData = JSON.stringify({ name: modelName.trim() });

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        timeout: 300000, // 5 minutes timeout for downloads
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = request(options, (res: IncomingMessage) => {
        let data = '';

        res.on('data', (chunk: Buffer) => {
          data += chunk;
          try {
            const progressData = JSON.parse(data);
            if (progressData.status && progressData.completed !== undefined) {
              onProgress?.(progressData);
            }
          } catch {
            // Ignore non-JSON chunks
          }
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve({
              success: true,
              message: `${modelName} downloaded successfully`
            });
          } else {
            resolve({
              success: false,
              message: `Download failed with status ${res.statusCode}`,
              error: `HTTP ${res.statusCode}`
            });
          }
        });
      });

      req.on('error', (error: Error) => {
        resolve({
          success: false,
          message: `Download error: ${error.message}`,
          error: error.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          message: 'Download timeout - model may be too large',
          error: 'Timeout'
        });
      });

      req.write(postData);
      req.end();
    });

    return result;
  } catch (error) {
    return {
      success: false,
      message: 'Download failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
