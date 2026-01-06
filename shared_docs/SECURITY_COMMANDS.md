# Security Commands Configuration

Auto Claude uses a dynamic security system that controls which shell commands the AI agent can execute. This prevents potentially dangerous operations while allowing legitimate development commands.

## How It Works

```text
┌─────────────────────────────────────────────────────────────┐
│                    Command Validation                        │
├─────────────────────────────────────────────────────────────┤
│  1. Base Commands (always allowed)                          │
│     └── ls, cat, grep, git, echo, etc.                      │
│                                                              │
│  2. Auto-Detected Stack Commands                            │
│     └── Analyzer detects Cargo.toml → adds cargo, rustc     │
│     └── Analyzer detects package.json → adds npm, node      │
│                                                              │
│  3. Custom Commands (your additions)                        │
│     └── "custom_commands" array in security profile         │
└─────────────────────────────────────────────────────────────┘
```

## Automatic Detection

When you start a task, Auto Claude analyzes your project and automatically allows commands based on detected technologies:

| Detected File | Commands Added |
|---------------|----------------|
| `Cargo.toml` | `cargo`, `rustc`, `rustup`, `rustfmt`, `cargo-clippy`, etc. |
| `package.json` | `npm`, `node`, `npx` |
| `yarn.lock` | `yarn` |
| `pnpm-lock.yaml` | `pnpm` |
| `pyproject.toml` | `python`, `pip`, `poetry`, `uv` |
| `go.mod` | `go` |
| `*.csproj` / `*.sln` | `dotnet` |
| `pubspec.yaml` | `dart`, `flutter`, `pub` |
| `Dockerfile` | `docker` |
| `docker-compose.yml` | `docker-compose` |
| `Makefile` | `make` |

The full detection logic is in `apps/backend/project/stack_detector.py`.

## Security Profile

All security configuration is stored in a single file: `.auto-claude-security.json`

```json
{
  "version": 2,
  "base_commands": ["ls", "cat", "grep", "git", "..."],
  "stack_commands": ["cargo", "rustc", "rustup"],
  "custom_commands": ["bazel", "terraform", "ansible"],
  "detected_stack": {
    "languages": ["rust"],
    "package_managers": ["cargo"],
    "frameworks": [],
    "databases": []
  },
  "project_hash": "abc123...",
  "created_at": "2024-01-15T10:30:00"
}
```

## Adding Custom Commands

To allow commands that aren't auto-detected, add them to the `custom_commands` array:

```json
{
  "version": 2,
  "base_commands": ["..."],
  "stack_commands": ["..."],
  "custom_commands": [
    "bazel",
    "buck",
    "ansible",
    "terraform",
    "./scripts/deploy.sh"
  ],
  "detected_stack": { "..." }
}
```

### When to Add Custom Commands

Add to `custom_commands` when:

- Your project uses uncommon build tools (Bazel, Buck, Pants, etc.)
- You have custom scripts that need to be executable
- Auto-detection doesn't recognize your stack
- You're using bleeding-edge tools not yet in the detection system

### Important Notes

- Use the base command name only (e.g., `cargo`, not `cargo build`)
- The `custom_commands` array is preserved when the profile is regenerated
- Other fields (`base_commands`, `stack_commands`, `detected_stack`) are auto-generated

## Troubleshooting

### "Command X is not allowed"

1. **Check if it should be auto-detected:**
   - Does your project have the expected config file? (e.g., `Cargo.toml` for Rust)
   - Run in project root, not a subdirectory

2. **Add to custom_commands:**

   Edit `.auto-claude-security.json` and add the command to the `custom_commands` array.

3. **Force re-analysis** (if detection seems wrong):
   - Delete `.auto-claude-security.json`
   - Restart the task

### Changes Not Taking Effect

The security profile cache updates automatically when `.auto-claude-security.json` is modified (mtime changes).

No restart required - changes apply on the next command.

### Worktree Mode

When using isolated worktrees, the security profile is automatically copied from your main project on each worktree setup.

**Important:** Unlike environment files (which are only copied if missing), security files **always overwrite** existing files in the worktree. This ensures the worktree uses the same security rules as the main project, preventing security bypasses through stale configurations.

This means:
- Changes to the security profile in the main project are reflected in new worktrees
- You cannot have different security rules per worktree (by design)
- If you need to test with different commands, modify the main project's profile

## Migration from v1

If you were using a separate `.auto-claude-allowlist` file (v1 format), follow these steps:

### Step 1: Check for existing allowlist

```bash
# Check if you have an allowlist file
cat .auto-claude-allowlist
```

If the file doesn't exist, no migration is needed.

### Step 2: Copy commands to JSON profile

Open `.auto-claude-security.json` and add your commands to the `custom_commands` array:

**Before (`.auto-claude-allowlist`):**

```text
bazel
terraform
./scripts/deploy.sh
```

**After (`.auto-claude-security.json`):**

```json
{
  "version": 2,
  "custom_commands": ["bazel", "terraform", "./scripts/deploy.sh"],
  ...
}
```

### Step 3: Delete the old allowlist

```bash
rm .auto-claude-allowlist
```

### Step 4: Verify

Run a command that was previously in your allowlist to confirm it still works.

## Security Considerations

The security system exists to prevent:
- Accidental `rm -rf /` or similar destructive commands
- Execution of unknown binaries
- Network operations with unrestricted tools

Only add commands you trust and understand.

## Adding Support for New Technologies

If you're using a technology that should be auto-detected, consider contributing:

1. Add detection logic to `apps/backend/project/stack_detector.py`
2. Add commands to `apps/backend/project/command_registry/languages.py`
3. Submit a PR!

See existing detectors for examples.
