# Debug Panels Documentation

This document describes the functionality of the debug panels in Auto Claude's desktop application.

## Overview

The Debug page provides four diagnostic tools for testing and debugging the application:

1. **IPC Tester** - Test IPC communication between processes
2. **Backend Runner** - Preview command execution (future feature)
3. **Log Viewer** - View application logs with filtering
4. **Configuration Inspector** - View environment and configuration

## IPC Tester

### Status: ✅ Fully Functional

Test IPC communication between main and renderer processes.

**Features:**
- Select from predefined IPC channels
- Send JSON parameters
- View real-time responses
- Error handling and visualization

**Usage:**
1. Select an IPC channel from the dropdown
2. Enter JSON parameters (e.g., `{"projectId": "123"}`)
3. Click "Send IPC Request"
4. View the response in the output panel

**Available Channels:**
- `github:pr:list` - List GitHub pull requests
- `github:pr:create` - Create a GitHub pull request
- `github:issue:list` - List GitHub issues
- `github:issue:create` - Create a GitHub issue
- `github:worktree:list` - List git worktrees
- `github:worktree:create` - Create a git worktree
- `settings:get` - Get application settings
- `settings:update` - Update application settings
- `project:get-env` - Get project environment variables

## Backend Runner

### Status: 🚧 Under Development

Preview how commands will be executed when the runner system is implemented.

**Planned Features:**
- Execute project-specific commands (gh, git, npm, etc.)
- Sandboxed environment with security controls
- Real-time output capture and streaming
- Exit code and error handling
- Command history and replay

**Current State:**
The backend runner system is not yet implemented. The panel currently shows a preview of how commands will be formatted and executed once the backend IPC handlers are ready.

**Workaround:**
Use the Terminal feature in the left sidebar for actual command execution. It provides similar functionality with a full interactive terminal experience.

## Log Viewer

### Status: ✅ Fully Functional

View and filter application logs in real-time.

**Features:**
- **Log Sources:**
  - All Logs - Shows all log entries (info, warn, error, debug)
  - Errors Only - Shows only errors and warnings
  
- **Log Level Filtering:**
  - ERROR - Critical errors
  - WARN - Warnings
  - INFO - Informational messages
  - DEBUG - Debug messages (beta versions only)

- **Auto-refresh:** Logs refresh every 5 seconds automatically
- **Auto-scroll:** Automatically scroll to newest logs
- **Clear:** Clear the log display
- **Manual Refresh:** Force refresh logs on demand

**Log Format:**
```
[YYYY-MM-DD HH:mm:ss.ms] [LEVEL] message
```

**Usage:**
1. Select log source (All Logs or Errors Only)
2. Filter by log level using checkboxes
3. Toggle auto-scroll as needed
4. View logs in real-time

## Configuration Inspector

### Status: ✅ Fully Functional

View environment variables and application configuration.

**Features:**
- **Application Settings:**
  - Auto Build Path
  - Theme
  - Language
  
- **Project Configuration:**
  - Project ID, Name, Path
  - Auto Build Path
  - Creation timestamp
  
- **Environment Variables:**
  - All environment variables from .env file
  - Real-time updates

**Usage:**
1. Select a project from the main project selector
2. Click "Refresh" to reload configuration
3. View settings in organized sections

## Troubleshooting

### IPC Tester shows errors
- Ensure the selected IPC channel is valid
- Check that parameters are valid JSON
- Verify required parameters are provided

### Log Viewer shows no logs
- Check that logs exist in the log directory
- Try switching between "All Logs" and "Errors Only"
- Click refresh to reload logs

### Configuration Inspector shows "No project selected"
- Select a project from the main project selector
- Ensure the project has been initialized

### Backend Runner shows "Not Implemented"
- This is expected - the feature is under development
- Use the Terminal feature in the sidebar instead

## Technical Details

### IPC Implementation
- Uses `window.electronAPI.testInvokeChannel(channel, params)`
- Direct pass-through to any IPC handler
- No simulation - real IPC calls

### Log Streaming
- Backend logs: `window.electronAPI.getRecentLogs(maxLines)`
- Error logs: `window.electronAPI.getRecentErrors(maxCount)`
- Parsed from electron-log format
- Auto-refresh every 5 seconds

### Configuration Loading
- Settings: From Zustand settings store
- Project config: From Zustand project store
- Environment: From `window.electronAPI.getProjectEnv(projectId)`

## Future Enhancements

### Log Viewer
- [ ] Export logs to file
- [ ] Search/filter by text
- [ ] Log level statistics
- [ ] Timestamp range filtering

### Backend Runner
- [ ] Implement backend IPC handlers
- [ ] Add command history
- [ ] Add command templates
- [ ] Save/load command presets

### IPC Tester
- [ ] Save/load test scenarios
- [ ] Request/response history
- [ ] Performance metrics
- [ ] Bulk testing

## Related Files

- `apps/frontend/src/renderer/components/debug/IPCTester.tsx`
- `apps/frontend/src/renderer/components/debug/LogViewer.tsx`
- `apps/frontend/src/renderer/components/debug/RunnerTester.tsx`
- `apps/frontend/src/renderer/components/debug/ConfigInspector.tsx`
- `apps/frontend/src/main/ipc-handlers/debug-handlers.ts`
- `apps/frontend/src/preload/api/modules/debug-api.ts`
