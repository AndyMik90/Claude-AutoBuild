import { IPC_CHANNELS } from '../../../shared/constants';
import { invokeIpc } from './ipc-utils';

/**
 * Blueprint types for BMAD integration
 */
export interface BlueprintComponent {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'verifying' | 'verified' | 'failed' | 'blocked';
  files: string[];
  acceptance_criteria: {
    description: string;
    verified: boolean;
    verified_at?: string;
    notes?: string;
  }[];
  dependencies: string[];
  started_at?: string;
  completed_at?: string;
  attempts: number;
  notes: string[];
  implementation_notes?: string;
  key_decisions: string[];
}

export interface Blueprint {
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

export interface BlueprintResult<T = void> {
  success: boolean;
  error?: string;
  blueprint?: Blueprint;
  path?: string;
  pid?: number;
  data?: T;
}

/**
 * Blueprint API operations for BMAD integration
 */
export interface BlueprintAPI {
  loadBlueprint: (projectPath: string, blueprintPath?: string) => Promise<BlueprintResult>;
  startBlueprintBuild: (projectPath: string) => Promise<BlueprintResult>;
  fixComponent: (projectPath: string, componentId: string) => Promise<BlueprintResult>;
  updateComponentStatus: (
    projectPath: string,
    componentId: string,
    status: string,
    notes?: string
  ) => Promise<BlueprintResult>;
  createBlueprint: (
    projectPath: string,
    name: string,
    description: string,
    components: Partial<BlueprintComponent>[]
  ) => Promise<BlueprintResult>;
}

/**
 * Creates the Blueprint API implementation
 */
export const createBlueprintAPI = (): BlueprintAPI => ({
  loadBlueprint: (projectPath: string, blueprintPath?: string): Promise<BlueprintResult> =>
    invokeIpc(IPC_CHANNELS.BLUEPRINT_LOAD, { projectPath, blueprintPath }),

  startBlueprintBuild: (projectPath: string): Promise<BlueprintResult> =>
    invokeIpc(IPC_CHANNELS.BLUEPRINT_START_BUILD, { projectPath }),

  fixComponent: (projectPath: string, componentId: string): Promise<BlueprintResult> =>
    invokeIpc(IPC_CHANNELS.BLUEPRINT_FIX_COMPONENT, { projectPath, componentId }),

  updateComponentStatus: (
    projectPath: string,
    componentId: string,
    status: string,
    notes?: string
  ): Promise<BlueprintResult> =>
    invokeIpc(IPC_CHANNELS.BLUEPRINT_UPDATE_STATUS, { projectPath, componentId, status, notes }),

  createBlueprint: (
    projectPath: string,
    name: string,
    description: string,
    components: Partial<BlueprintComponent>[]
  ): Promise<BlueprintResult> =>
    invokeIpc(IPC_CHANNELS.BLUEPRINT_CREATE, { projectPath, name, description, components })
});
