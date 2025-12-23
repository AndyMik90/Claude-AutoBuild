export interface WorktreeTemplate {
  id: string;
  label: string;
  command: string;
  detectFiles?: string[];
  alwaysShow?: boolean;
  priority?: number;
}

export const WORKTREE_TEMPLATES: WorktreeTemplate[] = [
  // Package Managers (JS/TS)
  {
    id: 'npm',
    label: 'npm ci',
    command: 'npm ci',
    detectFiles: ['package-lock.json'],
    priority: 100,
  },
  {
    id: 'pnpm',
    label: 'pnpm install',
    command: 'pnpm install --frozen-lockfile',
    detectFiles: ['pnpm-lock.yaml'],
    priority: 100,
  },
  {
    id: 'yarn',
    label: 'yarn',
    command: 'yarn --frozen-lockfile',
    detectFiles: ['yarn.lock'],
    priority: 100,
  },
  {
    id: 'bun',
    label: 'bun install',
    command: 'bun install --frozen-lockfile',
    detectFiles: ['bun.lockb'],
    priority: 100,
  },

  // Python
  {
    id: 'uv',
    label: 'uv sync',
    command: 'uv sync',
    detectFiles: ['uv.lock'],
    priority: 95,
  },
  {
    id: 'poetry',
    label: 'poetry install',
    command: 'poetry install',
    detectFiles: ['poetry.lock'],
    priority: 90,
  },
  {
    id: 'pip-requirements',
    label: 'pip install',
    command: 'pip install -r requirements.txt',
    detectFiles: ['requirements.txt'],
    priority: 85,
  },

  // Environment Files (smart: .env.local preferred over .env)
  {
    id: 'env-local',
    label: 'copy .env.local',
    command: 'cp $PROJECT_PATH/.env.local .env.local',
    detectFiles: ['.env.local'],
    priority: 80,
  },
  {
    id: 'env',
    label: 'copy .env',
    command: 'cp $PROJECT_PATH/.env .env',
    alwaysShow: true,
    priority: 79,
  },

  // Other ecosystems
  {
    id: 'composer',
    label: 'composer install',
    command: 'composer install --no-dev',
    detectFiles: ['composer.lock'],
    priority: 85,
  },
  {
    id: 'cargo',
    label: 'cargo build',
    command: 'cargo build',
    detectFiles: ['Cargo.lock'],
    priority: 85,
  },
  {
    id: 'go-mod',
    label: 'go mod download',
    command: 'go mod download',
    detectFiles: ['go.sum'],
    priority: 85,
  },
  {
    id: 'bundle',
    label: 'bundle install',
    command: 'bundle install',
    detectFiles: ['Gemfile.lock'],
    priority: 85,
  },
];

export function filterTemplatesByFiles(
  templates: WorktreeTemplate[],
  existingFiles: Set<string>
): WorktreeTemplate[] {
  return templates
    .filter(t => {
      if (t.alwaysShow) return true;
      if (!t.detectFiles || t.detectFiles.length === 0) return true;
      return t.detectFiles.every(f => existingFiles.has(f));
    })
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}
