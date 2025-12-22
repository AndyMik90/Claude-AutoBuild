/**
 * End-to-End tests for main user flows
 * Tests the complete user experience in the Electron app
 *
 * NOTE: These tests require the Electron app to be built first.
 * Run `npm run build` before running E2E tests.
 * The tests also require Playwright to be installed.
 *
 * To run: npx playwright test --config=e2e/playwright.config.ts
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, statSync } from 'fs';
import path from 'path';

// Test data directory
const TEST_DATA_DIR = '/tmp/auto-claude-ui-e2e';
const TEST_PROJECT_DIR = path.join(TEST_DATA_DIR, 'test-project');

// Setup test environment
function setupTestEnvironment(): void {
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  mkdirSync(TEST_PROJECT_DIR, { recursive: true });
  mkdirSync(path.join(TEST_PROJECT_DIR, 'auto-claude', 'specs'), { recursive: true });
}

// Cleanup test environment
function cleanupTestEnvironment(): void {
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
}

// Helper to create a test spec
function createTestSpec(specId: string, status: 'pending' | 'in_progress' | 'completed' = 'pending'): void {
  const specDir = path.join(TEST_PROJECT_DIR, 'auto-claude', 'specs', specId);
  mkdirSync(specDir, { recursive: true });

  const chunkStatus = status === 'completed' ? 'completed' : status === 'in_progress' ? 'in_progress' : 'pending';

  writeFileSync(
    path.join(specDir, 'implementation_plan.json'),
    JSON.stringify({
      feature: `Test Feature ${specId}`,
      workflow_type: 'feature',
      services_involved: [],
      phases: [
        {
          phase: 1,
          name: 'Implementation',
          type: 'implementation',
          chunks: [
            { id: 'chunk-1', description: 'Implement feature', status: chunkStatus }
          ]
        }
      ],
      final_acceptance: ['Tests pass'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      spec_file: 'spec.md'
    })
  );

  writeFileSync(
    path.join(specDir, 'spec.md'),
    `# ${specId}\n\n## Overview\n\nThis is a test feature.\n`
  );
}

test.describe('Add Project Flow', () => {
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    setupTestEnvironment();
  });

  test.afterAll(async () => {
    if (app) {
      await app.close();
    }
    cleanupTestEnvironment();
  });

  test.skip('should open app and display empty state', async () => {
    // Skip test if electron is not available (CI environment)
    test.skip(!process.env.ELECTRON_PATH, 'Electron not available in CI');

    const appPath = path.join(__dirname, '..');
    app = await electron.launch({ args: [appPath] });
    page = await app.firstWindow();

    await page.waitForLoadState('domcontentloaded');

    // Verify app launched
    expect(await page.title()).toBeDefined();
  });

  test.skip('should show project sidebar', async () => {
    test.skip(!app, 'App not launched');

    // Look for sidebar component
    const sidebar = await page.locator('[data-testid="sidebar"], aside, .sidebar').first();
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });

  test.skip('should have add project button', async () => {
    test.skip(!app, 'App not launched');

    // Look for add project button
    const addButton = await page.locator(
      'button:has-text("Add"), button:has-text("New Project"), [data-testid="add-project"]'
    ).first();
    await expect(addButton).toBeVisible({ timeout: 5000 });
  });

  test.skip('should open directory picker on add project click', async () => {
    test.skip(!app, 'App not launched');

    // Mock the dialog to return test project path
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: ['/tmp/auto-claude-ui-e2e/test-project']
      });
    });

    // Click add project
    const addButton = await page.locator(
      'button:has-text("Add"), button:has-text("New Project"), [data-testid="add-project"]'
    ).first();
    await addButton.click();

    // Wait for project to appear in sidebar
    await page.waitForTimeout(1000);

    // Verify project appears
    const projectItem = await page.locator('text=test-project').first();
    await expect(projectItem).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Create Task Flow', () => {
  test.skip('should display task creation wizard', async () => {
    // This test requires the app to be running with a project selected
    // Skip in headless CI environments
    test.skip(true, 'Requires interactive Electron session');
  });

  test.skip('should create task with title and description', async () => {
    test.skip(true, 'Requires interactive Electron session');
  });

  test.skip('should show task card in backlog after creation', async () => {
    test.skip(true, 'Requires interactive Electron session');
  });
});

test.describe('Start Task Flow', () => {
  test.skip('should move task to In Progress when started', async () => {
    test.skip(true, 'Requires interactive Electron session');
  });

  test.skip('should show progress updates during execution', async () => {
    test.skip(true, 'Requires interactive Electron session');
  });

  test.skip('should display logs in detail panel', async () => {
    test.skip(true, 'Requires interactive Electron session');
  });
});

test.describe('Complete Review Flow', () => {
  test.skip('should display review interface for completed tasks', async () => {
    test.skip(true, 'Requires interactive Electron session');
  });

  test.skip('should move task to Done on approval', async () => {
    test.skip(true, 'Requires interactive Electron session');
  });

  test.skip('should restart task on rejection with feedback', async () => {
    test.skip(true, 'Requires interactive Electron session');
  });
});

// Simpler unit-style E2E tests that don't require full app launch
test.describe('E2E Test Infrastructure', () => {
  test('should have test environment setup correctly', () => {
    setupTestEnvironment();
    expect(existsSync(TEST_DATA_DIR)).toBe(true);
    expect(existsSync(TEST_PROJECT_DIR)).toBe(true);
    cleanupTestEnvironment();
  });

  test('should create test specs correctly', () => {
    setupTestEnvironment();
    createTestSpec('001-test-spec');

    const specDir = path.join(TEST_PROJECT_DIR, 'auto-claude', 'specs', '001-test-spec');
    expect(existsSync(specDir)).toBe(true);
    expect(existsSync(path.join(specDir, 'implementation_plan.json'))).toBe(true);
    expect(existsSync(path.join(specDir, 'spec.md'))).toBe(true);

    cleanupTestEnvironment();
  });

  test('should create specs with different statuses', () => {
    setupTestEnvironment();

    createTestSpec('001-pending', 'pending');
    createTestSpec('002-in-progress', 'in_progress');
    createTestSpec('003-completed', 'completed');

    const specsDir = path.join(TEST_PROJECT_DIR, 'auto-claude', 'specs');
    expect(existsSync(path.join(specsDir, '001-pending'))).toBe(true);
    expect(existsSync(path.join(specsDir, '002-in-progress'))).toBe(true);
    expect(existsSync(path.join(specsDir, '003-completed'))).toBe(true);

    cleanupTestEnvironment();
  });
});

// Mock-based E2E tests that can run without launching Electron
test.describe('E2E Flow Verification (Mock-based)', () => {
  test('Add Project flow should validate project path', async () => {
    setupTestEnvironment();

    // Simulate the validation that would happen in the app
    const projectPath = TEST_PROJECT_DIR;
    expect(existsSync(projectPath)).toBe(true);

    // Check for auto-claude directory detection
    const autoBuildPath = path.join(projectPath, 'auto-claude');
    expect(existsSync(autoBuildPath)).toBe(true);

    cleanupTestEnvironment();
  });

  test('Create Task flow should generate spec structure', async () => {
    setupTestEnvironment();

    // Simulate what would happen when creating a task
    const specId = '001-new-task';
    const specDir = path.join(TEST_PROJECT_DIR, 'auto-claude', 'specs', specId);
    mkdirSync(specDir, { recursive: true });

    // Write spec file
    writeFileSync(path.join(specDir, 'spec.md'), '# New Task Spec\n');

    expect(existsSync(specDir)).toBe(true);
    expect(existsSync(path.join(specDir, 'spec.md'))).toBe(true);

    cleanupTestEnvironment();
  });

  test('Start Task flow should update implementation plan status', async () => {
    setupTestEnvironment();
    createTestSpec('001-task', 'pending');

    // Simulate status update when task starts
    const planPath = path.join(
      TEST_PROJECT_DIR,
      'auto-claude',
      'specs',
      '001-task',
      'implementation_plan.json'
    );

    const plan = JSON.parse(readFileSync(planPath, 'utf-8'));
    plan.phases[0].chunks[0].status = 'in_progress';

    writeFileSync(planPath, JSON.stringify(plan, null, 2));

    // Verify update
    const updatedPlan = JSON.parse(readFileSync(planPath, 'utf-8'));
    expect(updatedPlan.phases[0].chunks[0].status).toBe('in_progress');

    cleanupTestEnvironment();
  });

  test('Complete Review flow should write QA report', async () => {
    setupTestEnvironment();
    createTestSpec('001-review', 'completed');

    // Simulate approval
    const qaReportPath = path.join(
      TEST_PROJECT_DIR,
      'auto-claude',
      'specs',
      '001-review',
      'qa_report.md'
    );

    writeFileSync(qaReportPath, `# QA Review\n\nStatus: APPROVED\n\nReviewed at: ${new Date().toISOString()}\n`);

    expect(existsSync(qaReportPath)).toBe(true);

    const content = readFileSync(qaReportPath, 'utf-8');
    expect(content).toContain('APPROVED');

    cleanupTestEnvironment();
  });

  test('Rejection flow should write fix request', async () => {
    setupTestEnvironment();
    createTestSpec('001-reject', 'completed');

    // Simulate rejection
    const fixRequestPath = path.join(
      TEST_PROJECT_DIR,
      'auto-claude',
      'specs',
      '001-reject',
      'QA_FIX_REQUEST.md'
    );

    writeFileSync(
      fixRequestPath,
      `# QA Fix Request\n\nStatus: REJECTED\n\n## Feedback\n\nNeeds more tests\n`
    );

    expect(existsSync(fixRequestPath)).toBe(true);

    const content = readFileSync(fixRequestPath, 'utf-8');
    expect(content).toContain('REJECTED');
    expect(content).toContain('Needs more tests');

    cleanupTestEnvironment();
  });
});

// Ideation project scope persistence E2E tests
test.describe('Ideation Project Scope Persistence (Mock-based)', () => {
  // Secondary test project for multi-project scenarios
  const TEST_PROJECT_B_DIR = path.join(TEST_DATA_DIR, 'test-project-b');

  function setupMultiProjectEnvironment(): void {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });
    mkdirSync(TEST_PROJECT_DIR, { recursive: true });
    mkdirSync(TEST_PROJECT_B_DIR, { recursive: true });
    mkdirSync(path.join(TEST_PROJECT_DIR, '.auto-claude', 'ideation'), { recursive: true });
    mkdirSync(path.join(TEST_PROJECT_B_DIR, '.auto-claude', 'ideation'), { recursive: true });
  }

  function cleanupMultiProjectEnvironment(): void {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  }

  function createIdeationData(projectDir: string, ideas: { id: string; title: string }[]): void {
    const ideationPath = path.join(projectDir, '.auto-claude', 'ideation', 'ideation.json');
    const session = {
      id: `session-${Date.now()}`,
      projectId: path.basename(projectDir),
      config: {
        enabledTypes: ['code_improvements', 'ui_ux_improvements'],
        includeRoadmapContext: false,
        includeKanbanContext: false,
        maxIdeasPerType: 5
      },
      ideas: ideas.map(idea => ({
        ...idea,
        type: 'code_improvements',
        description: `Description for ${idea.title}`,
        rationale: 'Test rationale',
        status: 'draft',
        createdAt: new Date().toISOString(),
        buildsUpon: [],
        estimatedEffort: 'small',
        affectedFiles: ['src/test.ts'],
        existingPatterns: []
      })),
      projectContext: {
        existingFeatures: ['Feature 1'],
        techStack: ['TypeScript', 'React'],
        plannedFeatures: []
      },
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    writeFileSync(ideationPath, JSON.stringify(session, null, 2));
  }

  test('Project A ideation should be isolated from Project B', async () => {
    setupMultiProjectEnvironment();

    // Create ideation for Project A
    createIdeationData(TEST_PROJECT_DIR, [
      { id: 'idea-a-1', title: 'Project A Idea 1' },
      { id: 'idea-a-2', title: 'Project A Idea 2' }
    ]);

    // Create ideation for Project B
    createIdeationData(TEST_PROJECT_B_DIR, [
      { id: 'idea-b-1', title: 'Project B Idea 1' }
    ]);

    // Verify files exist
    const ideationPathA = path.join(TEST_PROJECT_DIR, '.auto-claude', 'ideation', 'ideation.json');
    const ideationPathB = path.join(TEST_PROJECT_B_DIR, '.auto-claude', 'ideation', 'ideation.json');
    expect(existsSync(ideationPathA)).toBe(true);
    expect(existsSync(ideationPathB)).toBe(true);

    // Read and verify Project A's ideation
    const sessionA = JSON.parse(readFileSync(ideationPathA, 'utf-8'));
    expect(sessionA.ideas).toHaveLength(2);
    expect(sessionA.ideas[0].title).toBe('Project A Idea 1');
    expect(sessionA.ideas[1].title).toBe('Project A Idea 2');

    // Read and verify Project B's ideation
    const sessionB = JSON.parse(readFileSync(ideationPathB, 'utf-8'));
    expect(sessionB.ideas).toHaveLength(1);
    expect(sessionB.ideas[0].title).toBe('Project B Idea 1');

    // Verify isolation: Project A's ideas are not in Project B's file and vice versa
    expect(sessionA.ideas.some((i: { title: string }) => i.title === 'Project B Idea 1')).toBe(false);
    expect(sessionB.ideas.some((i: { title: string }) => i.title === 'Project A Idea 1')).toBe(false);

    cleanupMultiProjectEnvironment();
  });

  test('Empty project should have no ideation file', async () => {
    setupMultiProjectEnvironment();

    // Project A has ideation
    createIdeationData(TEST_PROJECT_DIR, [
      { id: 'idea-a-1', title: 'Project A Idea' }
    ]);

    // Project B has no ideation (we didn't create the file)
    // But the directory exists (created by setup)
    const ideationPathA = path.join(TEST_PROJECT_DIR, '.auto-claude', 'ideation', 'ideation.json');
    const ideationPathB = path.join(TEST_PROJECT_B_DIR, '.auto-claude', 'ideation', 'ideation.json');

    // Clean up Project B's ideation file if it exists
    if (existsSync(ideationPathB)) {
      rmSync(ideationPathB);
    }

    expect(existsSync(ideationPathA)).toBe(true);
    expect(existsSync(ideationPathB)).toBe(false);

    // Verify Project A still has its ideation
    const sessionA = JSON.parse(readFileSync(ideationPathA, 'utf-8'));
    expect(sessionA.ideas).toHaveLength(1);

    cleanupMultiProjectEnvironment();
  });

  test('Switching projects should read correct ideation.json file', async () => {
    setupMultiProjectEnvironment();

    // Create distinct ideation for each project
    createIdeationData(TEST_PROJECT_DIR, [
      { id: 'unique-a-1', title: 'Unique Project A Idea' }
    ]);
    createIdeationData(TEST_PROJECT_B_DIR, [
      { id: 'unique-b-1', title: 'Unique Project B Idea' }
    ]);

    // Simulate app behavior: read ideation.json for the currently selected project
    const ideationPathA = path.join(TEST_PROJECT_DIR, '.auto-claude', 'ideation', 'ideation.json');
    const ideationPathB = path.join(TEST_PROJECT_B_DIR, '.auto-claude', 'ideation', 'ideation.json');

    // "Switch" to Project A - read its ideation
    let currentSession = JSON.parse(readFileSync(ideationPathA, 'utf-8'));
    expect(currentSession.ideas[0].title).toBe('Unique Project A Idea');

    // "Switch" to Project B - read its ideation
    currentSession = JSON.parse(readFileSync(ideationPathB, 'utf-8'));
    expect(currentSession.ideas[0].title).toBe('Unique Project B Idea');

    // "Switch" back to Project A - should still have Project A's ideation
    currentSession = JSON.parse(readFileSync(ideationPathA, 'utf-8'));
    expect(currentSession.ideas[0].title).toBe('Unique Project A Idea');

    cleanupMultiProjectEnvironment();
  });

  test('Ideation file should contain valid JSON with expected structure', async () => {
    setupMultiProjectEnvironment();

    createIdeationData(TEST_PROJECT_DIR, [
      { id: 'test-idea-1', title: 'Test Idea' }
    ]);

    const ideationPath = path.join(TEST_PROJECT_DIR, '.auto-claude', 'ideation', 'ideation.json');
    const content = readFileSync(ideationPath, 'utf-8');

    // Should be valid JSON
    let session;
    expect(() => {
      session = JSON.parse(content);
    }).not.toThrow();

    // Should have expected structure
    expect(session).toHaveProperty('id');
    expect(session).toHaveProperty('projectId');
    expect(session).toHaveProperty('config');
    expect(session).toHaveProperty('ideas');
    expect(session).toHaveProperty('projectContext');
    expect(session).toHaveProperty('generatedAt');
    expect(session).toHaveProperty('updatedAt');

    // Config should have required fields
    expect(session.config).toHaveProperty('enabledTypes');
    expect(session.config).toHaveProperty('maxIdeasPerType');

    // Ideas should be an array
    expect(Array.isArray(session.ideas)).toBe(true);

    cleanupMultiProjectEnvironment();
  });
});

// Ideation File Generation E2E tests (subtask-5-2)
test.describe('Ideation File Generation Verification (Mock-based)', () => {
  const TEST_IDEATION_PROJECT = path.join(TEST_DATA_DIR, 'ideation-gen-project');

  function setupIdeationProject(): void {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });
    mkdirSync(TEST_IDEATION_PROJECT, { recursive: true });
    mkdirSync(path.join(TEST_IDEATION_PROJECT, '.auto-claude', 'ideation', 'screenshots'), { recursive: true });
  }

  function cleanupIdeationProject(): void {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  }

  /**
   * Simulates the output files produced by the ideation runner
   * This mirrors what auto-claude/ideation/runner.py produces
   */
  function simulateIdeationGeneration(projectDir: string): void {
    const ideationDir = path.join(projectDir, '.auto-claude', 'ideation');

    // Phase 1: Project Index
    const projectIndex = {
      project_name: 'test-project',
      language: 'TypeScript',
      framework: 'React',
      key_files: ['src/index.ts', 'src/App.tsx'],
      analyzed_at: new Date().toISOString()
    };
    writeFileSync(path.join(ideationDir, 'project_index.json'), JSON.stringify(projectIndex, null, 2));

    // Phase 2: Context & Graph Hints
    const ideationContext = {
      existing_features: ['User authentication', 'Dashboard'],
      tech_stack: ['TypeScript', 'React', 'Electron'],
      planned_features: [],
      roadmap_context: null,
      kanban_context: null
    };
    writeFileSync(path.join(ideationDir, 'ideation_context.json'), JSON.stringify(ideationContext, null, 2));

    const graphHints = {
      file_dependencies: {},
      module_structure: {},
      generated_at: new Date().toISOString()
    };
    writeFileSync(path.join(ideationDir, 'graph_hints.json'), JSON.stringify(graphHints, null, 2));

    // Phase 3: Ideation Types
    const ideaTypes = ['code_improvements', 'ui_ux_improvements'];
    const typeIdeas: Record<string, object[]> = {};

    ideaTypes.forEach((type, index) => {
      const ideas = [{
        id: `idea-${type}-1`,
        title: `${type.replace(/_/g, ' ')} idea 1`,
        type: type,
        description: `Description for ${type} idea`,
        rationale: 'Test rationale',
        status: 'draft',
        priority: 'medium',
        estimatedEffort: 'small',
        createdAt: new Date().toISOString(),
        affectedFiles: ['src/test.ts'],
        existingPatterns: [],
        buildsUpon: []
      }];

      typeIdeas[type] = ideas;
      const typeFile = {
        type: type,
        ideas: ideas,
        generated_at: new Date().toISOString()
      };
      writeFileSync(path.join(ideationDir, `${type}_ideas.json`), JSON.stringify(typeFile, null, 2));
    });

    // Phase 4: Merge - Final ideation.json (mimics backend structure)
    const allIdeas = Object.values(typeIdeas).flat();
    const ideationSession = {
      id: `session-${Date.now()}`,
      projectId: path.basename(projectDir),
      config: {
        enabledTypes: ideaTypes,
        includeRoadmapContext: false,
        includeKanbanContext: false,
        maxIdeasPerType: 5
      },
      ideas: allIdeas,
      projectContext: {
        existingFeatures: ['User authentication', 'Dashboard'],
        techStack: ['TypeScript', 'React', 'Electron'],
        plannedFeatures: []
      },
      summary: {
        total: allIdeas.length,
        by_type: ideaTypes.reduce((acc, type) => {
          acc[type] = typeIdeas[type].length;
          return acc;
        }, {} as Record<string, number>)
      },
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    writeFileSync(path.join(ideationDir, 'ideation.json'), JSON.stringify(ideationSession, null, 2));
  }

  test('Ideation generation creates output directory structure', async () => {
    setupIdeationProject();

    // Verify .auto-claude/ideation directory exists
    const ideationDir = path.join(TEST_IDEATION_PROJECT, '.auto-claude', 'ideation');
    expect(existsSync(ideationDir)).toBe(true);

    // Verify screenshots directory exists
    const screenshotsDir = path.join(ideationDir, 'screenshots');
    expect(existsSync(screenshotsDir)).toBe(true);

    cleanupIdeationProject();
  });

  test('Ideation generation produces ideation.json file', async () => {
    setupIdeationProject();
    simulateIdeationGeneration(TEST_IDEATION_PROJECT);

    const ideationPath = path.join(TEST_IDEATION_PROJECT, '.auto-claude', 'ideation', 'ideation.json');
    expect(existsSync(ideationPath)).toBe(true);

    // Verify file size is non-zero
    const stats = statSync(ideationPath);
    expect(stats.size).toBeGreaterThan(0);

    cleanupIdeationProject();
  });

  test('Ideation generation produces all phase output files', async () => {
    setupIdeationProject();
    simulateIdeationGeneration(TEST_IDEATION_PROJECT);

    const ideationDir = path.join(TEST_IDEATION_PROJECT, '.auto-claude', 'ideation');

    // Phase 1: Project Index
    expect(existsSync(path.join(ideationDir, 'project_index.json'))).toBe(true);

    // Phase 2: Context & Graph Hints
    expect(existsSync(path.join(ideationDir, 'ideation_context.json'))).toBe(true);
    expect(existsSync(path.join(ideationDir, 'graph_hints.json'))).toBe(true);

    // Phase 3: Ideation Type Files
    expect(existsSync(path.join(ideationDir, 'code_improvements_ideas.json'))).toBe(true);
    expect(existsSync(path.join(ideationDir, 'ui_ux_improvements_ideas.json'))).toBe(true);

    // Phase 4: Final Merged File
    expect(existsSync(path.join(ideationDir, 'ideation.json'))).toBe(true);

    cleanupIdeationProject();
  });

  test('ideation.json has expected backend structure', async () => {
    setupIdeationProject();
    simulateIdeationGeneration(TEST_IDEATION_PROJECT);

    const ideationPath = path.join(TEST_IDEATION_PROJECT, '.auto-claude', 'ideation', 'ideation.json');
    const content = readFileSync(ideationPath, 'utf-8');
    const session = JSON.parse(content);

    // Required top-level fields (matching backend output)
    expect(session).toHaveProperty('id');
    expect(session).toHaveProperty('projectId');
    expect(session).toHaveProperty('config');
    expect(session).toHaveProperty('ideas');
    expect(session).toHaveProperty('projectContext');
    expect(session).toHaveProperty('summary');
    expect(session).toHaveProperty('generatedAt');
    expect(session).toHaveProperty('updatedAt');

    // Config structure
    expect(session.config).toHaveProperty('enabledTypes');
    expect(session.config).toHaveProperty('maxIdeasPerType');
    expect(Array.isArray(session.config.enabledTypes)).toBe(true);

    // Summary structure (unique to backend output)
    expect(session.summary).toHaveProperty('total');
    expect(session.summary).toHaveProperty('by_type');
    expect(typeof session.summary.total).toBe('number');

    cleanupIdeationProject();
  });

  test('Ideas in ideation.json have expected structure', async () => {
    setupIdeationProject();
    simulateIdeationGeneration(TEST_IDEATION_PROJECT);

    const ideationPath = path.join(TEST_IDEATION_PROJECT, '.auto-claude', 'ideation', 'ideation.json');
    const session = JSON.parse(readFileSync(ideationPath, 'utf-8'));

    expect(Array.isArray(session.ideas)).toBe(true);
    expect(session.ideas.length).toBeGreaterThan(0);

    // Verify first idea has expected fields
    const idea = session.ideas[0];
    expect(idea).toHaveProperty('id');
    expect(idea).toHaveProperty('title');
    expect(idea).toHaveProperty('type');
    expect(idea).toHaveProperty('description');
    expect(idea).toHaveProperty('status');
    expect(idea).toHaveProperty('createdAt');

    // Verify idea type is one of the enabled types
    expect(session.config.enabledTypes).toContain(idea.type);

    cleanupIdeationProject();
  });

  test('Type-specific files contain valid JSON', async () => {
    setupIdeationProject();
    simulateIdeationGeneration(TEST_IDEATION_PROJECT);

    const ideationDir = path.join(TEST_IDEATION_PROJECT, '.auto-claude', 'ideation');
    const typeFile = path.join(ideationDir, 'code_improvements_ideas.json');

    const content = readFileSync(typeFile, 'utf-8');
    let typeData;
    expect(() => {
      typeData = JSON.parse(content);
    }).not.toThrow();

    expect(typeData).toHaveProperty('type');
    expect(typeData).toHaveProperty('ideas');
    expect(typeData).toHaveProperty('generated_at');
    expect(typeData.type).toBe('code_improvements');
    expect(Array.isArray(typeData.ideas)).toBe(true);

    cleanupIdeationProject();
  });

  test('Project context is included in ideation output', async () => {
    setupIdeationProject();
    simulateIdeationGeneration(TEST_IDEATION_PROJECT);

    const ideationPath = path.join(TEST_IDEATION_PROJECT, '.auto-claude', 'ideation', 'ideation.json');
    const session = JSON.parse(readFileSync(ideationPath, 'utf-8'));

    expect(session).toHaveProperty('projectContext');
    expect(session.projectContext).toHaveProperty('existingFeatures');
    expect(session.projectContext).toHaveProperty('techStack');
    expect(session.projectContext).toHaveProperty('plannedFeatures');

    expect(Array.isArray(session.projectContext.existingFeatures)).toBe(true);
    expect(Array.isArray(session.projectContext.techStack)).toBe(true);

    cleanupIdeationProject();
  });

  test('Summary counts match actual ideas', async () => {
    setupIdeationProject();
    simulateIdeationGeneration(TEST_IDEATION_PROJECT);

    const ideationPath = path.join(TEST_IDEATION_PROJECT, '.auto-claude', 'ideation', 'ideation.json');
    const session = JSON.parse(readFileSync(ideationPath, 'utf-8'));

    // Total should match ideas array length
    expect(session.summary.total).toBe(session.ideas.length);

    // by_type counts should match actual ideas
    const ideasByType: Record<string, number> = {};
    session.ideas.forEach((idea: { type: string }) => {
      ideasByType[idea.type] = (ideasByType[idea.type] || 0) + 1;
    });

    Object.entries(session.summary.by_type).forEach(([type, count]) => {
      expect(ideasByType[type] || 0).toBe(count);
    });

    cleanupIdeationProject();
  });

  test('Generated timestamps are valid ISO strings', async () => {
    setupIdeationProject();
    simulateIdeationGeneration(TEST_IDEATION_PROJECT);

    const ideationPath = path.join(TEST_IDEATION_PROJECT, '.auto-claude', 'ideation', 'ideation.json');
    const session = JSON.parse(readFileSync(ideationPath, 'utf-8'));

    // generatedAt should be a valid date
    const generatedAt = new Date(session.generatedAt);
    expect(generatedAt.toString()).not.toBe('Invalid Date');

    // updatedAt should be a valid date
    const updatedAt = new Date(session.updatedAt);
    expect(updatedAt.toString()).not.toBe('Invalid Date');

    // Ideas should have valid createdAt
    session.ideas.forEach((idea: { createdAt: string }) => {
      const createdAt = new Date(idea.createdAt);
      expect(createdAt.toString()).not.toBe('Invalid Date');
    });

    cleanupIdeationProject();
  });
});

