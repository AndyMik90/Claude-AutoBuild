import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { spawn } from 'child_process';
import { app } from 'electron';
import { EventEmitter } from 'events';
import { detectRateLimit, createSDKRateLimitInfo, getProfileEnv } from './rate-limit-detector';
import { parsePythonCommand, getValidatedPythonPath } from './python-detector';
import { getConfiguredPythonPath } from './python-env-manager';
import { getSettingsPath, readSettingsFile } from './settings-utils';

// Execution mode types
type ExecutionMode = 'local_only' | 'hybrid' | 'cloud_only' | 'automatic';

interface ModeConfig {
  mode: ExecutionMode;
  local_max_complexity?: string;
  hybrid_prefer_local?: boolean;
  hybrid_fallback_on_error?: boolean;
  hybrid_complexity_threshold?: string;
  auto_select_model?: boolean;
}

/**
 * Debug logging - only logs when DEBUG=true or in development mode
 */
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

function debug(...args: unknown[]): void {
  if (DEBUG) {
    console.warn('[TitleGenerator]', ...args);
  }
}

/**
 * Get the execution mode config path
 */
function getModeConfigPath(): string {
  const settingsPath = getSettingsPath();
  return path.join(path.dirname(settingsPath), 'execution-mode.json');
}

/**
 * Load execution mode config from execution-mode.json
 */
function loadModeConfig(): ModeConfig {
  const configPath = getModeConfigPath();
  const defaultConfig: ModeConfig = {
    mode: 'hybrid',
    local_max_complexity: 'moderate',
    hybrid_prefer_local: true,
    hybrid_fallback_on_error: true,
    hybrid_complexity_threshold: 'moderate',
    auto_select_model: true,
  };

  try {
    if (existsSync(configPath)) {
      const data = readFileSync(configPath, 'utf-8');
      return { ...defaultConfig, ...JSON.parse(data) };
    }
  } catch (error) {
    debug('Failed to load mode config:', error);
  }

  return defaultConfig;
}

/**
 * Check if Full Local Mode is enabled
 * Checks both execution-mode.json and settings.json for backwards compatibility
 */
