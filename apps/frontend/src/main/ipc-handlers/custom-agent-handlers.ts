
import { ipcMain } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';

// Using a hardcoded path for the development environment if necessary, or resolving from project root
// In production/packaged app, paths might differ. For now assuming we run from source structure.
const BACKEND_AGENTS_PATH = path.join(
    os.homedir(),
    '.config/claude/agents'
);
// Interface for agent metadata
export interface CustomAgent {
    id: string; // filename without extension
    name: string;
    description: string;
    color: string;
    model: string;
    path: string; // absolute path
}

export function registerCustomAgentHandlers() {
    ipcMain.handle('get-custom-agents', async () => {
        try {
            // Check if directory exists
            try {
                await fs.access(BACKEND_AGENTS_PATH);
            } catch {
                console.warn(`[CustomAgents] Agents directory not found at: ${BACKEND_AGENTS_PATH}`);
                return { success: true, data: [] }; // Return empty list instead of error
            }

            const files = await fs.readdir(BACKEND_AGENTS_PATH);
            const agentFiles = files.filter(file => file.endsWith('.md'));

            const agents: CustomAgent[] = [];

            for (const file of agentFiles) {
                const filePath = path.join(BACKEND_AGENTS_PATH, file);
                try {
                    const content = await fs.readFile(filePath, 'utf-8');
                    const { data } = matter(content);

                    agents.push({
                        id: file.replace('.md', ''),
                        name: data.name || file.replace('.md', ''), // Fallback to filename
                        description: data.description || '',
                        color: data.color || 'blue',
                        model: data.model || 'sonnet', // Default to sonnet
                        path: filePath
                    });
                } catch (err) {
                    console.error(`[CustomAgents] Failed to parse agent file ${file}:`, err);
                    // Skip invalid files
                }
            }

            return { success: true, data: agents };
        } catch (error) {
            console.error('[CustomAgents] Error fetching agents:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    });

    ipcMain.handle('get-custom-agent-details', async (_, filePath: string) => {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return { success: true, data: content };
        } catch (error) {
            console.error('[CustomAgents] Error reading agent details:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Failed to read file' };
        }
    });

    ipcMain.handle('save-custom-agent', async (_, { id, content }: { id: string; content: string }) => {
        try {
            // Validate id to prevent directory traversal
            if (!id || id.includes('/') || id.includes('\\')) {
                throw new Error('Invalid agent ID');
            }
            const filePath = path.join(BACKEND_AGENTS_PATH, `${id}.md`);

            // Ensure directory exists (it should, but safety first)
            try {
                await fs.access(BACKEND_AGENTS_PATH);
            } catch {
                await fs.mkdir(BACKEND_AGENTS_PATH, { recursive: true });
            }

            await fs.writeFile(filePath, content, 'utf-8');
            return { success: true };
        } catch (error) {
            console.error('[CustomAgents] Error saving agent:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Failed to save agent' };
        }
    });

    ipcMain.handle('delete-custom-agent', async (_, id: string) => {
        try {
            // Validate id
            if (!id || id.includes('/') || id.includes('\\')) {
                throw new Error('Invalid agent ID');
            }
            const filePath = path.join(BACKEND_AGENTS_PATH, `${id}.md`);
            await fs.unlink(filePath);
            return { success: true };
        } catch (error) {
            console.error('[CustomAgents] Error deleting agent:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Failed to delete agent' };
        }
    });
}
