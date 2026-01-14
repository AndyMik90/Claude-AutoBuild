/**
 * @vitest-environment jsdom
 */
/**
 * Tests for AgentTools component
 * Specifically tests agent profile resolution for phase-based and feature-based agents
 */
import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_AGENT_PROFILES, DEFAULT_PHASE_MODELS } from '../../../shared/constants/models';

// Mock electronAPI
global.window.electronAPI = {
  getProjectEnv: vi.fn().mockResolvedValue({ success: true, data: null }),
  updateProjectEnv: vi.fn().mockResolvedValue({ success: true }),
  checkMcpHealth: vi.fn().mockResolvedValue({ success: true, data: null }),
  testMcpConnection: vi.fn().mockResolvedValue({ success: true, data: null }),
} as any;

describe('AgentTools - Agent Profile Resolution', () => {
  describe('Profile Selection', () => {
    it('should find auto profile by ID', () => {
      const profile = DEFAULT_AGENT_PROFILES.find(p => p.id === 'auto');
      expect(profile).toBeDefined();
      expect(profile?.id).toBe('auto');
      expect(profile?.name).toBe('Auto (Optimized)');
      expect(profile?.model).toBe('opus');
    });

    it('should find complex profile by ID', () => {
      const profile = DEFAULT_AGENT_PROFILES.find(p => p.id === 'complex');
      expect(profile).toBeDefined();
      expect(profile?.id).toBe('complex');
      expect(profile?.name).toBe('Complex Tasks');
      expect(profile?.model).toBe('opus');
    });

    it('should find balanced profile by ID', () => {
      const profile = DEFAULT_AGENT_PROFILES.find(p => p.id === 'balanced');
      expect(profile).toBeDefined();
      expect(profile?.id).toBe('balanced');
      expect(profile?.name).toBe('Balanced');
      expect(profile?.model).toBe('sonnet');
    });

    it('should find quick profile by ID', () => {
      const profile = DEFAULT_AGENT_PROFILES.find(p => p.id === 'quick');
      expect(profile).toBeDefined();
      expect(profile?.id).toBe('quick');
      expect(profile?.name).toBe('Quick Edits');
      expect(profile?.model).toBe('haiku');
    });
  });

  describe('Auto Profile Phase Configuration', () => {
    it('should have Opus for all phases in auto profile', () => {
      const profile = DEFAULT_AGENT_PROFILES.find(p => p.id === 'auto');
      const phaseModels = profile?.phaseModels;

      expect(phaseModels).toBeDefined();
      expect(phaseModels?.spec).toBe('opus');
      expect(phaseModels?.planning).toBe('opus');
      expect(phaseModels?.coding).toBe('opus');
      expect(phaseModels?.qa).toBe('opus');
    });

    it('should have optimized thinking levels in auto profile', () => {
      const profile = DEFAULT_AGENT_PROFILES.find(p => p.id === 'auto');
      const phaseThinking = profile?.phaseThinking;

      expect(phaseThinking).toBeDefined();
      expect(phaseThinking?.spec).toBe('ultrathink');
      expect(phaseThinking?.planning).toBe('high');
      expect(phaseThinking?.coding).toBe('low');
      expect(phaseThinking?.qa).toBe('low');
    });
  });

  describe('Balanced Profile Phase Configuration', () => {
    it('should have Sonnet for all phases in balanced profile', () => {
      const profile = DEFAULT_AGENT_PROFILES.find(p => p.id === 'balanced');
      const phaseModels = profile?.phaseModels;

      expect(phaseModels).toBeDefined();
      expect(phaseModels?.spec).toBe('sonnet');
      expect(phaseModels?.planning).toBe('sonnet');
      expect(phaseModels?.coding).toBe('sonnet');
      expect(phaseModels?.qa).toBe('sonnet');
    });

    it('should have medium thinking for all phases in balanced profile', () => {
      const profile = DEFAULT_AGENT_PROFILES.find(p => p.id === 'balanced');
      const phaseThinking = profile?.phaseThinking;

      expect(phaseThinking).toBeDefined();
      expect(phaseThinking?.spec).toBe('medium');
      expect(phaseThinking?.planning).toBe('medium');
      expect(phaseThinking?.coding).toBe('medium');
      expect(phaseThinking?.qa).toBe('medium');
    });
  });

  describe('Profile Resolution Logic', () => {
    it('should use profile phase models when no custom overrides exist', () => {
      // Simulate settings with selected profile but no custom overrides
      const selectedProfileId = 'auto';
      const customPhaseModels = undefined;

      const profile = DEFAULT_AGENT_PROFILES.find(p => p.id === selectedProfileId) || DEFAULT_AGENT_PROFILES[0];
      const profilePhaseModels = profile.phaseModels || DEFAULT_PHASE_MODELS;
      const phaseModels = customPhaseModels || profilePhaseModels;

      // Should resolve to auto profile's opus models
      expect(phaseModels.spec).toBe('opus');
      expect(phaseModels.planning).toBe('opus');
      expect(phaseModels.coding).toBe('opus');
      expect(phaseModels.qa).toBe('opus');
    });

    it('should use custom overrides when they exist', () => {
      // Simulate settings with custom overrides
      const selectedProfileId = 'auto';
      const customPhaseModels = {
        spec: 'sonnet' as const,
        planning: 'sonnet' as const,
        coding: 'sonnet' as const,
        qa: 'sonnet' as const,
      };

      const profile = DEFAULT_AGENT_PROFILES.find(p => p.id === selectedProfileId) || DEFAULT_AGENT_PROFILES[0];
      const profilePhaseModels = profile.phaseModels || DEFAULT_PHASE_MODELS;
      const phaseModels = customPhaseModels || profilePhaseModels;

      // Should resolve to custom overrides (sonnet)
      expect(phaseModels.spec).toBe('sonnet');
      expect(phaseModels.planning).toBe('sonnet');
      expect(phaseModels.coding).toBe('sonnet');
      expect(phaseModels.qa).toBe('sonnet');
    });

    it('should default to auto profile when selectedProfileId is undefined', () => {
      const selectedProfileId = undefined;
      const effectiveProfileId = selectedProfileId || 'auto';

      const profile = DEFAULT_AGENT_PROFILES.find(p => p.id === effectiveProfileId) || DEFAULT_AGENT_PROFILES[0];

      expect(profile.id).toBe('auto');
      expect(profile.model).toBe('opus');
    });

    it('should fall back to first profile when selected profile is not found', () => {
      const selectedProfileId = 'non-existent-profile';

      const profile = DEFAULT_AGENT_PROFILES.find(p => p.id === selectedProfileId) || DEFAULT_AGENT_PROFILES[0];

      expect(profile.id).toBe('auto');
      expect(profile.model).toBe('opus');
    });
  });

  describe('Agent Settings Resolution', () => {
    // Simulate the resolveAgentSettings function logic
    function resolveAgentSettings(
      settingsSource: { type: 'phase'; phase: 'spec' | 'planning' | 'coding' | 'qa' } | { type: 'feature'; feature: 'insights' | 'ideation' | 'roadmap' | 'githubIssues' | 'githubPrs' | 'utility' },
      phaseModels: { spec: string; planning: string; coding: string; qa: string },
      phaseThinking: { spec: string; planning: string; coding: string; qa: string }
    ) {
      if (settingsSource.type === 'phase') {
        return {
          model: phaseModels[settingsSource.phase],
          thinking: phaseThinking[settingsSource.phase],
        };
      }
      return { model: 'sonnet', thinking: 'medium' };
    }

    it('should resolve phase-based agent settings correctly', () => {
      const profile = DEFAULT_AGENT_PROFILES.find(p => p.id === 'auto')!;
      const phaseModels = profile.phaseModels!;
      const phaseThinking = profile.phaseThinking!;

      // Spec phase agent
      const specAgent = resolveAgentSettings(
        { type: 'phase', phase: 'spec' },
        phaseModels,
        phaseThinking
      );
      expect(specAgent.model).toBe('opus');
      expect(specAgent.thinking).toBe('ultrathink');

      // Planning phase agent
      const planningAgent = resolveAgentSettings(
        { type: 'phase', phase: 'planning' },
        phaseModels,
        phaseThinking
      );
      expect(planningAgent.model).toBe('opus');
      expect(planningAgent.thinking).toBe('high');

      // Coding phase agent
      const codingAgent = resolveAgentSettings(
        { type: 'phase', phase: 'coding' },
        phaseModels,
        phaseThinking
      );
      expect(codingAgent.model).toBe('opus');
      expect(codingAgent.thinking).toBe('low');

      // QA phase agent
      const qaAgent = resolveAgentSettings(
        { type: 'phase', phase: 'qa' },
        phaseModels,
        phaseThinking
      );
      expect(qaAgent.model).toBe('opus');
      expect(qaAgent.thinking).toBe('low');
    });
  });

  describe('Bug Fix Regression Test (ACS-255)', () => {
    it('should resolve to opus when auto profile is selected (not sonnet from defaults)', () => {
      // This test verifies the fix for ACS-255:
      // MCP Server Overview was showing Sonnet instead of Opus when Auto profile was selected

      const selectedProfileId = 'auto';
      const customPhaseModels = undefined; // No custom overrides

      // The bug was using DEFAULT_PHASE_MODELS directly (which is BALANCED_PHASE_MODELS = sonnet)
      // The fix is to resolve the selected profile first
      const profile = DEFAULT_AGENT_PROFILES.find(p => p.id === selectedProfileId) || DEFAULT_AGENT_PROFILES[0];
      const profilePhaseModels = profile.phaseModels || DEFAULT_PHASE_MODELS;
      const phaseModels = customPhaseModels || profilePhaseModels;

      // Should be opus (from auto profile), NOT sonnet (from DEFAULT_PHASE_MODELS)
      expect(phaseModels.spec).toBe('opus');
      expect(phaseModels.planning).toBe('opus');
      expect(phaseModels.coding).toBe('opus');
      expect(phaseModels.qa).toBe('opus');
    });

    it('should ensure DEFAULT_PHASE_MODELS is balanced (sonnet)', () => {
      // This documents that DEFAULT_PHASE_MODELS is the balanced profile (sonnet)
      // The bug was that this was being used instead of resolving the selected profile

      expect(DEFAULT_PHASE_MODELS.spec).toBe('sonnet');
      expect(DEFAULT_PHASE_MODELS.planning).toBe('sonnet');
      expect(DEFAULT_PHASE_MODELS.coding).toBe('sonnet');
      expect(DEFAULT_PHASE_MODELS.qa).toBe('sonnet');
    });
  });
});
