/**
 * Morph Fast Apply IPC Handlers
 *
 * Handles Morph API key validation from the main process to bypass CORS restrictions.
 * The renderer process cannot make direct API calls to external services due to CORS.
 *
 * NOTE: API key validation uses a HEAD request first to avoid consuming API credits.
 * If the HEAD request is inconclusive (e.g., 404/405), validation falls back to a
 * minimal POST request which may consume a small amount of API credits.
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult, MorphValidationResult } from '../../shared/types';

const MORPH_BASE_URL = process.env.MORPH_BASE_URL || 'https://api.morphllm.com/v1';
const HEAD_TIMEOUT = 5000;  // 5 seconds for HEAD request
const POST_TIMEOUT = 10000; // 10 seconds for POST request

/**
 * Register Morph-related IPC handlers
 */
export function registerMorphHandlers(): void {
  console.warn('[Morph] Registering Morph handlers');

  // Validate Morph API key
  ipcMain.handle(
    IPC_CHANNELS.MORPH_VALIDATE_API_KEY,
    async (_, apiKey: string): Promise<IPCResult<MorphValidationResult>> => {
      console.warn('[Morph] Validating API key...');

      if (!apiKey || apiKey.trim() === '') {
        return {
          success: true,
          data: {
            valid: false,
            status: 'invalid',
            message: 'API key is required',
          },
        };
      }

      try {
        // First, try a HEAD request to check auth without consuming API credits
        const headController = new AbortController();
        const headTimeout = setTimeout(() => headController.abort(), HEAD_TIMEOUT);

        try {
          const headResponse = await fetch(`${MORPH_BASE_URL}/chat/completions`, {
            method: 'HEAD',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            signal: headController.signal,
          });

          clearTimeout(headTimeout);

          // HEAD request gives us a definitive answer for auth errors
          if (headResponse.status === 401 || headResponse.status === 403) {
            console.warn('[Morph] API key validation failed: unauthorized');
            return {
              success: true,
              data: {
                valid: false,
                status: 'invalid',
                message: 'The API key is invalid or has been revoked',
              },
            };
          }

          // If HEAD succeeded (2xx), auth is valid
          if (headResponse.ok) {
            console.warn('[Morph] API key validated successfully via HEAD');
            return {
              success: true,
              data: {
                valid: true,
                status: 'valid',
                message: 'API key is valid',
              },
            };
          }

          // For other status codes (404, 405 Method Not Allowed, etc.),
          // HEAD may not be supported - fall back to POST
        } catch (headError) {
          clearTimeout(headTimeout);
          // HEAD failed, try POST fallback
          console.warn('[Morph] HEAD request failed, falling back to POST');
        }

        // Fall back to a minimal POST request.
        // NOTE: This may consume a small amount of API credits, but is reliable
        // when the HEAD request fails or is not supported by the server.
        const postController = new AbortController();
        const postTimeout = setTimeout(() => postController.abort(), POST_TIMEOUT);

        try {
          const postResponse = await fetch(`${MORPH_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'auto',
              messages: [{
                role: 'user',
                content: '<instruction>test</instruction><code>x</code><update>x</update>',
              }],
            }),
            signal: postController.signal,
          });

          clearTimeout(postTimeout);

          if (postResponse.ok) {
            console.warn('[Morph] API key validated successfully via POST');
            return {
              success: true,
              data: {
                valid: true,
                status: 'valid',
                message: 'API key is valid',
              },
            };
          } else if (postResponse.status === 401 || postResponse.status === 403) {
            console.warn('[Morph] API key validation failed: unauthorized');
            return {
              success: true,
              data: {
                valid: false,
                status: 'invalid',
                message: 'The API key is invalid or has been revoked',
              },
            };
          } else if (postResponse.status >= 500) {
            console.warn('[Morph] Service unavailable: server error');
            return {
              success: true,
              data: {
                valid: false,
                status: 'serviceUnavailable',
                message: 'The Morph service is currently unavailable',
              },
            };
          } else {
            console.warn(`[Morph] Validation failed with status: ${postResponse.status}`);
            return {
              success: true,
              data: {
                valid: false,
                status: 'error',
                message: `Validation failed with status ${postResponse.status}`,
              },
            };
          }
        } catch (postError) {
          clearTimeout(postTimeout);
          throw postError;
        }
      } catch (error) {
        console.error('[Morph] Validation error:', error);

        // Check for specific error types
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            return {
              success: true,
              data: {
                valid: false,
                status: 'serviceUnavailable',
                message: 'The connection to Morph timed out',
              },
            };
          }

          // Check for common network error codes and messages
          const networkErrorCodes = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'];
          const isNetworkError = 
            error.message.includes('fetch') || 
            error.message.includes('network') ||
            networkErrorCodes.some(code => error.message.includes(code)) ||
            ('code' in error && typeof error.code === 'string' && networkErrorCodes.includes(error.code));
          
          if (isNetworkError) {
            return {
              success: true,
              data: {
                valid: false,
                status: 'serviceUnavailable',
                message: 'Could not connect to the Morph service',
              },
            };
          }
        }

        // Generic error - assume service unavailable for better UX
        return {
          success: true,
          data: {
            valid: false,
            status: 'serviceUnavailable',
            message: 'Could not verify the API key at this time',
          },
        };
      }
    }
  );

  console.warn('[Morph] Morph handlers registered');
}
