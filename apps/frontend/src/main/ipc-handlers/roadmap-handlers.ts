import { ipcMain, app } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS, AUTO_BUILD_PATHS, getSpecsDir, DEFAULT_APP_SETTINGS, DEFAULT_FEATURE_MODELS, DEFAULT_FEATURE_THINKING } from '../../shared/constants';
import type { IPCResult, Roadmap, RoadmapFeature, RoadmapFeatureStatus, RoadmapGenerationStatus, Task, TaskMetadata, CompetitorAnalysis, AppSettings, ContinuousResearchState, ContinuousResearchProgress, ContinuousResearchSummary } from '../../shared/types';
import type { RoadmapConfig } from '../agent/types';
import path from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { projectStore } from '../project-store';
import { AgentManager } from '../agent';
import { debugLog, debugError } from '../../shared/utils/debug-logger';

/**
 * Read feature settings from the settings file
 */
function getFeatureSettings(): { model?: string; thinkingLevel?: string } {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');

  try {
    if (existsSync(settingsPath)) {
      const content = readFileSync(settingsPath, 'utf-8');
      const settings: AppSettings = { ...DEFAULT_APP_SETTINGS, ...JSON.parse(content) };

      // Get roadmap-specific settings
      const featureModels = settings.featureModels || DEFAULT_FEATURE_MODELS;
      const featureThinking = settings.featureThinking || DEFAULT_FEATURE_THINKING;

      return {
        model: featureModels.roadmap,
        thinkingLevel: featureThinking.roadmap
      };
    }
  } catch (error) {
    debugError('[Roadmap Handler] Failed to read feature settings:', error);
  }

  // Return defaults if settings file doesn't exist or fails to parse
  return {
    model: DEFAULT_FEATURE_MODELS.roadmap,
    thinkingLevel: DEFAULT_FEATURE_THINKING.roadmap
  };
}


/**
 * Register all roadmap-related IPC handlers
 */
