# Auto Claude UI - Frontend

A modern Electron + React desktop application for the Auto Claude autonomous coding framework.

## Prerequisites

### Node.js v24.12.0 LTS (Required)

This project requires **Node.js v24.12.0 LTS** (Latest LTS version as of December 2024).

**Download:** https://nodejs.org/en/download/

**Or install via command line:**

**Windows:**
```bash
winget install OpenJS.NodeJS.LTS
```

**macOS:**
```bash
brew install node@24
```

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

**Linux (Fedora):**
```bash
sudo dnf install nodejs npm
```

> **IMPORTANT:** When installing Node.js on Windows, make sure to check:
> - "Add to PATH"
> - "npm package manager"

**Verify installation:**
```bash
node --version  # Should output: v24.12.0
npm --version   # Should output: 11.x.x or higher
```

> **Note:** npm is included with Node.js. If `npm` is not found after installing Node.js, you need to reinstall Node.js properly.

## Quick Start

```bash
# Navigate to frontend directory
cd apps/frontend

# Install dependencies (includes native module rebuild)
npm install

# Start development server
npm run dev
```

## Services

### Convex (Optional - For Account/Authentication Features)

This application includes optional Convex integration for account management and authentication features.

**Note:** Convex is completely optional - the application works fully without it. You only need to set up Convex if you're developing or testing authentication features.

The **Account tab** in Settings is always visible, but authentication features will only work when Convex is properly configured.

#### Setting Up Convex for Local Development

To develop authentication features locally, you'll need to set up your own Convex deployment:

