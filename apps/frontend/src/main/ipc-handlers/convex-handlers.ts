/**
 * Convex IPC Handlers
 *
 * Handles IPC communication for Convex service management.
 */

import { ipcMain, app } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import { logger } from '../app-logger';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

const require = createRequire(import.meta.url);

let convexProcess: ReturnType<typeof spawn> | null = null;

/**
 * Get the repository root directory
 */
function getRepoRoot(): string {
  // In development, the main process runs from apps/frontend/out/main
  // We need to go up to the repository root
  // In production, the app is bundled differently

  // Start from the app's executable path
  const appPath = app.getAppPath();

  // Check if we're in development mode
  if (appPath.includes('out') || appPath.includes('dist')) {
    // Development: go up from apps/frontend/out/main to repo root
    // Path is: repo_root/apps/frontend/out/main
    // We need to go up 4 levels to get to repo_root
    return path.resolve(appPath, '..', '..', '..', '..');
  }

  // Production or development: try to find the repo root by looking for services folder
  let currentPath = appPath;
  for (let i = 0; i < 5; i++) {
    const servicesPath = path.join(currentPath, 'services');
    if (fs.existsSync(servicesPath)) {
      return currentPath;
    }
    currentPath = path.resolve(currentPath, '..');
  }

  // Fallback to cwd
  return process.cwd();
}

/**
 * Register all Convex-related IPC handlers.
 */
