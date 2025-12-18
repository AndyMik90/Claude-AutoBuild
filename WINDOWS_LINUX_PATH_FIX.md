# Windows/Linux Source Path Detection Fix

## Problem

On Windows and Linux, when initializing a project, users were getting a "Source path not configured" error even though the `auto-claude` source directory exists. This error did not occur on macOS.

## Root Cause

The `detectAutoBuildSourcePath()` function in two files was using path resolution logic that worked on macOS in development mode but failed on Windows/Linux, especially in production/packaged builds. The function was trying to auto-detect where the Auto Claude framework source code (`auto-claude/` directory) is located, but the paths resolved differently across platforms.

## Changes Made

### 1. Enhanced Path Detection Logic

Updated `detectAutoBuildSourcePath()` in two files:
- `auto-claude-ui/src/main/ipc-handlers/settings-handlers.ts`
- `auto-claude-ui/src/main/ipc-handlers/project-handlers.ts`

**Key improvements:**

1. **Platform-aware path detection**: Separates development vs production mode using `is.dev` from `@electron-toolkit/utils`

2. **More comprehensive path checking**:
   - **Development mode**: Checks multiple relative paths from `__dirname`, `process.cwd()`, and parent directories
   - **Production mode**: Checks paths relative to `app.getAppPath()`, `process.resourcesPath`, and multiple levels up

3. **Debug logging**: Added detailed logging that can be enabled with `AUTO_CLAUDE_DEBUG=1` environment variable

4. **Better error messages**: Console warnings now guide users to enable debug mode if auto-detection fails

## Testing on Windows/Linux

### 1. Run with Debug Logging

Set the environment variable to see detailed path checking:

**Windows (PowerShell):**
```powershell
$env:AUTO_CLAUDE_DEBUG="1"
.\Auto-Claude.exe
```

**Windows (Command Prompt):**
```cmd
set AUTO_CLAUDE_DEBUG=1
Auto-Claude.exe
```

**Linux:**
```bash
AUTO_CLAUDE_DEBUG=1 ./Auto-Claude
```

### 2. Check Console Output

The debug output will show:
- Current platform (win32/linux/darwin)
- Whether running in dev or production mode
- All paths being checked
- Which paths exist and which don't
- Whether auto-detection succeeded

Example debug output:
```
[detectAutoBuildSourcePath] Platform: win32
[detectAutoBuildSourcePath] Is dev: false
[detectAutoBuildSourcePath] __dirname: C:\Program Files\Auto-Claude\resources\app.asar\out\main
[detectAutoBuildSourcePath] app.getAppPath(): C:\Program Files\Auto-Claude\resources\app.asar
[detectAutoBuildSourcePath] process.cwd(): C:\Program Files\Auto-Claude
[detectAutoBuildSourcePath] Checking paths: [...]
[detectAutoBuildSourcePath] Checking C:\Program Files\auto-claude: ✗ not found
[detectAutoBuildSourcePath] Checking C:\auto-claude: ✓ FOUND
[detectAutoBuildSourcePath] Auto-detected source path: C:\auto-claude
```

### 3. Manual Configuration (Fallback)

If auto-detection still fails, users can manually configure the path:

1. Open **App Settings** in Auto Claude UI
2. Go to the **General** tab
3. Set **Auto Claude Source Path** to the location of your `auto-claude` directory
4. Click **Save**

Example paths:
- Windows: `C:\Users\YourName\Projects\autonomous-coding\auto-claude`
- Linux: `/home/yourname/projects/autonomous-coding/auto-claude`

## What Gets Checked

The function now checks these paths in order:

### Development Mode (`is.dev = true`):
1. `__dirname/../../../auto-claude` - From out/main up 3 levels
2. `__dirname/../../auto-claude` - From out/main up 2 levels
3. `process.cwd()/auto-claude` - From current working directory
4. `process.cwd()/../auto-claude` - From parent of cwd

### Production Mode (`is.dev = false`):
1. `app.getAppPath()/../auto-claude` - Sibling to app
2. `app.getAppPath()/../../auto-claude` - Up 2 from app
3. `app.getAppPath()/../../../auto-claude` - Up 3 from app
4. `process.resourcesPath/../auto-claude` - Relative to resources
5. `process.resourcesPath/../../auto-claude` - Up 2 from resources

### All Modes:
- `process.cwd()/auto-claude` - Last resort fallback

## Verification

For each path, the function checks:
1. Does the directory exist?
2. Does `VERSION` file exist inside it?

Both must be true for a path to be considered valid.

## Build Verification

The changes have been compiled and tested:
```
✓ Built successfully with no errors
✓ All TypeScript files compiled
✓ Electron app bundle created
```

## Next Steps

1. **Test on Windows**: Have Windows users test the updated build with `AUTO_CLAUDE_DEBUG=1`
2. **Test on Linux**: Have Linux users test the updated build with `AUTO_CLAUDE_DEBUG=1`
3. **Collect feedback**: If issues persist, the debug output will help identify the correct path patterns
4. **Update documentation**: Add troubleshooting section to main README if needed

## Related Files

- `auto-claude-ui/src/main/ipc-handlers/settings-handlers.ts`
- `auto-claude-ui/src/main/ipc-handlers/project-handlers.ts`
- `auto-claude-ui/src/main/project-initializer.ts`
- `auto-claude-ui/src/renderer/App.tsx` (shows the error dialog)
- `auto-claude-ui/src/renderer/components/Sidebar.tsx` (shows the error dialog)
