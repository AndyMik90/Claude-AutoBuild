import { useState, useEffect, useCallback, useMemo } from 'react';
import type { PluginContext, PluginSkill, BoilerplateReference } from '../../shared/types';
import { usePluginStore, getPluginContext } from '../stores/plugin-store';
import { useSettingsStore } from '../stores/settings-store';

/**
 * Return type for usePluginContext hook
 */
export interface UsePluginContextResult {
  /** Plugin context data (skills, patterns, conventions) */
  context: PluginContext | null;
  /** Whether context is currently loading */
  isLoading: boolean;
  /** Error message if loading failed */
  error: string | null;
  /** Whether context injection is enabled (user preference) */
  isEnabled: boolean;
  /** Toggle context injection preference */
  toggleEnabled: () => void;
  /** Manually refresh context */
  refresh: () => Promise<void>;
  /** Get formatted context string for injection into task */
  getContextString: () => string;
  /** Check if project has boilerplate context available */
  hasContext: boolean;
}

/**
 * Hook to manage plugin context for task creation.
 *
 * This hook:
 * - Loads plugin context for a project (if it's a boilerplate project)
 * - Respects user preference for context injection toggle
 * - Provides context data for injection into task prompts
 * - Supports manual refresh
 *
 * @param projectId - The project ID to get context for
 * @param boilerplateInfo - Optional boilerplate reference from project
 * @returns Plugin context state and actions
 */
export function usePluginContext(
  projectId: string | null,
  boilerplateInfo?: BoilerplateReference | null
): UsePluginContextResult {
  const [context, setContext] = useState<PluginContext | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get plugin from store if available
  const getPluginById = usePluginStore((state) => state.getPluginById);

  // Get settings for the injection preference
  const settings = useSettingsStore((state) => state.settings);

  // Context injection is enabled by default unless explicitly disabled
  const isEnabled = settings.enablePluginContextInjection !== false;

  /**
   * Load plugin context for the project
   */
  const loadContext = useCallback(async () => {
    if (!projectId) {
      setContext(null);
      return;
    }

    // Check if project has boilerplate info
    if (!boilerplateInfo) {
      setContext(null);
      return;
    }

    // Check if the associated plugin is installed
    const plugin = getPluginById(boilerplateInfo.pluginId);
    if (!plugin) {
      setContext(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const pluginContext = await getPluginContext(projectId);
      setContext(pluginContext);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load plugin context';
      setError(errorMessage);
      setContext(null);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, boilerplateInfo, getPluginById]);

  // Load context when dependencies change
  useEffect(() => {
    loadContext();
  }, [loadContext]);

  /**
   * Toggle the context injection preference
   */
  const toggleEnabled = useCallback(async () => {
    const newValue = !isEnabled;
    try {
      await window.electronAPI.saveSettings({
        enablePluginContextInjection: newValue
      });
    } catch {
      // Settings update failed, preference will be unchanged
    }
  }, [isEnabled]);

  /**
   * Manually refresh the context
   */
  const refresh = useCallback(async () => {
    await loadContext();
  }, [loadContext]);

  /**
   * Generate a formatted context string for injection into task prompts
   */
  const getContextString = useCallback((): string => {
    if (!context || !isEnabled) {
      return '';
    }

    const sections: string[] = [];

    // Header
    sections.push(`## Boilerplate Context: ${context.pluginName} v${context.pluginVersion}`);
    sections.push('');

    // Skills section
    if (context.skills.length > 0) {
      sections.push('### Available Skills');
      sections.push('');

      // Group skills by domain
      const skillsByDomain = context.skills.reduce<Record<string, PluginSkill[]>>((acc, skill) => {
        const domain = skill.domain || 'general';
        if (!acc[domain]) {
          acc[domain] = [];
        }
        acc[domain].push(skill);
        return acc;
      }, {});

      for (const [domain, skills] of Object.entries(skillsByDomain)) {
        sections.push(`**${domain}**`);
        for (const skill of skills) {
          sections.push(`- ${skill.name}: ${skill.description}`);
        }
        sections.push('');
      }
    }

    // Patterns section
    if (context.patterns.length > 0) {
      sections.push('### Patterns');
      sections.push('');
      for (const pattern of context.patterns) {
        sections.push(`- **${pattern.name}**: ${pattern.description}`);
      }
      sections.push('');
    }

    // Conventions section
    if (context.conventions.length > 0) {
      sections.push('### Conventions');
      sections.push('');
      for (const convention of context.conventions) {
        sections.push(`- **${convention.name}**: ${convention.description}`);
      }
      sections.push('');
    }

    // If context has a pre-generated string, prefer that
    if (context.contextString) {
      return context.contextString;
    }

    return sections.join('\n');
  }, [context, isEnabled]);

  /**
   * Check if context is available for the project
   */
  const hasContext = useMemo(() => {
    return context !== null && isEnabled;
  }, [context, isEnabled]);

  return {
    context,
    isLoading,
    error,
    isEnabled,
    toggleEnabled,
    refresh,
    getContextString,
    hasContext
  };
}

/**
 * Hook to get a summary of plugin context for display
 *
 * @param context - The plugin context to summarize
 * @returns Summary statistics
 */
export function usePluginContextSummary(context: PluginContext | null) {
  return useMemo(() => {
    if (!context) {
      return {
        skillCount: 0,
        patternCount: 0,
        conventionCount: 0,
        domainCount: 0,
        domains: [] as string[]
      };
    }

    // Get unique domains from skills
    const domains = [...new Set(context.skills.map(s => s.domain).filter(Boolean))];

    return {
      skillCount: context.skills.length,
      patternCount: context.patterns.length,
      conventionCount: context.conventions.length,
      domainCount: domains.length,
      domains
    };
  }, [context]);
}

/**
 * Hook to load plugin context when creating a new task
 * This is a simplified hook for task creation flow
 *
 * @param projectId - The project ID
 * @param boilerplateInfo - Optional boilerplate reference
 * @returns Context and loading state
 */
export function useTaskPluginContext(
  projectId: string | null,
  boilerplateInfo?: BoilerplateReference | null
) {
  const { context, isLoading, isEnabled, getContextString, hasContext } = usePluginContext(
    projectId,
    boilerplateInfo
  );

  return {
    context,
    isLoading,
    isEnabled,
    contextString: hasContext ? getContextString() : '',
    hasContext
  };
}
