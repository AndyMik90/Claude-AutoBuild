/**
 * @vitest-environment jsdom
 */
/**
 * Unit tests for FeatureCard dependencies section
 * Tests dependency display, reverse dependencies, validation warnings, and user interactions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeatureCard } from './FeatureCard';
import type { RoadmapFeature } from '../../../shared/types/roadmap';
import { TooltipProvider } from '../ui/tooltip';

// Wrapper for components that need TooltipProvider
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

// Custom render with wrapper
function renderWithWrapper(ui: React.ReactElement) {
  return render(ui, { wrapper: TestWrapper });
}

// Mock the roadmap store
vi.mock('../../stores/roadmap-store', () => ({
  useRoadmapStore: vi.fn()
}));

import { useRoadmapStore } from '../../stores/roadmap-store';

// Test feature data
const mockFeatures: RoadmapFeature[] = [
  {
    id: 'feat-1',
    title: 'Feature 1',
    description: 'Test feature 1',
    rationale: 'Test rationale 1',
    priority: 'must',
    complexity: 'medium',
    impact: 'high',
    status: 'planned',
    phaseId: 'phase-1',
    dependencies: ['feat-2'],
    reverseDependencies: ['feat-3'],
    acceptanceCriteria: [],
    userStories: []
  },
  {
    id: 'feat-2',
    title: 'Feature 2',
    description: 'Test feature 2',
    rationale: 'Test rationale 2',
    priority: 'should',
    complexity: 'low',
    impact: 'medium',
    status: 'done',
    phaseId: 'phase-1',
    dependencies: [],
    reverseDependencies: ['feat-1'],
    acceptanceCriteria: [],
    userStories: []
  },
  {
    id: 'feat-3',
    title: 'Feature 3',
    description: 'Test feature 3',
    rationale: 'Test rationale 3',
    priority: 'could',
    complexity: 'high',
    impact: 'low',
    status: 'planned',
    phaseId: 'phase-2',
    dependencies: ['feat-1'],
    reverseDependencies: [],
    acceptanceCriteria: [],
    userStories: []
  }
];

describe('FeatureCard Dependencies', () => {
  beforeEach(() => {
    // Mock the roadmap store with openDependencyDetail function
    vi.mocked(useRoadmapStore).mockReturnValue({
      openDependencyDetail: vi.fn(),
      closeDependencyDetail: vi.fn(),
      dependencyDetailFeatureId: null,
      // Add other required store properties with defaults
      roadmap: null as any,
      setRoadmap: vi.fn(),
      loading: false,
      error: null,
      setLoading: vi.fn(),
      setError: vi.fn(),
      generateRoadmap: vi.fn(),
      saveRoadmap: vi.fn(),
      loadRoadmap: vi.fn(),
      addFeature: vi.fn(),
      updateFeature: vi.fn(),
      deleteFeature: vi.fn(),
      reorderPhases: vi.fn(),
      reorderFeatures: vi.fn(),
      updatePhase: vi.fn(),
      deletePhase: vi.fn(),
      selectedFeatureId: null,
      setSelectedFeatureId: vi.fn(),
      generationStatus: {
        phase: 'idle',
        progress: 0,
        message: ''
      },
      setGenerationStatus: vi.fn(),
      competitorAnalysis: null,
      setCompetitorAnalysis: vi.fn(),
      clearRoadmap: vi.fn(),
      refreshRoadmap: vi.fn(),
      importFromCanny: vi.fn(),
      importFromGitHubIssues: vi.fn(),
      features: [],
      phases: []
    });
  });

  it('renders dependencies section when feature has dependencies', () => {
    const mockClick = vi.fn();
    renderWithWrapper(
      <FeatureCard
        feature={mockFeatures[0]}
        features={mockFeatures}
        onClick={mockClick}
        onConvertToSpec={vi.fn()}
        onGoToTask={vi.fn()}
      />
    );

    expect(screen.getByText(/dependencies \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText('Feature 2')).toBeInTheDocument();
  });

  it('renders reverse dependencies section when feature has reverse dependencies', () => {
    const mockClick = vi.fn();
    renderWithWrapper(
      <FeatureCard
        feature={mockFeatures[0]}
        features={mockFeatures}
        onClick={mockClick}
        onConvertToSpec={vi.fn()}
        onGoToTask={vi.fn()}
      />
    );

    expect(screen.getByText(/required by \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText('Feature 3')).toBeInTheDocument();
  });

  it('does not render dependencies section when feature has no dependencies', () => {
    const mockClick = vi.fn();
    renderWithWrapper(
      <FeatureCard
        feature={mockFeatures[1]}
        features={mockFeatures}
        onClick={mockClick}
        onConvertToSpec={vi.fn()}
        onGoToTask={vi.fn()}
      />
    );

    expect(screen.queryByText(/dependencies/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/required by/i)).not.toBeInTheDocument();
  });

  it('dependency chip is clickable when feature exists', () => {
    const mockClick = vi.fn();

    renderWithWrapper(
      <FeatureCard
        feature={mockFeatures[0]}
        features={mockFeatures}
        onClick={mockClick}
        onConvertToSpec={vi.fn()}
        onGoToTask={vi.fn()}
      />
    );

    const depChip = screen.getByText('Feature 2').closest('button');
    expect(depChip).not.toBeDisabled();
  });

  it('displays warning for missing dependencies', () => {
    const featureWithMissingDep: RoadmapFeature = {
      ...mockFeatures[0],
      dependencies: ['non-existent'],
      dependencyValidation: {
        hasMissing: true,
        hasCircular: false,
        missingIds: ['non-existent'],
        circularPaths: []
      }
    };

    renderWithWrapper(
      <FeatureCard
        feature={featureWithMissingDep}
        features={mockFeatures}
        onClick={vi.fn()}
        onConvertToSpec={vi.fn()}
        onGoToTask={vi.fn()}
      />
    );

    expect(screen.getByText('non-existent')).toBeInTheDocument();
    // Verify chip is disabled
    const chip = screen.getByText('non-existent').closest('button');
    expect(chip).toBeDisabled();
  });

  it('displays circular dependency warning when detected', () => {
    const featureWithCircularDep: RoadmapFeature = {
      ...mockFeatures[0],
      dependencies: ['feat-2'],
      dependencyValidation: {
        hasMissing: false,
        hasCircular: true,
        missingIds: [],
        circularPaths: [['feat-1', 'feat-2', 'feat-1']]
      }
    };

    renderWithWrapper(
      <FeatureCard
        feature={featureWithCircularDep}
        features={mockFeatures}
        onClick={vi.fn()}
        onConvertToSpec={vi.fn()}
        onGoToTask={vi.fn()}
      />
    );

    expect(screen.getByText(/circular dependency detected/i)).toBeInTheDocument();
  });

  it('reverse dependency chip is clickable', () => {
    const mockClick = vi.fn();

    renderWithWrapper(
      <FeatureCard
        feature={mockFeatures[0]}
        features={mockFeatures}
        onClick={mockClick}
        onConvertToSpec={vi.fn()}
        onGoToTask={vi.fn()}
      />
    );

    const reverseDepChip = screen.getByText('Feature 3').closest('button');
    expect(reverseDepChip).not.toBeDisabled();
  });

  it('shows both dependencies and reverse dependencies when both exist', () => {
    const mockClick = vi.fn();

    renderWithWrapper(
      <FeatureCard
        feature={mockFeatures[0]}
        features={mockFeatures}
        onClick={mockClick}
        onConvertToSpec={vi.fn()}
        onGoToTask={vi.fn()}
      />
    );

    // Both sections should be visible
    expect(screen.getByText(/dependencies \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/required by \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText('Feature 2')).toBeInTheDocument();
    expect(screen.getByText('Feature 3')).toBeInTheDocument();
  });

  it('displays correct dependency count in label', () => {
    const featureWithMultipleDeps: RoadmapFeature = {
      ...mockFeatures[0],
      dependencies: ['feat-2', 'feat-3'],
      reverseDependencies: ['feat-1', 'feat-2', 'feat-3']
    };

    renderWithWrapper(
      <FeatureCard
        feature={featureWithMultipleDeps}
        features={mockFeatures}
        onClick={vi.fn()}
        onConvertToSpec={vi.fn()}
        onGoToTask={vi.fn()}
      />
    );

    expect(screen.getByText(/dependencies \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/required by \(3\)/i)).toBeInTheDocument();
  });
});