export function registerRoadmapHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  // ============================================
  // Roadmap Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.ROADMAP_GET,
    async (_, projectId: string): Promise<IPCResult<Roadmap | null>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const roadmapPath = path.join(
        project.path,
        AUTO_BUILD_PATHS.ROADMAP_DIR,
        AUTO_BUILD_PATHS.ROADMAP_FILE
      );

      if (!existsSync(roadmapPath)) {
        return { success: true, data: null };
      }

      try {
        const content = readFileSync(roadmapPath, 'utf-8');
        const rawRoadmap = JSON.parse(content);

        // Load competitor analysis if available (competitor_analysis.json)
        const competitorAnalysisPath = path.join(
          project.path,
          AUTO_BUILD_PATHS.ROADMAP_DIR,
          AUTO_BUILD_PATHS.COMPETITOR_ANALYSIS
        );
        let competitorAnalysis: CompetitorAnalysis | undefined;
        if (existsSync(competitorAnalysisPath)) {
          try {
            const competitorContent = readFileSync(competitorAnalysisPath, 'utf-8');
            const rawCompetitor = JSON.parse(competitorContent);
            // Transform snake_case to camelCase for frontend
            competitorAnalysis = {
              projectContext: {
                projectName: rawCompetitor.project_context?.project_name || '',
                projectType: rawCompetitor.project_context?.project_type || '',
                targetAudience: rawCompetitor.project_context?.target_audience || ''
              },
              competitors: (rawCompetitor.competitors || []).map((c: Record<string, unknown>) => ({
                id: c.id,
                name: c.name,
                url: c.url,
                description: c.description,
                relevance: c.relevance || 'medium',
                painPoints: ((c.pain_points as Array<Record<string, unknown>>) || []).map((p) => ({
                  id: p.id,
                  description: p.description,
                  source: p.source,
                  severity: p.severity || 'medium',
                  frequency: p.frequency || '',
                  opportunity: p.opportunity || ''
                })),
                strengths: (c.strengths as string[]) || [],
                marketPosition: (c.market_position as string) || ''
              })),
              marketGaps: (rawCompetitor.market_gaps || []).map((g: Record<string, unknown>) => ({
                id: g.id,
                description: g.description,
                affectedCompetitors: (g.affected_competitors as string[]) || [],
                opportunitySize: g.opportunity_size || 'medium',
                suggestedFeature: (g.suggested_feature as string) || ''
              })),
              insightsSummary: {
                topPainPoints: rawCompetitor.insights_summary?.top_pain_points || [],
                differentiatorOpportunities: rawCompetitor.insights_summary?.differentiator_opportunities || [],
                marketTrends: rawCompetitor.insights_summary?.market_trends || []
              },
              researchMetadata: {
                searchQueriesUsed: rawCompetitor.research_metadata?.search_queries_used || [],
                sourcesConsulted: rawCompetitor.research_metadata?.sources_consulted || [],
                limitations: rawCompetitor.research_metadata?.limitations || []
              },
              createdAt: rawCompetitor.metadata?.created_at ? new Date(rawCompetitor.metadata.created_at) : new Date()
            };
          } catch {
            // Ignore competitor analysis parsing errors - it's optional
          }
        }

        // Transform snake_case to camelCase for frontend
        const roadmap: Roadmap = {
          id: rawRoadmap.id || `roadmap-${Date.now()}`,
          projectId,
          projectName: rawRoadmap.project_name || project.name,
          version: rawRoadmap.version || '1.0',
          vision: rawRoadmap.vision || '',
          targetAudience: {
            primary: rawRoadmap.target_audience?.primary || '',
            secondary: rawRoadmap.target_audience?.secondary || []
          },
          phases: (rawRoadmap.phases || []).map((phase: Record<string, unknown>) => ({
            id: phase.id,
            name: phase.name,
            description: phase.description,
            order: phase.order,
            status: phase.status || 'planned',
            features: phase.features || [],
            milestones: (phase.milestones as Array<Record<string, unknown>> || []).map((m) => ({
              id: m.id,
              title: m.title,
              description: m.description,
              features: m.features || [],
              status: m.status || 'planned',
              targetDate: m.target_date ? new Date(m.target_date as string) : undefined
            }))
          })),
          features: (rawRoadmap.features || []).map((feature: Record<string, unknown>) => ({
            id: feature.id,
            title: feature.title,
            description: feature.description,
            rationale: feature.rationale || '',
            priority: feature.priority || 'should',
            complexity: feature.complexity || 'medium',
            impact: feature.impact || 'medium',
            phaseId: feature.phase_id,
            dependencies: feature.dependencies || [],
            status: feature.status || 'under_review',
            acceptanceCriteria: feature.acceptance_criteria || [],
            userStories: feature.user_stories || [],
            linkedSpecId: feature.linked_spec_id,
            competitorInsightIds: (feature.competitor_insight_ids as string[]) || undefined
          })),
          status: rawRoadmap.status || 'draft',
          competitorAnalysis,
          createdAt: rawRoadmap.metadata?.created_at ? new Date(rawRoadmap.metadata.created_at) : new Date(),
          updatedAt: rawRoadmap.metadata?.updated_at ? new Date(rawRoadmap.metadata.updated_at) : new Date()
        };

        return { success: true, data: roadmap };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read roadmap'
        };
      }
    }
  );

  // Get roadmap generation status - allows frontend to query if generation is running
  ipcMain.handle(
    IPC_CHANNELS.ROADMAP_GET_STATUS,
    async (_, projectId: string): Promise<IPCResult<{ isRunning: boolean }>> => {
      const isRunning = agentManager.isRoadmapRunning(projectId);
      debugLog('[Roadmap Handler] Get status:', { projectId, isRunning });
      return { success: true, data: { isRunning } };
    }
  );

  ipcMain.on(
    IPC_CHANNELS.ROADMAP_GENERATE,
    (_, projectId: string, enableCompetitorAnalysis?: boolean, refreshCompetitorAnalysis?: boolean) => {
      // Get feature settings for roadmap
      const featureSettings = getFeatureSettings();
      const config: RoadmapConfig = {
        model: featureSettings.model,
        thinkingLevel: featureSettings.thinkingLevel
      };

      debugLog('[Roadmap Handler] Generate request:', {
        projectId,
        enableCompetitorAnalysis,
        refreshCompetitorAnalysis,
        config
      });

      const mainWindow = getMainWindow();
      if (!mainWindow) return;

      const project = projectStore.getProject(projectId);
      if (!project) {
        debugError('[Roadmap Handler] Project not found:', projectId);
        mainWindow.webContents.send(
          IPC_CHANNELS.ROADMAP_ERROR,
          projectId,
          'Project not found'
        );
        return;
      }

      debugLog('[Roadmap Handler] Starting agent manager generation:', {
        projectId,
        projectPath: project.path,
        config
      });

      // Start roadmap generation via agent manager
      agentManager.startRoadmapGeneration(
        projectId,
        project.path,
        false, // refresh (not a refresh operation)
        enableCompetitorAnalysis ?? false,
        refreshCompetitorAnalysis ?? false,
        config
      );

      // Send initial progress
      mainWindow.webContents.send(
        IPC_CHANNELS.ROADMAP_PROGRESS,
        projectId,
        {
          phase: 'analyzing',
          progress: 10,
          message: 'Analyzing project structure...'
        } as RoadmapGenerationStatus
      );
    }
  );

  ipcMain.on(
    IPC_CHANNELS.ROADMAP_REFRESH,
    (_, projectId: string, enableCompetitorAnalysis?: boolean, refreshCompetitorAnalysis?: boolean) => {
      // Get feature settings for roadmap
      const featureSettings = getFeatureSettings();
      const config: RoadmapConfig = {
        model: featureSettings.model,
        thinkingLevel: featureSettings.thinkingLevel
      };

      debugLog('[Roadmap Handler] Refresh request:', {
        projectId,
        enableCompetitorAnalysis,
        refreshCompetitorAnalysis,
        config
      });

      const mainWindow = getMainWindow();
      if (!mainWindow) return;

      const project = projectStore.getProject(projectId);
      if (!project) {
        mainWindow.webContents.send(
          IPC_CHANNELS.ROADMAP_ERROR,
          projectId,
          'Project not found'
        );
        return;
      }

      // Start roadmap regeneration with refresh flag
      agentManager.startRoadmapGeneration(
        projectId,
        project.path,
        true, // refresh (this is a refresh operation)
        enableCompetitorAnalysis ?? false,
        refreshCompetitorAnalysis ?? false,
        config
      );

      // Send initial progress
      mainWindow.webContents.send(
        IPC_CHANNELS.ROADMAP_PROGRESS,
        projectId,
        {
          phase: 'analyzing',
          progress: 10,
          message: 'Refreshing roadmap...'
        } as RoadmapGenerationStatus
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ROADMAP_STOP,
    async (_, projectId: string): Promise<IPCResult> => {
      debugLog('[Roadmap Handler] Stop generation request:', { projectId });

      const mainWindow = getMainWindow();

      // Stop roadmap generation for this project
      const wasStopped = agentManager.stopRoadmap(projectId);

      debugLog('[Roadmap Handler] Stop result:', { projectId, wasStopped });

      if (wasStopped && mainWindow) {
        debugLog('[Roadmap Handler] Sending stopped event to renderer');
        mainWindow.webContents.send(IPC_CHANNELS.ROADMAP_STOPPED, projectId);
      }

      return { success: wasStopped };
    }
  );

  // ============================================
  // Roadmap Save (full state persistence for drag-and-drop)
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.ROADMAP_SAVE,
    async (
      _,
      projectId: string,
      roadmapData: Roadmap
    ): Promise<IPCResult> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const roadmapPath = path.join(
        project.path,
        AUTO_BUILD_PATHS.ROADMAP_DIR,
        AUTO_BUILD_PATHS.ROADMAP_FILE
      );

      if (!existsSync(roadmapPath)) {
        return { success: false, error: 'Roadmap not found' };
      }

      try {
        const content = readFileSync(roadmapPath, 'utf-8');
        const existingRoadmap = JSON.parse(content);

        // Transform camelCase features back to snake_case for JSON file
        existingRoadmap.features = roadmapData.features.map((feature) => ({
          id: feature.id,
          title: feature.title,
          description: feature.description,
          rationale: feature.rationale || '',
          priority: feature.priority,
          complexity: feature.complexity,
          impact: feature.impact,
          phase_id: feature.phaseId,
          dependencies: feature.dependencies || [],
          status: feature.status,
          acceptance_criteria: feature.acceptanceCriteria || [],
          user_stories: feature.userStories || [],
          linked_spec_id: feature.linkedSpecId,
          competitor_insight_ids: feature.competitorInsightIds
        }));

        // Update metadata timestamp
        existingRoadmap.metadata = existingRoadmap.metadata || {};
        existingRoadmap.metadata.updated_at = new Date().toISOString();

        writeFileSync(roadmapPath, JSON.stringify(existingRoadmap, null, 2));

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save roadmap'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ROADMAP_UPDATE_FEATURE,
    async (
      _,
      projectId: string,
      featureId: string,
      status: RoadmapFeatureStatus
    ): Promise<IPCResult> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const roadmapPath = path.join(
        project.path,
        AUTO_BUILD_PATHS.ROADMAP_DIR,
        AUTO_BUILD_PATHS.ROADMAP_FILE
      );

      if (!existsSync(roadmapPath)) {
        return { success: false, error: 'Roadmap not found' };
      }

      try {
        const content = readFileSync(roadmapPath, 'utf-8');
        const roadmap = JSON.parse(content);

        // Find and update the feature
        const feature = roadmap.features?.find((f: { id: string }) => f.id === featureId);
        if (!feature) {
          return { success: false, error: 'Feature not found' };
        }

        feature.status = status;
        roadmap.metadata = roadmap.metadata || {};
        roadmap.metadata.updated_at = new Date().toISOString();

        writeFileSync(roadmapPath, JSON.stringify(roadmap, null, 2));

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update feature'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ROADMAP_CONVERT_TO_SPEC,
    async (
      _,
      projectId: string,
      featureId: string
    ): Promise<IPCResult<Task>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const roadmapPath = path.join(
        project.path,
        AUTO_BUILD_PATHS.ROADMAP_DIR,
        AUTO_BUILD_PATHS.ROADMAP_FILE
      );

      if (!existsSync(roadmapPath)) {
        return { success: false, error: 'Roadmap not found' };
      }

      try {
        const content = readFileSync(roadmapPath, 'utf-8');
        const roadmap = JSON.parse(content);

        // Find the feature
        const feature = roadmap.features?.find((f: { id: string }) => f.id === featureId);
        if (!feature) {
          return { success: false, error: 'Feature not found' };
        }

        // Build task description from feature
        const taskDescription = `# ${feature.title}

${feature.description}

## Rationale
${feature.rationale || 'N/A'}

## User Stories
${(feature.user_stories || []).map((s: string) => `- ${s}`).join('\n') || 'N/A'}

## Acceptance Criteria
${(feature.acceptance_criteria || []).map((c: string) => `- [ ] ${c}`).join('\n') || 'N/A'}
`;

        // Generate proper spec directory (like task creation)
                const specsBaseDir = getSpecsDir(project.autoBuildPath);
        const specsDir = path.join(project.path, specsBaseDir);

        // Ensure specs directory exists
        if (!existsSync(specsDir)) {
          mkdirSync(specsDir, { recursive: true });
        }

        // Find next available spec number
        let specNumber = 1;
        const existingDirs = existsSync(specsDir)
          ? readdirSync(specsDir, { withFileTypes: true })
              .filter(d => d.isDirectory())
              .map(d => d.name)
          : [];
        const existingNumbers = existingDirs
          .map(name => {
            const match = name.match(/^(\d+)/);
            return match ? parseInt(match[1], 10) : 0;
          })
          .filter(n => n > 0);
        if (existingNumbers.length > 0) {
          specNumber = Math.max(...existingNumbers) + 1;
        }

        // Create spec ID with zero-padded number and slugified title
        const slugifiedTitle = feature.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 50);
        const specId = `${String(specNumber).padStart(3, '0')}-${slugifiedTitle}`;

        // Create spec directory
        const specDir = path.join(specsDir, specId);
        mkdirSync(specDir, { recursive: true });

        // Create initial implementation_plan.json
        const now = new Date().toISOString();
        const implementationPlan = {
          feature: feature.title,
          description: taskDescription,
          created_at: now,
          updated_at: now,
          status: 'pending',
          phases: []
        };
        writeFileSync(path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN), JSON.stringify(implementationPlan, null, 2));

        // Create requirements.json
        const requirements = {
          task_description: taskDescription,
          workflow_type: 'feature'
        };
        writeFileSync(path.join(specDir, AUTO_BUILD_PATHS.REQUIREMENTS), JSON.stringify(requirements, null, 2));

        // Create spec.md (required by backend spec creation process)
        writeFileSync(path.join(specDir, AUTO_BUILD_PATHS.SPEC_FILE), taskDescription);

        // Build metadata
        const metadata: TaskMetadata = {
          sourceType: 'roadmap',
          featureId: feature.id,
          category: 'feature'
        };
        writeFileSync(path.join(specDir, 'task_metadata.json'), JSON.stringify(metadata, null, 2));

        // NOTE: We do NOT auto-start spec creation here - user should explicitly start the task
        // from the kanban board when they're ready

        // Update feature with linked spec
        feature.status = 'planned';
        feature.linked_spec_id = specId;
        roadmap.metadata = roadmap.metadata || {};
        roadmap.metadata.updated_at = new Date().toISOString();
        writeFileSync(roadmapPath, JSON.stringify(roadmap, null, 2));

        // Create task object
        const task: Task = {
          id: specId,
          specId: specId,
          projectId,
          title: feature.title,
          description: taskDescription,
          status: 'backlog',
          subtasks: [],
          logs: [],
          metadata,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        return { success: true, data: task };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to convert feature to spec'
        };
      }
    }
  );

  // ============================================
  // Roadmap Agent Events → Renderer
  // ============================================

  agentManager.on('roadmap-progress', (projectId: string, status: RoadmapGenerationStatus) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.ROADMAP_PROGRESS, projectId, status);
    }
  });

  agentManager.on('roadmap-complete', (projectId: string, roadmap: Roadmap) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.ROADMAP_COMPLETE, projectId, roadmap);
    }
  });

  agentManager.on('roadmap-error', (projectId: string, error: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.ROADMAP_ERROR, projectId, error);
    }
  });

  // ============================================
  // Continuous Roadmap Operations
  // ============================================

  /**
   * Start continuous roadmap research mode.
   * Fire-and-forget operation - progress updates sent via events.
   */
  ipcMain.on(
    IPC_CHANNELS.CONTINUOUS_ROADMAP_START,
    (_, projectId: string, durationHours: number = 8) => {
      // Get feature settings for roadmap
      const featureSettings = getFeatureSettings();
      const config: RoadmapConfig = {
        model: featureSettings.model,
        thinkingLevel: featureSettings.thinkingLevel
      };

      debugLog('[Continuous Roadmap Handler] Start request:', {
        projectId,
        durationHours,
        config
      });

      const mainWindow = getMainWindow();
      if (!mainWindow) return;

      const project = projectStore.getProject(projectId);
      if (!project) {
        debugError('[Continuous Roadmap Handler] Project not found:', projectId);
        mainWindow.webContents.send(
          IPC_CHANNELS.CONTINUOUS_ROADMAP_ERROR,
          projectId,
          'Project not found'
        );
        return;
      }

      // Check if regular roadmap generation is already running
      if (agentManager.isRoadmapRunning(projectId)) {
        debugError('[Continuous Roadmap Handler] Regular roadmap generation already running:', projectId);
        mainWindow.webContents.send(
          IPC_CHANNELS.CONTINUOUS_ROADMAP_ERROR,
          projectId,
          'Cannot start continuous mode while roadmap generation is running'
        );
        return;
      }

      // Start continuous roadmap via agent manager
      agentManager.startContinuousRoadmap(
        projectId,
        project.path,
        durationHours,
        config
      );

      // Send initial progress
      mainWindow.webContents.send(
        IPC_CHANNELS.CONTINUOUS_ROADMAP_PROGRESS,
        projectId,
        {
          phase: 'idle',
          phaseName: 'Starting',
          iterationCount: 0,
          phaseIteration: 0,
          totalPhases: 5,
          elapsedHours: 0,
          durationHours,
          progress: 0,
          featureCount: 0,
          findingCount: 0,
          message: 'Initializing continuous research...'
        } as ContinuousResearchProgress
      );
    }
  );

  /**
   * Stop continuous roadmap research mode.
   * Returns the final state.
   */
  ipcMain.handle(
    IPC_CHANNELS.CONTINUOUS_ROADMAP_STOP,
    async (_, projectId: string): Promise<IPCResult<ContinuousResearchSummary | null>> => {
      debugLog('[Continuous Roadmap Handler] Stop request:', { projectId });

      const mainWindow = getMainWindow();

      // Stop continuous roadmap for this project
      const summary = agentManager.stopContinuousRoadmap(projectId);

      debugLog('[Continuous Roadmap Handler] Stop result:', { projectId, summary });

      if (mainWindow) {
        debugLog('[Continuous Roadmap Handler] Sending stopped event to renderer');
        mainWindow.webContents.send(IPC_CHANNELS.CONTINUOUS_ROADMAP_STOPPED, projectId);
      }

      return { success: true, data: summary };
    }
  );

  /**
   * Get continuous roadmap research status.
   */
  ipcMain.handle(
    IPC_CHANNELS.CONTINUOUS_ROADMAP_STATUS,
    async (_, projectId: string): Promise<IPCResult<ContinuousResearchState | null>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const isRunning = agentManager.isContinuousRoadmapRunning(projectId);
      debugLog('[Continuous Roadmap Handler] Get status:', { projectId, isRunning });

      // Try to load state from file if available
      const statePath = path.join(
        project.path,
        AUTO_BUILD_PATHS.ROADMAP_DIR,
        'continuous_research_state.json'
      );

      if (!existsSync(statePath)) {
        return { success: true, data: null };
      }

      try {
        const content = readFileSync(statePath, 'utf-8');
        const rawState = JSON.parse(content);

        // Transform snake_case to camelCase for frontend
        const state: ContinuousResearchState = {
          isRunning: rawState.is_running ?? isRunning,
          startedAt: rawState.started_at,
          stoppedAt: rawState.stopped_at,
          durationHours: rawState.duration_hours ?? 8,
          currentPhase: rawState.current_phase ?? 'idle',
          phaseStartedAt: rawState.phase_started_at,
          iterationCount: rawState.iteration_count ?? 0,
          phaseIteration: rawState.phase_iteration ?? 0,
          features: (rawState.features ?? []).map((f: Record<string, unknown>) => ({
            id: f.id,
            title: f.title,
            description: f.description,
            category: f.category,
            phaseDiscovered: f.phase_discovered,
            iterationDiscovered: f.iteration_discovered,
            priority_score: f.priority_score ?? 0,
            priority_level: f.priority_level ?? 'low',
            acceleration: f.acceleration ?? 0,
            impact: f.impact ?? 0,
            feasibility: f.feasibility ?? 0,
            strategic_alignment: f.strategic_alignment ?? 0,
            dependency: f.dependency ?? 0,
            evidence: f.evidence ?? [],
            createdAt: f.created_at,
            updatedAt: f.updated_at,
            metadata: f.metadata
          })),
          findings: (rawState.findings ?? []).map((f: Record<string, unknown>) => ({
            id: f.id,
            phase: f.phase,
            title: f.title,
            description: f.description,
            source: f.source,
            discoveredAt: f.discovered_at,
            iteration: f.iteration,
            metadata: f.metadata
          })),
          lastRebalanceAt: rawState.last_rebalance_at,
          rebalanceCount: rawState.rebalance_count ?? 0,
          errors: rawState.errors ?? [],
          lastError: rawState.last_error
        };

        return { success: true, data: state };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read continuous research state'
        };
      }
    }
  );

  /**
   * Resume continuous roadmap research from saved state.
   * Fire-and-forget operation - progress updates sent via events.
   */
  ipcMain.on(
    IPC_CHANNELS.CONTINUOUS_ROADMAP_RESUME,
    (_, projectId: string) => {
      // Get feature settings for roadmap
      const featureSettings = getFeatureSettings();
      const config: RoadmapConfig = {
        model: featureSettings.model,
        thinkingLevel: featureSettings.thinkingLevel
      };

      debugLog('[Continuous Roadmap Handler] Resume request:', {
        projectId,
        config
      });

      const mainWindow = getMainWindow();
      if (!mainWindow) return;

      const project = projectStore.getProject(projectId);
      if (!project) {
        debugError('[Continuous Roadmap Handler] Project not found:', projectId);
        mainWindow.webContents.send(
          IPC_CHANNELS.CONTINUOUS_ROADMAP_ERROR,
          projectId,
          'Project not found'
        );
        return;
      }

      // Check if state file exists
      const statePath = path.join(
        project.path,
        AUTO_BUILD_PATHS.ROADMAP_DIR,
        'continuous_research_state.json'
      );

      if (!existsSync(statePath)) {
        debugError('[Continuous Roadmap Handler] No saved state found:', statePath);
        mainWindow.webContents.send(
          IPC_CHANNELS.CONTINUOUS_ROADMAP_ERROR,
          projectId,
          'No saved research state found. Please start a new continuous research session.'
        );
        return;
      }

      // Check if regular roadmap generation is already running
      if (agentManager.isRoadmapRunning(projectId)) {
        debugError('[Continuous Roadmap Handler] Regular roadmap generation already running:', projectId);
        mainWindow.webContents.send(
          IPC_CHANNELS.CONTINUOUS_ROADMAP_ERROR,
          projectId,
          'Cannot resume continuous mode while roadmap generation is running'
        );
        return;
      }

      // Resume continuous roadmap via agent manager
      agentManager.resumeContinuousRoadmap(
        projectId,
        project.path,
        config
      );

      // Send resuming progress
      mainWindow.webContents.send(
        IPC_CHANNELS.CONTINUOUS_ROADMAP_PROGRESS,
        projectId,
        {
          phase: 'idle',
          phaseName: 'Resuming',
          iterationCount: 0,
          phaseIteration: 0,
          totalPhases: 5,
          elapsedHours: 0,
          durationHours: 0,
          progress: 0,
          featureCount: 0,
          findingCount: 0,
          message: 'Resuming continuous research from saved state...'
        } as ContinuousResearchProgress
      );
    }
  );

  // ============================================
  // Continuous Roadmap Agent Events → Renderer
  // ============================================

  agentManager.on('continuous-roadmap-progress', (projectId: string, progress: ContinuousResearchProgress) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.CONTINUOUS_ROADMAP_PROGRESS, projectId, progress);
    }
  });

  agentManager.on('continuous-roadmap-iteration-complete', (projectId: string, summary: ContinuousResearchSummary) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.CONTINUOUS_ROADMAP_ITERATION_COMPLETE, projectId, summary);
    }
  });

  agentManager.on('continuous-roadmap-error', (projectId: string, error: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.CONTINUOUS_ROADMAP_ERROR, projectId, error);
    }
  });

  agentManager.on('continuous-roadmap-stopped', (projectId: string, summary: ContinuousResearchSummary) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.CONTINUOUS_ROADMAP_STOPPED, projectId, summary);
    }
  });

}