export function registerConvexHandlers(): void {
  /**
   * Get the Convex URL from environment or .env.local file
   * Returns both the Convex URL (for client connection) and Site URL (for auth actions)
   */
  ipcMain.handle(
    IPC_CHANNELS.CONVEX_GET_URL,
    async (): Promise<IPCResult<{ convexUrl: string; siteUrl: string }>> => {
      try {
        // Otherwise read from .env.local file
        const repoRoot = getRepoRoot();
        const envFilePath = path.join(repoRoot, 'services', 'convex', '.env.local');

        logger.info(`Looking for Convex env file at: ${envFilePath}`);

        if (!fs.existsSync(envFilePath)) {
          return {
            success: false,
            error: `Convex .env.local file not found at ${envFilePath}. Run "npx convex dev" in services/convex/ first.`
          };
        }

        const envContent = fs.readFileSync(envFilePath, 'utf-8');

        // Extract CONVEX_URL (for Convex client connection)
        const convexUrlMatch = envContent.match(/CONVEX_URL=(.+)/);
        const convexUrl = convexUrlMatch
          ? convexUrlMatch[1].trim().replace(/"/g, '').replace(/'/g, '')
          : '';

        // Extract CONVEX_SITE_URL (for auth actions)
        const siteUrlMatch = envContent.match(/CONVEX_SITE_URL=(.+)/);
        const siteUrl = siteUrlMatch
          ? siteUrlMatch[1].trim().replace(/"/g, '').replace(/'/g, '')
          : convexUrl; // Fallback to convexUrl if siteUrl not found

        if (!convexUrl) {
          return {
            success: false,
            error: 'CONVEX_URL not found in .env.local file'
          };
        }

        return {
          success: true,
          data: { convexUrl, siteUrl }
        };
      } catch (error) {
        logger.error('Error getting Convex URL:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get Convex URL'
        };
      }
    }
  );

  /**
   * Get the current status of the Convex service
   */
  ipcMain.handle(
    IPC_CHANNELS.CONVEX_GET_STATUS,
    async (): Promise<IPCResult<{
      available: boolean;
      running: boolean;
      url?: string;
      envConfigured: boolean;
    }>> => {
      try {
        // Check if Convex directory exists and has node_modules
        const repoRoot = getRepoRoot();
        const convexDir = path.join(repoRoot, 'services', 'convex');
        const nodeModulesPath = path.join(convexDir, 'node_modules', '.bin', 'convex');
        const envFilePath = path.join(convexDir, '.env.local');

        const available = fs.existsSync(nodeModulesPath);
        const envConfigured = fs.existsSync(envFilePath);

        let url: string | undefined;
        if (envConfigured) {
          try {
            const envContent = fs.readFileSync(envFilePath, 'utf-8');
            // Try NEXT_PUBLIC_CONVEX_SITE_URL, CONVEX_URL, or NEXT_PUBLIC_CONVEX_URL
            let match = envContent.match(/NEXT_PUBLIC_CONVEX_SITE_URL=(.+)/);
            if (!match) {
              match = envContent.match(/CONVEX_URL=(.+)/);
            }
            if (!match) {
              match = envContent.match(/NEXT_PUBLIC_CONVEX_URL=(.+)/);
            }
            if (match) {
              url = match[1].trim().replace(/"/g, '').replace(/'/g, '');
            }
          } catch (e) {
            logger.error('Error reading Convex env file:', e);
          }
        }

        return {
          success: true,
          data: {
            available,
            running: convexProcess !== null,
            url,
            envConfigured
          }
        };
      } catch (error) {
        logger.error('Error getting Convex status:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get Convex status'
        };
      }
    }
  );

  /**
   * Start the Convex dev server
   */
  ipcMain.handle(
    IPC_CHANNELS.CONVEX_START_DEV,
    async (): Promise<IPCResult<{ url?: string; message: string }>> => {
      try {
        if (convexProcess !== null) {
          return {
            success: true,
            data: { url: undefined, message: 'Convex dev server already running' }
          };
        }

        const repoRoot = getRepoRoot();
        const convexDir = path.join(repoRoot, 'services', 'convex');
        const envFilePath = path.join(convexDir, '.env.local');
        const envExamplePath = path.join(convexDir, '.env.example');

        // Create .env.local from .env.example if it doesn't exist
        if (!fs.existsSync(envFilePath) && fs.existsSync(envExamplePath)) {
          fs.copyFileSync(envExamplePath, envFilePath);
          logger.info('Created .env.local from .env.example');
        }

        // Start convex dev
        convexProcess = spawn('npm', ['run', 'dev'], {
          cwd: convexDir,
          shell: true,
          detached: false
        });

        convexProcess.stdout?.on('data', (data: Buffer) => {
          logger.info(`[Convex] ${data.toString()}`);
        });

        convexProcess.stderr?.on('data', (data: Buffer) => {
          logger.error(`[Convex] ${data.toString()}`);
        });

        convexProcess.on('close', (code: number) => {
          logger.info(`[Convex] Process exited with code ${code}`);
          convexProcess = null;
        });

        // Wait a moment and try to read the URL
        await new Promise(resolve => setTimeout(resolve, 3000));

        let url: string | undefined;
        if (fs.existsSync(envFilePath)) {
          try {
            const envContent = fs.readFileSync(envFilePath, 'utf-8');
            const match = envContent.match(/NEXT_PUBLIC_CONVEX_URL=(.+)/);
            if (match) {
              url = match[1].trim().replace(/"/g, '').replace(/'/g, '');
            }
          } catch (e) {
            logger.error('Error reading Convex env file:', e);
          }
        }

        return {
          success: true,
          data: {
            url,
            message: 'Convex dev server started successfully'
          }
        };
      } catch (error) {
        logger.error('Error starting Convex dev server:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to start Convex dev server'
        };
      }
    }
  );

  /**
   * Stop the Convex dev server
   */
  ipcMain.handle(
    IPC_CHANNELS.CONVEX_STOP_DEV,
    async (): Promise<IPCResult<{ message: string }>> => {
      try {
        if (convexProcess === null) {
          return {
            success: true,
            data: { message: 'Convex dev server was not running' }
          };
        }

        convexProcess.kill();
        convexProcess = null;

        return {
          success: true,
          data: { message: 'Convex dev server stopped' }
        };
      } catch (error) {
        logger.error('Error stopping Convex dev server:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to stop Convex dev server'
        };
      }
    }
  );
}
