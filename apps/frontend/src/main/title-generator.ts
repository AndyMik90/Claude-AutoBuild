import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { spawn } from 'child_process';
import { app } from 'electron';
import { EventEmitter } from 'events';
import Anthropic from '@anthropic-ai/sdk';
import { detectRateLimit, createSDKRateLimitInfo, getProfileEnv } from './rate-limit-detector';
import { parsePythonCommand, getValidatedPythonPath } from './python-detector';
import { getConfiguredPythonPath } from './python-env-manager';
import { loadProfilesFile } from './services/profile/profile-manager';
import { MODEL_ID_MAP } from '../shared/constants/models';

/** Default Haiku model ID from centralized model map */
const DEFAULT_HAIKU_MODEL = MODEL_ID_MAP.haiku;

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
 * Service for generating task titles from descriptions using Claude AI
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
   * Get the active API profile configuration for direct API calls.
   * Returns null if no API profile is active (OAuth mode).
   * 
   * @returns Promise resolving to the profile configuration with apiKey, baseUrl, and haikuModel,
   *          or null if no API profile is active
   */
  private async getActiveAPIProfile(): Promise<{
    apiKey: string;
    baseUrl: string;
    haikuModel: string;
  } | null> {
    try {
      const file = await loadProfilesFile();

      // If no active profile (null/empty), return null (OAuth mode)
      if (!file.activeProfileId || file.activeProfileId === '') {
        return null;
      }

      // Find active profile by activeProfileId
      const profile = file.profiles.find((p) => p.id === file.activeProfileId);

      // If profile not found, return null
      if (!profile || !profile.apiKey) {
        return null;
      }

      return {
        apiKey: profile.apiKey,
        baseUrl: profile.baseUrl || 'https://api.anthropic.com',
        haikuModel: profile.models?.haiku || DEFAULT_HAIKU_MODEL
      };
    } catch (error) {
      debug('Failed to load API profile:', error);
      return null;
    }
  }

  /**
   * Generate title using the Anthropic SDK directly (for API profile mode).
   * This is faster and doesn't require Python subprocess.
   * 
   * @param description - The task description to generate a title from
   * @param apiKey - The Anthropic API key for authentication
   * @param baseUrl - The base URL for the Anthropic API
   * @param model - The model ID to use for generation (e.g., 'claude-haiku-4-5-20251001')
   * @returns Promise resolving to the generated title or null on failure
   */
  private async generateTitleWithSDK(
    description: string,
    apiKey: string,
    baseUrl: string,
    model: string
  ): Promise<string | null> {
    try {
      debug('Generating title with Anthropic SDK', { baseUrl, model });

      const client = new Anthropic({
        apiKey,
        baseURL: baseUrl,
        timeout: 30000, // 30 second timeout
        maxRetries: 1
      });

      const prompt = this.createTitlePrompt(description);

      const response = await client.messages.create({
        model,
        max_tokens: 100,
        system: 'You generate short, concise task titles (3-7 words). Output ONLY the title, nothing else. No quotes, no explanation, no preamble.',
        messages: [{ role: 'user', content: prompt }]
      });

      // Extract text from response
      const textContent = response.content.find((block) => block.type === 'text');
      if (textContent && textContent.type === 'text' && textContent.text) {
        const title = this.cleanTitle(textContent.text.trim());
        debug('Generated title with SDK:', title);
        return title;
      }

      debug('No text content in SDK response');
      return null;
    } catch (error) {
      // Extract error details for logging
      const err = error as { name?: string; status?: number; message?: string };
      const errorType = err?.name || 'UnknownError';
      const status = err?.status;
      const message = err?.message || String(error);

      // Check for rate limit conditions using detectRateLimit for consistency with OAuth path
      const rateLimitDetection = detectRateLimit(message);
      const isRateLimit = rateLimitDetection.isRateLimited || 
        status === 429 || 
        /rate\s*limit/i.test(message) || 
        /too\s*many\s*requests/i.test(message);

      // Log with appropriate detail (indicate truncation if message is long)
      const truncatedMessage = message.length > 200 
        ? message.substring(0, 197) + '...' 
        : message;
      
      console.warn('[TitleGenerator] SDK title generation failed', {
        errorType,
        status,
        message: truncatedMessage,
        isRateLimited: isRateLimit
      });

      // Emit rate limit event if detected (consistent with OAuth path behavior)
      if (isRateLimit && rateLimitDetection.isRateLimited) {
        const rateLimitInfo = createSDKRateLimitInfo('title-generator', rateLimitDetection);
        this.emit('sdk-rate-limit', rateLimitInfo);
      }

      return null;
    }
  }

  /**
   * Generate a task title from a description using Claude AI.
   * 
   * Authentication priority:
   * 1. Active API profile (uses Anthropic SDK directly with profile's haiku model,
   *    or the default from MODEL_ID_MAP if no haiku model configured)
   * 2. ANTHROPIC_API_KEY environment variable (uses Anthropic SDK directly with
   *    ANTHROPIC_DEFAULT_HAIKU_MODEL or the default from MODEL_ID_MAP)
   * 3. OAuth token (uses Claude Agent SDK via Python subprocess)
   * 
   * @param description - The task description to generate a title from
   * @returns Promise resolving to the generated title or null on failure
   */
  async generateTitle(description: string): Promise<string | null> {
    debug('Generating title for description:', description.substring(0, 100) + '...');

    // Priority 1: Try active API profile first
    const apiProfile = await this.getActiveAPIProfile();
    if (apiProfile) {
      debug('Using active API profile for title generation');
      const title = await this.generateTitleWithSDK(
        description,
        apiProfile.apiKey,
        apiProfile.baseUrl,
        apiProfile.haikuModel
      );
      if (title) {
        return title;
      }
      debug('API profile generation failed, falling back...');
    }

    // Priority 2: Try ANTHROPIC_API_KEY environment variable
    const envApiKey = process.env.ANTHROPIC_API_KEY;
    if (envApiKey) {
      debug('Using ANTHROPIC_API_KEY environment variable for title generation');
      const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
      const model = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || DEFAULT_HAIKU_MODEL;
      const title = await this.generateTitleWithSDK(description, envApiKey, baseUrl, model);
      if (title) {
        return title;
      }
      debug('Environment API key generation failed, falling back...');
    }

    // Priority 3: Fall back to OAuth-based Python subprocess
    return this.generateTitleWithOAuth(description);
  }

  /**
   * Generate title using OAuth token via Python subprocess (original implementation).
   * This uses the Claude Agent SDK which requires OAuth authentication.
   */
  private async generateTitleWithOAuth(description: string): Promise<string | null> {
    const autoBuildSource = this.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      debug('Auto-claude source path not found');
      return null;
    }

    const prompt = this.createTitlePrompt(description);
    const script = this.createGenerationScript(prompt);

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
   * Create the Python script to generate title using Claude Agent SDK
   */
  private createGenerationScript(prompt: string): string {
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
