/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Project, ProjectSettings } from '../../../shared/types';
import { DEFAULT_PROJECT_SETTINGS } from '../../../shared/constants';
import { Sidebar } from '../Sidebar';

const mockInitializeProject = vi.fn();
const mockRemoveProject = vi.fn();
const mockUpdateProjectSettings = vi.fn();
const mockUseProjectStore = vi.fn();

const gitSetupModalSpy = vi.fn((props: { open: boolean }) => (
  <div data-testid="git-setup-modal" data-open={props.open ? 'true' : 'false'} />
));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' }
  })
}));

vi.mock('../../stores/project-store', () => ({
  useProjectStore: (selector: (state: any) => any) => mockUseProjectStore(selector),
  initializeProject: (...args: unknown[]) => mockInitializeProject(...args),
  removeProject: (...args: unknown[]) => mockRemoveProject(...args),
  updateProjectSettings: (...args: unknown[]) => mockUpdateProjectSettings(...args)
}));

vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: (selector: (state: any) => any) =>
    selector({
      settings: { autoBuildPath: '/tmp/auto-claude' }
    })
}));

vi.mock('../RateLimitIndicator', () => ({
  RateLimitIndicator: () => null
}));

vi.mock('../ClaudeCodeStatusBadge', () => ({
  ClaudeCodeStatusBadge: () => null
}));

vi.mock('../AddProjectModal', () => ({
  AddProjectModal: () => null
}));

vi.mock('../GitSetupModal', () => ({
  GitSetupModal: (props: { open: boolean }) => gitSetupModalSpy(props)
}));

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge<T extends object>(
  base: T,
  overrides: Partial<T> = {}
): T {
  const merged: Record<string, unknown> = { ...(base as Record<string, unknown>) };

  for (const [key, value] of Object.entries(overrides)) {
    const baseValue = (base as Record<string, unknown>)[key];
    if (isPlainObject(value) && isPlainObject(baseValue)) {
      merged[key] = deepMerge(baseValue as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      merged[key] = value as unknown;
    }
  }

  return merged as T;
}

function createTestProject(overrides: Partial<Project> = {}): Project {
  const settings = deepMerge<ProjectSettings>(
    DEFAULT_PROJECT_SETTINGS,
    (overrides.settings ?? {}) as Partial<ProjectSettings>
  );
  return {
    id: 'project-1',
    name: 'Test Project',
    path: '/path/to/project',
    autoBuildPath: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
    settings
  };
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(window, 'electronAPI', {
      value: {
        checkGitStatus: vi.fn().mockResolvedValue({ success: true, data: {} }),
        getProjectEnv: vi.fn().mockResolvedValue({ success: false }),
        detectMainBranch: vi.fn().mockResolvedValue({ success: false }),
        updateProjectSettings: vi.fn().mockResolvedValue({ success: true })
      },
      configurable: true
    });
  });

  it('skips git setup checks when project useGit is false', async () => {
    const project = createTestProject({
      settings: { useGit: false }
    });

    const projectState = {
      projects: [project],
      selectedProjectId: project.id,
      selectProject: vi.fn(),
      error: null
    };

    mockUseProjectStore.mockImplementation((selector: (state: any) => any) =>
      selector(projectState)
    );

    render(
      <Sidebar
        onSettingsClick={vi.fn()}
        onNewTaskClick={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(window.electronAPI.checkGitStatus).not.toHaveBeenCalled();
    });

    expect(screen.getByTestId('git-setup-modal')).toHaveAttribute('data-open', 'false');
  });

  it('checks git status when project useGit is undefined', async () => {
    const project = createTestProject({
      settings: { useGit: undefined }
    });

    const projectState = {
      projects: [project],
      selectedProjectId: project.id,
      selectProject: vi.fn(),
      error: null
    };

    mockUseProjectStore.mockImplementation((selector: (state: any) => any) =>
      selector(projectState)
    );

    render(
      <Sidebar
        onSettingsClick={vi.fn()}
        onNewTaskClick={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(window.electronAPI.checkGitStatus).toHaveBeenCalledWith(project.path);
    });
  });
});