1. **Create a Convex account** (if you don't have one):
   - Go to https://www.convex.dev
   - Sign up for a free account

2. **Install dependencies**:
   ```bash
   cd services/convex
   npm install
   ```

3. **Generate Better Auth secret**:
   ```bash
   # Generate a secure random secret for Better Auth
   openssl rand -base64 32
   ```

4. **Set up environment variables**:

   Create a `.env.local` file in `services/convex/` with:
   ```bash
   # Convex Deployment (from 'npx convex dev')
   CONVEX_DEPLOYMENT=dev

   # Better Auth Secret (from the openssl command above)
   BETTER_AUTH_SECRET=your-generated-secret-here

   # Your local site URL
   SITE_URL=http://localhost:5173
   ```

5. **Start the Convex dev server** (keep this running):
   ```bash
   npx convex dev
   ```

   This will:
   - Connect to your Convex deployment
   - Generate a `.env.local` file with your Convex URLs
   - Start the development server
   - Keep running to sync your Convex functions

   After running this, your `.env.local` will be updated with:
   ```
   # For Convex client connection (WebSocket, real-time sync)
   CONVEX_URL=https://your-deployment-name.convex.cloud

   # For Better Auth actions (sign in, sign up, etc.)
   CONVEX_SITE_URL=https://your-deployment-name.convex.site
   ```

   **Note:** There are two URLs:
   - `CONVEX_URL` - Used by the Convex client for database operations and real-time sync
   - `CONVEX_SITE_URL` - Used by Better Auth for authentication actions (sign in, sign up)

6. **Start the application**:

   In a new terminal (keep `npx convex dev` running):
   ```bash
   cd ../../
   npm run dev
   ```

7. **Use the Account tab**:

   - Open the application
   - Go to Settings
   - Click on the **Account** tab
   - You can now sign in, sign up, and manage your profile

#### Troubleshooting

**Account tab shows but login doesn't work:**
- Make sure `npx convex dev` is running in the `services/convex` folder
- Check that `.env.local` contains `BETTER_AUTH_SECRET`
- Check the browser console for errors (look for CSP violations or 404 errors)

**CSP error connecting to Convex:**
- The CSP has been updated to allow Convex connections
- Try restarting the app after running `npx convex dev`

**404 error on auth endpoints:**
- Make sure `npx convex dev` is running
- The auth routes are served by the Convex dev server
- Check that the `.env.local` file has the correct `CONVEX_URL`

#### Important Notes

- **Always run `npx convex dev` before starting the app** if you want to use authentication features
- The Convex dev server must be running while the app is active
- Each developer needs their own Convex deployment (use your own account)
- Never commit `.env.local` to version control (it contains secrets)

#### Running Convex in Production

For production deployments, you'll need to:
1. Create a production Convex deployment
2. Set the `CONVEX_URL` environment variable before starting the app
3. Configure Better Auth with your production settings

For more information on Convex deployment, see: https://docs.convex.dev

## Security

This project maintains **0 vulnerabilities**. Run `npm audit` to verify.

```bash
npm audit
# Expected output: found 0 vulnerabilities
```

## Architecture

This project follows a **feature-based architecture** for better maintainability and scalability.

```
src/
├── main/                    # Electron main process
│   ├── agent/               # Agent management
│   ├── changelog/           # Changelog generation
│   ├── claude-profile/      # Claude profile management
│   ├── insights/            # Code analysis
│   ├── ipc-handlers/        # IPC communication handlers
│   ├── terminal/            # PTY and terminal management
│   └── updater/             # App update service
│
├── preload/                 # Electron preload scripts
│   └── api/                 # IPC API modules
│
├── renderer/                # React frontend
│   ├── features/            # Feature modules (self-contained)
│   │   ├── tasks/           # Task management, kanban, creation
│   │   ├── terminals/       # Terminal emulation
│   │   ├── projects/        # Project management, file explorer
│   │   ├── settings/        # App and project settings
│   │   ├── roadmap/         # Roadmap generation
│   │   ├── ideation/        # AI-powered brainstorming
│   │   ├── insights/        # Code analysis
│   │   ├── changelog/       # Release management
│   │   ├── github/          # GitHub integration
│   │   ├── agents/          # Claude profile management
│   │   ├── worktrees/       # Git worktree management
│   │   └── onboarding/      # First-time setup wizard
│   │
│   ├── shared/              # Shared resources
│   │   ├── components/      # Reusable UI components
│   │   ├── hooks/           # Shared React hooks
│   │   └── lib/             # Utilities and helpers
│   │
│   └── hooks/               # App-level hooks
│
└── shared/                  # Shared between main/renderer
    ├── types/               # TypeScript type definitions
    ├── constants/           # Application constants
    └── utils/               # Shared utilities
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm run package` | Build and package for current platform |
| `npm run package:win` | Package for Windows |
| `npm run package:mac` | Package for macOS |
| `npm run package:linux` | Package for Linux |
| `npm test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage |
| `npm run lint` | Check for lint errors |
| `npm run lint:fix` | Auto-fix lint errors |
| `npm run typecheck` | Type check TypeScript |
| `npm audit` | Check for security vulnerabilities |

## Development Guidelines

### Code Organization Principles

1. **Feature-based Architecture**: Group related code by feature, not by type
2. **Single Responsibility**: Each component/hook/store does one thing well
3. **DRY (Don't Repeat Yourself)**: Extract reusable logic into shared modules
4. **KISS (Keep It Simple)**: Prefer simple solutions over complex ones
5. **SOLID Principles**: Apply object-oriented design principles

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `TaskCard.tsx` |
| Hooks | camelCase with `use` prefix | `useTaskStore.ts` |
| Stores | kebab-case with `-store` suffix | `task-store.ts` |
| Types | PascalCase | `Task`, `TaskStatus` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_RETRIES` |

### TypeScript Guidelines

- **No implicit `any`**: Always type your variables and parameters
- **Use `type` for simple objects**: Prefer `type` over `interface`
- **Export types separately**: Use `export type` for type-only exports

### Security Guidelines

- **Never expose secrets**: API keys, tokens should stay in main process
- **Validate IPC data**: Always validate data coming through IPC
- **Use contextBridge**: Never expose Node.js APIs directly to renderer

## Troubleshooting

### npm not found

If `npm` command is not recognized after installing Node.js:

1. **Windows**: Reinstall Node.js from https://nodejs.org and ensure you check "Add to PATH"
2. **macOS/Linux**: Add to your shell profile:
   ```bash
   export PATH="/usr/local/bin:$PATH"
   ```
3. Restart your terminal

### Native module errors

If you get errors about native modules (node-pty, etc.):

```bash
npm run rebuild
```

### Windows build tools required

If electron-rebuild fails on Windows, install Visual Studio Build Tools:

1. Download from https://visualstudio.microsoft.com/visual-cpp-build-tools/
2. Select "Desktop development with C++" workload
3. Restart terminal and run `npm install` again

## Git Hooks

This project uses Husky for Git hooks that run automatically:

### Pre-commit Hook

Runs before each commit:
- **lint-staged**: Lints staged `.ts`/`.tsx` files
- **typecheck**: TypeScript type checking
- **lint**: ESLint checks
- **npm audit**: Security vulnerability check (high severity)

### Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/). Your commit messages must follow this format:

```
type(scope): description
```

**Valid types:**
| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes |
| `style` | Code style (formatting, semicolons, etc.) |
| `refactor` | Code refactoring (no feature/fix) |
| `perf` | Performance improvements |
| `test` | Adding or updating tests |
| `build` | Build system or dependencies |
| `ci` | CI/CD configuration |
| `chore` | Maintenance tasks |
| `revert` | Reverting a previous commit |

**Examples:**
```bash
git commit -m "feat(tasks): add drag and drop support"
git commit -m "fix(terminal): resolve scroll position issue"
git commit -m "docs: update README with setup instructions"
git commit -m "chore: update dependencies"
```

## Package Manager

This project uses **npm** (not pnpm or yarn). The lock files for other package managers are ignored.

## License

AGPL-3.0