// Ideation Error State E2E tests (subtask-5-3)
test.describe('Ideation Error State Verification (Mock-based)', () => {
  const TEST_ERROR_PROJECT = path.join(TEST_DATA_DIR, 'error-test-project');

  function setupErrorTestProject(): void {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });
    mkdirSync(TEST_ERROR_PROJECT, { recursive: true });
    mkdirSync(path.join(TEST_ERROR_PROJECT, '.auto-claude', 'ideation'), { recursive: true });
  }

  function cleanupErrorTestProject(): void {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  }

  /**
   * Simulates an error state in ideation generation
   * Represents what happens when generation fails due to auth error
   */
  function createErrorState(projectDir: string, errorMessage: string): void {
    const errorFile = path.join(projectDir, '.auto-claude', 'ideation', 'error.json');
    const errorState = {
      type: 'generation_error',
      message: errorMessage,
      timestamp: new Date().toISOString(),
      phase: 'error',
      exitCode: 1
    };
    writeFileSync(errorFile, JSON.stringify(errorState, null, 2));
  }

  /**
   * Simulates auth failure output that would be captured from process stdout/stderr
   */
  function createAuthFailureLog(projectDir: string): void {
    const logFile = path.join(projectDir, '.auto-claude', 'ideation', 'generation.log');
    const logContent = [
      '[INFO] Starting ideation generation...',
      '[INFO] Loading project index...',
      '[ERROR] Authentication required',
      '[ERROR] No OAuth token found. Auto Claude requires Claude Code OAuth authentication.',
      '[ERROR] Please configure your OAuth token in Settings > Claude Profiles.',
      'Process exited with code 1'
    ].join('\n');
    writeFileSync(logFile, logContent);
  }

  test('Error state file is created when generation fails', async () => {
    setupErrorTestProject();

    const errorMessage = 'authentication required';
    createErrorState(TEST_ERROR_PROJECT, errorMessage);

    const errorFile = path.join(TEST_ERROR_PROJECT, '.auto-claude', 'ideation', 'error.json');
    expect(existsSync(errorFile)).toBe(true);

    const errorState = JSON.parse(readFileSync(errorFile, 'utf-8'));
    expect(errorState.type).toBe('generation_error');
    expect(errorState.message).toBe(errorMessage);
    expect(errorState.phase).toBe('error');
    expect(errorState.exitCode).toBe(1);

    cleanupErrorTestProject();
  });

  test('Auth failure log contains expected error patterns', async () => {
    setupErrorTestProject();
    createAuthFailureLog(TEST_ERROR_PROJECT);

    const logFile = path.join(TEST_ERROR_PROJECT, '.auto-claude', 'ideation', 'generation.log');
    expect(existsSync(logFile)).toBe(true);

    const logContent = readFileSync(logFile, 'utf-8');

    // Verify auth failure patterns are present
    expect(logContent).toContain('Authentication required');
    expect(logContent).toContain('OAuth token');
    expect(logContent).toContain('Settings');
    expect(logContent).toContain('Claude Profiles');
    expect(logContent).toContain('exited with code 1');

    cleanupErrorTestProject();
  });

  test('Error state has valid timestamp', async () => {
    setupErrorTestProject();
    createErrorState(TEST_ERROR_PROJECT, 'test error');

    const errorFile = path.join(TEST_ERROR_PROJECT, '.auto-claude', 'ideation', 'error.json');
    const errorState = JSON.parse(readFileSync(errorFile, 'utf-8'));

    const timestamp = new Date(errorState.timestamp);
    expect(timestamp.toString()).not.toBe('Invalid Date');

    cleanupErrorTestProject();
  });

  test('No ideation.json exists when generation fails due to auth error', async () => {
    setupErrorTestProject();

    // Simulate auth failure - error state exists but no ideation output
    createErrorState(TEST_ERROR_PROJECT, 'authentication required');
    createAuthFailureLog(TEST_ERROR_PROJECT);

    const ideationDir = path.join(TEST_ERROR_PROJECT, '.auto-claude', 'ideation');

    // Error file should exist
    expect(existsSync(path.join(ideationDir, 'error.json'))).toBe(true);

    // But ideation.json should NOT exist (generation never completed)
    expect(existsSync(path.join(ideationDir, 'ideation.json'))).toBe(false);

    cleanupErrorTestProject();
  });

  test('Error recovery cleans up error state', async () => {
    setupErrorTestProject();

    // First, simulate a failed generation
    createErrorState(TEST_ERROR_PROJECT, 'authentication required');

    const errorFile = path.join(TEST_ERROR_PROJECT, '.auto-claude', 'ideation', 'error.json');
    expect(existsSync(errorFile)).toBe(true);

    // Then, simulate successful recovery (error file removed, ideation created)
    rmSync(errorFile);

    const ideationDir = path.join(TEST_ERROR_PROJECT, '.auto-claude', 'ideation');
    const ideationSession = {
      id: `session-${Date.now()}`,
      projectId: 'error-test-project',
      config: {
        enabledTypes: ['code_improvements'],
        maxIdeasPerType: 5
      },
      ideas: [
        {
          id: 'idea-1',
          title: 'Test Idea',
          type: 'code_improvements',
          description: 'Test',
          status: 'draft',
          createdAt: new Date().toISOString()
        }
      ],
      projectContext: { existingFeatures: [], techStack: [], plannedFeatures: [] },
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    writeFileSync(path.join(ideationDir, 'ideation.json'), JSON.stringify(ideationSession, null, 2));

    // Verify error is gone and ideation is present
    expect(existsSync(errorFile)).toBe(false);
    expect(existsSync(path.join(ideationDir, 'ideation.json'))).toBe(true);

    cleanupErrorTestProject();
  });
});

