/**
 * Blueprint Service
 *
 * Handles blueprint operations for the BMAD + Auto-Claude integration.
 * Loads blueprints, triggers builds, and manages component status.
 */

import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { spawn } from 'child_process';
import { IPC_CHANNELS } from '../shared/constants';

interface Blueprint {
  name: string;
  version: string;
  description: string;
  created_at: string;
  created_by: string;
  project_path?: string;
  spec_id?: string;
  strictness: string;
  components: BlueprintComponent[];
}

interface BlueprintComponent {
  id: string;
  name: string;
  description: string;
  status: string;
  files: string[];
  acceptance_criteria: AcceptanceCriterion[];
  dependencies: string[];
  started_at?: string;
  completed_at?: string;
  attempts: number;
  notes: string[];
  implementation_notes?: string;
  key_decisions: string[];
}

interface AcceptanceCriterion {
  description: string;
  verified: boolean;
  verified_at?: string;
  notes?: string;
}

/**
 * Find blueprint file in project
 */
function findBlueprintPath(projectPath: string, customPath?: string): string | null {
  // Check custom path first
  if (customPath) {
    const fullPath = path.isAbsolute(customPath)
      ? customPath
      : path.join(projectPath, customPath);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  // Check common locations
  const possiblePaths = [
    path.join(projectPath, '.auto-claude', 'blueprint.yaml'),
    path.join(projectPath, '.auto-claude', 'blueprint.yml'),
    path.join(projectPath, 'blueprint.yaml'),
    path.join(projectPath, 'blueprint.yml'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * Load blueprint from file
 */
function loadBlueprint(blueprintPath: string): Blueprint | null {
  try {
    const content = fs.readFileSync(blueprintPath, 'utf-8');
    const data = yaml.load(content) as { blueprint?: Blueprint } | Blueprint;

    // Handle both wrapped and unwrapped formats
    if ('blueprint' in data && data.blueprint) {
      return data.blueprint;
    }

    return data as Blueprint;
  } catch (error) {
    console.error('Failed to load blueprint:', error);
    return null;
  }
}

/**
 * Save blueprint to file
 */
function saveBlueprint(blueprintPath: string, blueprint: Blueprint): boolean {
  try {
    const data = { blueprint };
    const content = yaml.dump(data, {
      lineWidth: -1,
      noRefs: true,
    });
    fs.writeFileSync(blueprintPath, content, 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save blueprint:', error);
    return false;
  }
}

/**
 * Get Python path for running Auto-Claude
 */
function getPythonPath(projectPath: string): string {
  // Check for venv in auto-claude directory
  const venvPaths = [
    path.join(projectPath, 'auto-claude', '.venv', 'bin', 'python'),
    path.join(projectPath, '.venv', 'bin', 'python'),
    'python3',
    'python',
  ];

  for (const p of venvPaths) {
    if (p.startsWith('/') && fs.existsSync(p)) {
      return p;
    }
  }

  return 'python3';
}

/**
 * Initialize IPC handlers for blueprint operations
 */
export function initBlueprintService(): void {
  // Load blueprint
  ipcMain.handle(IPC_CHANNELS.BLUEPRINT_LOAD, async (_event, { projectPath, blueprintPath }) => {
    try {
      const fullPath = findBlueprintPath(projectPath, blueprintPath);

      if (!fullPath) {
        return { success: false, error: 'Blueprint not found' };
      }

      const blueprint = loadBlueprint(fullPath);

      if (!blueprint) {
        return { success: false, error: 'Failed to parse blueprint' };
      }

      return { success: true, blueprint, path: fullPath };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Start blueprint build
  ipcMain.handle(IPC_CHANNELS.BLUEPRINT_START_BUILD, async (_event, { projectPath }) => {
    try {
      const blueprintPath = findBlueprintPath(projectPath);

      if (!blueprintPath) {
        return { success: false, error: 'Blueprint not found' };
      }

      const pythonPath = getPythonPath(projectPath);
      const scriptPath = path.join(
        projectPath,
        'auto-claude',
        'integrations',
        'bmad',
        'blueprint_build.py'
      );

      // Spawn the build process
      const buildProcess = spawn(pythonPath, [
        scriptPath,
        '--project', projectPath,
        '--blueprint', blueprintPath,
      ], {
        cwd: projectPath,
        stdio: 'inherit',
        detached: false,
      });

      buildProcess.on('error', (error) => {
        console.error('Build process error:', error);
      });

      return { success: true, pid: buildProcess.pid };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Fix a specific component
  ipcMain.handle(IPC_CHANNELS.BLUEPRINT_FIX_COMPONENT, async (_event, { projectPath, componentId }) => {
    try {
      const blueprintPath = findBlueprintPath(projectPath);

      if (!blueprintPath) {
        return { success: false, error: 'Blueprint not found' };
      }

      const blueprint = loadBlueprint(blueprintPath);

      if (!blueprint) {
        return { success: false, error: 'Failed to load blueprint' };
      }

      // Find component
      const component = blueprint.components.find((c) => c.id === componentId);

      if (!component) {
        return { success: false, error: 'Component not found' };
      }

      // Reset status to pending so it gets picked up next
      component.status = 'pending';
      component.notes.push(`[${new Date().toISOString()}] Marked for fix`);

      // Save updated blueprint
      saveBlueprint(blueprintPath, blueprint);

      // Start the build (it will pick up this component as next pending)
      const pythonPath = getPythonPath(projectPath);
      const scriptPath = path.join(
        projectPath,
        'auto-claude',
        'integrations',
        'bmad',
        'blueprint_build.py'
      );

      const buildProcess = spawn(pythonPath, [
        scriptPath,
        '--project', projectPath,
        '--blueprint', blueprintPath,
        '--max-iterations', '1',  // Just fix this one component
      ], {
        cwd: projectPath,
        stdio: 'inherit',
        detached: false,
      });

      return { success: true, pid: buildProcess.pid };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Update component status
  ipcMain.handle(IPC_CHANNELS.BLUEPRINT_UPDATE_STATUS, async (_event, { projectPath, componentId, status, notes }) => {
    try {
      const blueprintPath = findBlueprintPath(projectPath);

      if (!blueprintPath) {
        return { success: false, error: 'Blueprint not found' };
      }

      const blueprint = loadBlueprint(blueprintPath);

      if (!blueprint) {
        return { success: false, error: 'Failed to load blueprint' };
      }

      // Find and update component
      const component = blueprint.components.find((c) => c.id === componentId);

      if (!component) {
        return { success: false, error: 'Component not found' };
      }

      component.status = status;
      if (notes) {
        component.notes.push(`[${new Date().toISOString()}] ${notes}`);
      }

      // Save updated blueprint
      saveBlueprint(blueprintPath, blueprint);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Create new blueprint
  ipcMain.handle(IPC_CHANNELS.BLUEPRINT_CREATE, async (_event, { projectPath, name, description, components }) => {
    try {
      const blueprintPath = path.join(projectPath, '.auto-claude', 'blueprint.yaml');

      // Ensure directory exists
      const dir = path.dirname(blueprintPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const blueprint: Blueprint = {
        name,
        version: '1.0.0',
        description,
        created_at: new Date().toISOString(),
        created_by: 'UI',
        project_path: projectPath,
        strictness: 'strict',
        components: components.map((c: any, index: number) => ({
          id: `comp-${String(index + 1).padStart(3, '0')}`,
          name: c.name,
          description: c.description || '',
          status: 'pending',
          files: c.files || [],
          acceptance_criteria: (c.acceptance_criteria || []).map((ac: string) => ({
            description: ac,
            verified: false,
          })),
          dependencies: c.dependencies || [],
          attempts: 0,
          notes: [],
          key_decisions: [],
        })),
      };

      saveBlueprint(blueprintPath, blueprint);

      return { success: true, blueprint, path: blueprintPath };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  console.log('Blueprint service initialized');
}