function isFullLocalModeEnabled(): boolean {
  try {
    // First check execution-mode.json (new system)
    const modeConfig = loadModeConfig();
    if (modeConfig.mode === 'local_only') {
      debug('Local mode enabled via execution-mode.json');
      return true;
    }
    
    // Fall back to settings.json (legacy)
    const settings = readSettingsFile();
    if (settings?.fullLocalMode === true) {
      debug('Local mode enabled via settings.json (fullLocalMode)');
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Get the configured local model for utility tasks
 */
function getLocalUtilityModel(): string {
  try {
    const settings = readSettingsFile();
    // Check for task-specific model first
    if (settings?.localTaskModels?.utility) {
      return settings.localTaskModels.utility;
    }
    // Fall back to default local model
    if (settings?.fullLocalModel) {
      return settings.fullLocalModel;
    }
    // Default to a fast model for title generation
    return 'llama3.2:3b';
  } catch {
    return 'llama3.2:3b';
  }
}

/**
 * Get the primary provider from settings
 * Checks both execution-mode.json and settings.json
 */
function getPrimaryProvider(): 'claude' | 'ollama' {
  try {
    // First check execution-mode.json (new system)
    const modeConfig = loadModeConfig();
    if (modeConfig.mode === 'local_only') {
      debug('Provider: ollama (from execution-mode.json local_only)');
      return 'ollama';
    }
    if (modeConfig.mode === 'cloud_only') {
      debug('Provider: claude (from execution-mode.json cloud_only)');
      return 'claude';
    }
    
    // For hybrid/automatic modes, check settings.json
    const settings = readSettingsFile();
    
    // Check aiProvider setting
    if (settings?.aiProvider === 'ollama') {
      debug('Provider: ollama (from settings.json aiProvider)');
      return 'ollama';
    }
    
    // For hybrid mode with prefer_local, use ollama for simple tasks like title generation
    if (modeConfig.mode === 'hybrid' && modeConfig.hybrid_prefer_local) {
      debug('Provider: ollama (hybrid mode with prefer_local for title generation)');
      return 'ollama';
    }
    
    debug('Provider: claude (default)');
    return 'claude';
  } catch {
    return 'claude';
  }
}

/**
 * Service for generating task titles from descriptions using AI
 * Supports both Claude and Ollama based on user settings
 */
export class TitleGenerator extends EventEmitter {
  // Python path will be configured by pythonEnvManager after venv is ready
  private _pythonPath: string | null = null;
  private autoBuildSourcePath: string = '';

  constructor() {
    super();
    debug('TitleGenerator initialized');
  }

  configure(pythonPath?: string, autoBuildSourcePath?: string): void {
    if (pythonPath) {
      this._pythonPath = getValidatedPythonPath(pythonPath, 'TitleGenerator');
    }
    if (autoBuildSourcePath) {
      this.autoBuildSourcePath = autoBuildSourcePath;
    }
  }

  /**
   * Get the configured Python path.
   * Returns explicitly configured path, or falls back to getConfiguredPythonPath()
   * which uses the venv Python if ready.
   */
  private get pythonPath(): string {
    if (this._pythonPath) {
      return this._pythonPath;
    }
    return getConfiguredPythonPath();
  }

  /**
   * Get the auto-claude source path (detects automatically if not configured)
   */
  private getAutoBuildSourcePath(): string | null {
    if (this.autoBuildSourcePath && existsSync(this.autoBuildSourcePath)) {
      return this.autoBuildSourcePath;
    }

    const possiblePaths = [
      // Apps structure: from out/main -> apps/backend
      path.resolve(__dirname, '..', '..', '..', 'backend'),
      path.resolve(app.getAppPath(), '..', 'backend'),
      path.resolve(process.cwd(), 'apps', 'backend')
    ];

    for (const p of possiblePaths) {
      if (existsSync(p) && existsSync(path.join(p, 'runners', 'spec_runner.py'))) {
        return p;
      }
    }
    return null;
  }

  /**
   * Load environment variables from auto-claude .env file
   */
  private loadAutoBuildEnv(): Record<string, string> {
    const autoBuildSource = this.getAutoBuildSourcePath();
    if (!autoBuildSource) return {};

    const envPath = path.join(autoBuildSource, '.env');
    if (!existsSync(envPath)) return {};

    try {
      const envContent = readFileSync(envPath, 'utf-8');
      const envVars: Record<string, string> = {};

      // Handle both Unix (\n) and Windows (\r\n) line endings
      for (const line of envContent.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          let value = trimmed.substring(eqIndex + 1).trim();

          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }

          envVars[key] = value;
        }
      }

      return envVars;
    } catch {
      return {};
    }
  }

  /**
   * Generate a task title from a description using AI
   * Automatically chooses between Claude and Ollama based on settings
   * @param description - The task description to generate a title from
   * @returns Promise resolving to the generated title or null on failure
   */
  async generateTitle(description: string): Promise<string | null> {
    // Check if we should use local mode
    const useLocalMode = isFullLocalModeEnabled() || getPrimaryProvider() === 'ollama';
    
    if (useLocalMode) {
      debug('Using Ollama for title generation (Full Local Mode or Ollama provider)');
      return this.generateTitleWithOllama(description);
    }
    
    debug('Using Claude for title generation');
    return this.generateTitleWithClaude(description);
  }

  /**
   * Generate title using Ollama (local)
   */
  private async generateTitleWithOllama(description: string): Promise<string | null> {
    const model = getLocalUtilityModel();
    const prompt = this.createTitlePrompt(description);
    
    debug('Generating title with Ollama model:', model);
    
    return new Promise((resolve) => {
      const script = this.createOllamaGenerationScript(prompt, model);
      const autoBuildSource = this.getAutoBuildSourcePath();
      
      if (!autoBuildSource) {
        debug('Auto-claude source path not found, trying direct Ollama API');
        // Try direct HTTP call to Ollama
        this.generateTitleWithOllamaHttp(description, model).then(resolve);
        return;
      }

      const [pythonCommand, pythonBaseArgs] = parsePythonCommand(this.pythonPath);
      const childProcess = spawn(pythonCommand, [...pythonBaseArgs, '-c', script], {
        cwd: autoBuildSource,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1'
        }
      });

      let output = '';
      let errorOutput = '';
      const timeout = setTimeout(() => {
        console.warn('[TitleGenerator] Ollama title generation timed out after 30s');
        childProcess.kill();
        resolve(null);
      }, 30000); // 30 second timeout for local generation

      childProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      childProcess.on('exit', (code: number | null) => {
        clearTimeout(timeout);

        if (code === 0 && output.trim()) {
          const title = this.cleanTitle(output.trim());
          debug('Generated title with Ollama:', title);
          resolve(title);
        } else {
          console.warn('[TitleGenerator] Ollama title generation failed', {
            code,
            errorOutput: errorOutput.substring(0, 500),
            output: output.substring(0, 200),
          });
          resolve(null);
        }
      });

      childProcess.on('error', (err) => {
        clearTimeout(timeout);
        console.warn('[TitleGenerator] Ollama process error:', err.message);
        resolve(null);
      });
    });
  }

  /**
   * Generate title using Ollama HTTP API directly
   */
  private async generateTitleWithOllamaHttp(description: string, model: string): Promise<string | null> {
    try {
      const prompt = this.createTitlePrompt(description);
      const ollamaUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
      
      const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 50,
          }
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      if (data.response) {
        return this.cleanTitle(data.response.trim());
      }
      return null;
    } catch (error) {
      console.warn('[TitleGenerator] Ollama HTTP API error:', error);
      return null;
    }
  }

  /**
   * Generate title using Claude (cloud)
   */
  private async generateTitleWithClaude(description: string): Promise<string | null> {
    const autoBuildSource = this.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      debug('Auto-claude source path not found');
      return null;
    }

    const prompt = this.createTitlePrompt(description);
    const script = this.createClaudeGenerationScript(prompt);

    debug('Generating title for description:', description.substring(0, 100) + '...');

    const autoBuildEnv = this.loadAutoBuildEnv();
    debug('Environment loaded', {
      hasOAuthToken: !!autoBuildEnv.CLAUDE_CODE_OAUTH_TOKEN
    });

    // Get active Claude profile environment (CLAUDE_CONFIG_DIR if not default)
    const profileEnv = getProfileEnv();

    return new Promise((resolve) => {
      // Parse Python command to handle space-separated commands like "py -3"
      const [pythonCommand, pythonBaseArgs] = parsePythonCommand(this.pythonPath);
      const childProcess = spawn(pythonCommand, [...pythonBaseArgs, '-c', script], {
        cwd: autoBuildSource,
        env: {
          ...process.env,
          ...autoBuildEnv,
          ...profileEnv, // Include active Claude profile config
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1'
        }
      });

      let output = '';
      let errorOutput = '';
      const timeout = setTimeout(() => {
        console.warn('[TitleGenerator] Title generation timed out after 60s');
        childProcess.kill();
        resolve(null);
      }, 60000); // 60 second timeout for SDK initialization + API call

      childProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      childProcess.on('exit', (code: number | null) => {
        clearTimeout(timeout);

        if (code === 0 && output.trim()) {
          const title = this.cleanTitle(output.trim());
          debug('Generated title:', title);
          resolve(title);
        } else {
          // Check for rate limit
          const combinedOutput = `${output}\n${errorOutput}`;
          const rateLimitDetection = detectRateLimit(combinedOutput);
          if (rateLimitDetection.isRateLimited) {
            console.warn('[TitleGenerator] Rate limit detected:', {
              resetTime: rateLimitDetection.resetTime,
              limitType: rateLimitDetection.limitType,
              suggestedProfile: rateLimitDetection.suggestedProfile?.name
            });

            const rateLimitInfo = createSDKRateLimitInfo('title-generator', rateLimitDetection);
            this.emit('sdk-rate-limit', rateLimitInfo);
            
            // Try Ollama as fallback if rate limited
            debug('Claude rate limited, trying Ollama fallback');
            this.generateTitleWithOllama(prompt).then(resolve);
            return;
          }

          // Always log failures to help diagnose issues
          console.warn('[TitleGenerator] Title generation failed', {
            code,
            errorOutput: errorOutput.substring(0, 500),
            output: output.substring(0, 200),
            isRateLimited: rateLimitDetection.isRateLimited
          });
          resolve(null);
        }
      });

      childProcess.on('error', (err) => {
        clearTimeout(timeout);
        console.warn('[TitleGenerator] Process error:', err.message);
        resolve(null);
      });
    });
  }

  /**
   * Create the prompt for title generation
   */
  private createTitlePrompt(description: string): string {
    return `Generate a short, concise task title (3-7 words) for the following task description. The title should be action-oriented and describe what will be done. Output ONLY the title, nothing else.

Description:
${description}

Title:`;
  }

  /**
   * Create the Python script to generate title using Ollama
   */
  private createOllamaGenerationScript(prompt: string, model: string): string {
    const escapedPrompt = JSON.stringify(prompt);
    const escapedModel = JSON.stringify(model);

    return `
import sys
try:
    import ollama
    
    response = ollama.generate(
        model=${escapedModel},
        prompt=${escapedPrompt},
        options={
            'temperature': 0.3,
            'num_predict': 50,
        }
    )
    
    if response and response.get('response'):
        title = response['response'].strip()
        # Remove quotes if present
        title = title.strip('"').strip("'")
        # Take first line only
        title = title.split('\\n')[0].strip()
        if title:
            print(title)
            sys.exit(0)
    
    sys.exit(1)
except ImportError:
    # Fallback to requests if ollama package not installed
    import json
    import urllib.request
    
    data = json.dumps({
        'model': ${escapedModel},
        'prompt': ${escapedPrompt},
        'stream': False,
        'options': {'temperature': 0.3, 'num_predict': 50}
    }).encode('utf-8')
    
    req = urllib.request.Request(
        'http://localhost:11434/api/generate',
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read().decode('utf-8'))
        if result.get('response'):
            title = result['response'].strip()
            title = title.strip('"').strip("'")
            title = title.split('\\n')[0].strip()
            if title:
                print(title)
                sys.exit(0)
    
    sys.exit(1)
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
`;
  }

  /**
   * Create the Python script to generate title using Claude Agent SDK
   */
  private createClaudeGenerationScript(prompt: string): string {
    // Escape the prompt for Python string - use JSON.stringify for safe escaping
    const escapedPrompt = JSON.stringify(prompt);

    return `
import asyncio
import sys

async def generate_title():
    try:
        from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

        prompt = ${escapedPrompt}

        # Create a minimal client for simple text generation (no tools needed)
        client = ClaudeSDKClient(
            options=ClaudeAgentOptions(
                model="claude-haiku-4-5",
                system_prompt="You generate short, concise task titles (3-7 words). Output ONLY the title, nothing else. No quotes, no explanation, no preamble.",
                max_turns=1,
            )
        )

        async with client:
            # Send the query
            await client.query(prompt)

            # Collect response text from AssistantMessage
            response_text = ""
            async for msg in client.receive_response():
                msg_type = type(msg).__name__
                if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                    for block in msg.content:
                        block_type = type(block).__name__
                        if block_type == "TextBlock" and hasattr(block, "text"):
                            response_text += block.text

            if response_text:
                # Clean up the result
                title = response_text.strip()
                # Remove any quotes
                title = title.strip('"').strip("'")
                # Take first line only
                title = title.split('\\n')[0].strip()
                if title:
                    print(title)
                    sys.exit(0)

        # If we get here, no valid response
        sys.exit(1)

    except ImportError as e:
        print(f"Import error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

asyncio.run(generate_title())
`;
  }

  /**
   * Clean up the generated title
   */
  private cleanTitle(title: string): string {
    // Remove quotes if present
    let cleaned = title.replace(/^["']|["']$/g, '');

    // Remove any "Title:" or similar prefixes
    cleaned = cleaned.replace(/^(title|task|feature)[:\s]*/i, '');

    // Capitalize first letter
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

    // Truncate if too long (max 100 chars)
    if (cleaned.length > 100) {
      cleaned = cleaned.substring(0, 97) + '...';
    }

    return cleaned.trim();
  }
}

// Export singleton instance
export const titleGenerator = new TitleGenerator();