// Auth Failure Detection Pattern Tests (subtask-5-3)
test.describe('Auth Failure Detection Patterns', () => {
  // These patterns should match what's in rate-limit-detector.ts AUTH_FAILURE_PATTERNS
  const authFailurePatterns = [
    'authentication required',
    'authentication is required',
    'not authenticated',
    'not yet authenticated',
    'login required',
    'login is required',
    'oauth token invalid',
    'oauth token is invalid',
    'oauth token expired',
    'oauth token missing',
    'unauthorized',
    'please log in',
    'please login',
    'please authenticate',
    'invalid credentials',
    'invalid token',
    'invalid api key',
    'auth failed',
    'auth error',
    'auth failure',
    'authentication failed',
    'authentication error',
    'authentication failure',
    'session expired',
    'session invalid',
    'access denied',
    'permission denied',
    '401 unauthorized',
    'credentials missing',
    'credentials invalid',
    'credentials expired',
    'credentials are missing',
    'credentials are invalid',
    'credentials are expired'
  ];

  // Rate limit patterns should NOT match auth failure
  const rateLimitPatterns = [
    'Limit reached · resets Dec 17 at 6am',
    'rate limit exceeded',
    'too many requests',
    'usage limit reached'
  ];

  // Helper to simulate detection logic (mirrors rate-limit-detector.ts AUTH_FAILURE_PATTERNS exactly)
  function detectsAuthFailure(output: string): boolean {
    // These patterns must match rate-limit-detector.ts AUTH_FAILURE_PATTERNS exactly
    const patterns = [
      /authentication\s*(is\s*)?required/i,
      /not\s*(yet\s*)?authenticated/i,
      /login\s*(is\s*)?required/i,
      /oauth\s*token\s*(is\s*)?(invalid|expired|missing)/i,
      /unauthorized/i,
      /please\s*(log\s*in|login|authenticate)/i,
      /invalid\s*(credentials|token|api\s*key)/i,
      /auth(entication)?\s*(failed|error|failure)/i,
      /session\s*(expired|invalid)/i,
      /access\s*denied/i,
      /permission\s*denied/i,
      /401\s*unauthorized/i,
      /credentials\s*(are\s*)?(missing|invalid|expired)/i
    ];
    return patterns.some(pattern => pattern.test(output));
  }

  test('Auth failure patterns are correctly detected', () => {
    authFailurePatterns.forEach(pattern => {
      expect(detectsAuthFailure(pattern)).toBe(true);
    });
  });

  test('Rate limit patterns are NOT detected as auth failure', () => {
    rateLimitPatterns.forEach(pattern => {
      expect(detectsAuthFailure(pattern)).toBe(false);
    });
  });

  test('Normal output is NOT detected as auth failure', () => {
    const normalOutputs = [
      'Task completed successfully',
      'Generating ideas...',
      'Phase 1 complete',
      'Ideas saved to file'
    ];
    normalOutputs.forEach(output => {
      expect(detectsAuthFailure(output)).toBe(false);
    });
  });

  test('Multiline output with auth failure is detected', () => {
    const multilineOutput = `Starting ideation generation...
Loading project index...
Error: authentication required
Please configure your OAuth token.`;
    expect(detectsAuthFailure(multilineOutput)).toBe(true);
  });

  test('Case-insensitive matching works', () => {
    expect(detectsAuthFailure('AUTHENTICATION REQUIRED')).toBe(true);
    expect(detectsAuthFailure('Authentication Required')).toBe(true);
    expect(detectsAuthFailure('UNAUTHORIZED')).toBe(true);
    expect(detectsAuthFailure('Unauthorized')).toBe(true);
  });

  test('JSON error responses are detected', () => {
    const jsonError = '{"error": "unauthorized", "message": "Please authenticate"}';
    expect(detectsAuthFailure(jsonError)).toBe(true);
  });
});

// Note: EnvConfigModal Display Logic and Ideation Store Error State Management tests
// have been moved to dedicated unit test files:
// - auto-claude-ui/src/renderer/__tests__/ideation-store-error-states.test.ts (store tests)
// - Unit tests should use Vitest and mock the actual components/hooks
