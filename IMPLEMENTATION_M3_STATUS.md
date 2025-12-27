# Unity Tool Screen M3 Implementation Status

## Completed ✅

### 1. Unity Bridge C# Script Template
- **File**: `apps/frontend/src/main/unity-bridge-template.cs`
- **Features**:
  - Safe executeMethod entry points for Unity project settings modification
  - Support for Unity 2023.1+ API changes (NamedBuildTarget)
  - Methods implemented:
    - `NoopValidate()` - Validates Unity project loads correctly
    - `AddDefineSymbol()` - Add scripting define symbol to build target group
    - `RemoveDefineSymbol()` - Remove scripting define symbol from build target group
    - `SetScriptingBackend()` - Switch between Mono and IL2CPP
    - `SwitchBuildTarget()` - Switch active build target
  - Robust error handling with "[Jungle-Assistant Bridge]" log prefix for easy parsing
  - Cross-platform support (Windows, macOS, Linux)

### 2. Unity Doctor Diagnostics System
- **File**: `apps/frontend/src/main/utils/unity-doctor.ts`
- **Features**:
  - Comprehensive project health checks:
    - **Project Checks**: Unity version detection, Unity Bridge installation status
    - **Editor Checks**: Editor version detection, version mismatch warnings (critical/moderate/minor), Android module presence
    - **Toolchain Checks**: Android SDK, NDK, JDK, Gradle detection (embedded vs environment)
    - **Packages Checks**: manifest.json parsing, packages-lock.json presence, XR package detection
    - **Git Checks**: Repository status, current branch, working directory clean/dirty state
  - Severity levels: success, warning, error, info
  - Actionable checks with fix action hints
  - Text summary export for diagnostics

### 3. Backup/Diff System for Safe Tweaks
- **File**: `apps/frontend/src/main/utils/unity-tweaks.ts`
- **Features**:
  - Pre/post backup system for modified files
  - Git diff integration (falls back to manual diff if git unavailable)
  - Unified diff generation using `diff` library
  - File change detection and tracking
  - Unity Bridge installation with idempotency
  - Package manager utilities (read packages from manifest.json)
  - Command building for all tweak actions
  - Human-readable descriptions for each tweak

### 4. TypeScript Interfaces & API Updates
- **Files Updated**:
  - `apps/frontend/src/shared/constants/ipc.ts` - Added IPC channels for Doctor, Bridge, Tweaks, UPM
  - `apps/frontend/src/preload/api/unity-api.ts` - Added interfaces and API methods:
    - `UnityDoctorCheck`, `UnityDoctorReport`
    - `UnityTweakParams`, `UnityPackageInfo`
    - Updated `UnityRun` to support new action types (tweak, upm-resolve, bridge-install)
    - Added artifact paths for backups and diffs
    - Added `tweakSummary` field to track tweak results

### 5. IPC Handlers Implementation
- **File**: `apps/frontend/src/main/ipc-handlers/unity-handlers.ts`
- **Handlers Added**:
  - `UNITY_DOCTOR_RUN_CHECKS` - Run diagnostics checks
  - `UNITY_DOCTOR_GET_DIAGNOSTICS_TEXT` - Get text summary
  - `UNITY_BRIDGE_CHECK_INSTALLED` - Check if Unity Bridge is installed
  - `UNITY_BRIDGE_INSTALL` - Install Unity Bridge with run record
  - `UNITY_TWEAK_ADD_DEFINE` - Add scripting define symbol
  - `UNITY_TWEAK_REMOVE_DEFINE` - Remove scripting define symbol
  - `UNITY_TWEAK_SET_BACKEND` - Set scripting backend
  - `UNITY_TWEAK_SWITCH_BUILD_TARGET` - Switch build target
  - `UNITY_UPM_LIST_PACKAGES` - List Unity packages from manifest.json
  - `UNITY_UPM_RESOLVE` - Resolve Unity Package Manager dependencies

### 6. Tweak Execution Function
- **Function**: `runUnityTweak()` in `unity-handlers.ts`
- **Features**:
  - Pre-backup creation before Unity execution
  - Unity process spawning with stdout/stderr capture
  - Post-backup and diff generation after completion
  - Error digest building
  - Run record creation with full artifact tracking
  - Cancellation support
  - Integration with existing process management infrastructure

## Partially Completed ⚙️

### Unity.tsx State Variables and Interfaces
- ✅ Updated UnityRun interface to support new action types (tweak, upm-resolve, bridge-install)
- ✅ Added tweakSummary and backup/diff artifact paths to UnityRun
- ✅ Added all necessary imports (icons, types)
- ✅ Added M3 state variables:
  - Unity Doctor: `doctorReport`, `isDoctorRunning`, `bridgeInstalled`, `expandedChecks`
  - Project Tweaks: `tweakTargetGroup`, `defineSymbol`, `scriptingBackend`, `tweakBuildTarget`
  - UPM: `packages`, `isLoadingPackages`

## Remaining Work 🚧

### 1. Unity.tsx UI Updates (PRIMARY TASK)

#### A. Unity Doctor Panel
**Location**: Insert after line 980 (after empty state), before line 982 (Profile Selector Card)

**Components Needed** (state variables already added ✅):

// Fetch function
const runDoctorChecks = async () => {
  setIsDoctorRunning(true);
  const result = await window.electronAPI.runUnityDoctorChecks(
    currentProject.id,
    selectedEditor
  );
  if (result.success) {
    setDoctorReport(result.data);
  }
  setIsDoctorRunning(false);
};

// UI Structure
<Card>
  <CardHeader>
    <CardTitle>Unity Doctor</CardTitle>
    <Button onClick={runDoctorChecks}>Run Diagnostics</Button>
  </CardHeader>
  <CardContent>
    {/* Render checks by category */}
    {doctorReport && (
      <>
        {/* Project section */}
        {/* Editor section */}
        {/* Toolchain section */}
        {/* Packages section */}
        {/* Git section */}
      </>
    )}
  </CardContent>
</Card>
```

**Check Row Format**:
- Icon based on status (✅ success, ⚠️ warning, ❌ error, ℹ️ info)
- Check name and message
- Details (collapsed by default, expandable)
- "Fix" button for actionable checks

#### B. Project Tweaks Panel
**Location**: After Unity Doctor panel

**Components Needed**:
```tsx
// State variables
const [tweakTargetGroup, setTweakTargetGroup] = useState('Standalone');
const [defineSymbol, setDefineSymbol] = useState('');
const [scriptingBackend, setScriptingBackend] = useState('Mono');
const [buildTarget, setBuildTarget] = useState('StandaloneWindows64');

// UI Structure
<Card>
  <CardHeader>
    <CardTitle>Project Tweaks</CardTitle>
    <CardDescription>
      Safe project settings modification with backups and diffs
    </CardDescription>
  </CardHeader>
  <CardContent>
    {/* Warning if bridge not installed */}
    {!bridgeInstalled && (
      <Alert>
        <AlertTitle>Unity Bridge Required</AlertTitle>
        <Button onClick={handleInstallBridge}>Install Bridge</Button>
      </Alert>
    )}

    {/* Define Symbols section */}
    <div>
      <Label>Target Group</Label>
      <Select value={tweakTargetGroup} onChange={...}>
        <option>Standalone</option>
        <option>Android</option>
        <option>iOS</option>
        <option>WebGL</option>
      </Select>

      <Label>Define Symbol</Label>
      <Input value={defineSymbol} onChange={...} />

      <Button onClick={handleAddDefine}>Add</Button>
      <Button onClick={handleRemoveDefine}>Remove</Button>
    </div>

    {/* Scripting Backend section */}
    <div>
      <Label>Scripting Backend</Label>
      <Select value={scriptingBackend} onChange={...}>
        <option>Mono</option>
        <option>IL2CPP</option>
      </Select>
      <Button onClick={handleSetBackend}>Apply</Button>
    </div>

    {/* Build Target section */}
    <div>
      <Label>Build Target</Label>
      <Select value={buildTarget} onChange={...}>
        <option>StandaloneWindows64</option>
        <option>StandaloneOSX</option>
        <option>StandaloneLinux64</option>
        <option>Android</option>
        <option>iOS</option>
        <option>WebGL</option>
      </Select>
      <Button onClick={handleSwitchBuildTarget}>Switch</Button>
    </div>
  </CardContent>
</Card>
```

#### C. UPM (Unity Package Manager) Panel
**Location**: After Project Tweaks panel

**Components Needed**:
```tsx
// State variables
const [packages, setPackages] = useState<UnityPackageInfo[]>([]);
const [isLoadingPackages, setIsLoadingPackages] = useState(false);

// UI Structure
<Card>
  <CardHeader>
    <CardTitle>Unity Package Manager</CardTitle>
    <div>
      <Button onClick={handleListPackages}>Refresh</Button>
      <Button onClick={handleUpmResolve}>UPM Resolve</Button>
    </div>
  </CardHeader>
  <CardContent>
    {packages.map(pkg => (
      <div key={pkg.name}>
        <span>{pkg.name}</span>
        <Badge>{pkg.version}</Badge>
      </div>
    ))}
  </CardContent>
</Card>
```

#### D. Run History Updates
**Modifications Needed**:
- Update `UnityRun` interface to match backend (add new action types)
- Add rendering for 'tweak', 'upm-resolve', 'bridge-install' actions
- Display `tweakSummary` information in run details
- Show backup and diff artifact links
- Add "View Diff" button that opens diff file

### 2. Testing Tasks

#### Manual Testing Checklist
- [ ] Unity Doctor runs and displays all check categories
- [ ] Version mismatch detection works (critical/moderate/minor)
- [ ] Android toolchain detection (embedded vs environment)
- [ ] Bridge installation creates run record and file
- [ ] Add/Remove define symbols with backup/diff
- [ ] Scripting backend switch with backup/diff
- [ ] Build target switch with backup/diff
- [ ] UPM List shows packages from manifest.json
- [ ] UPM Resolve runs and handles errors
- [ ] Diff generation works (both git and manual)
- [ ] Pre/post backups are created correctly
- [ ] Changed files are tracked accurately
- [ ] Run history shows tweak runs with summaries

## Architecture Notes

### Data Flow
1. **Unity Doctor**:
   ```
   UI Click → IPC (UNITY_DOCTOR_RUN_CHECKS) → unity-doctor.ts
   → File system checks → Return report → UI renders checks
   ```

2. **Unity Bridge Install**:
   ```
   UI Click → IPC (UNITY_BRIDGE_INSTALL) → unity-tweaks.ts
   → Copy template → Create run record → UI refreshes
   ```

3. **Tweak Actions**:
   ```
   UI Click → IPC (UNITY_TWEAK_*) → runUnityTweak()
   → Pre-backup → Spawn Unity process → Post-backup → Diff
   → Save run record → UI shows in history
   ```

### Safety Features
- All tweaks create pre/post backups in run directory
- Git diff preferred, manual diff as fallback
- Changed files tracked explicitly
- Unity Bridge uses official Unity APIs (no manual YAML editing)
- Cancellation support for all Unity operations
- Clear error messages with Unity log integration

### File Artifacts Structure
```
.auto-claude/unity-runs/YYYYMMDD-HHMMSS_tweak/
├── run.json (with tweakSummary)
├── unity-editor.log
├── stdout.txt
├── stderr.txt
├── error-digest.txt
├── pre/
│   └── ProjectSettings/
│       └── ProjectSettings.asset
├── post/
│   └── ProjectSettings/
│       └── ProjectSettings.asset
└── git-diff.txt (or diff.txt)
```

## Next Steps

1. **UI Implementation** (apps/frontend/src/renderer/components/Unity.tsx):
   - Add Doctor panel with check rendering
   - Add Tweaks panel with forms
   - Add UPM panel
   - Update run history rendering
   - Add necessary state management
   - Wire up all API calls

2. **Testing**:
   - Create test Unity project
   - Test all Doctor checks
   - Test all tweak actions
   - Verify backups and diffs
   - Test error handling

3. **Polish**:
   - Add loading states
   - Add success/error toasts
   - Add confirmation dialogs for destructive actions
   - Add tooltips for complex fields
   - Improve error messages

## Files Modified/Created

### Created
- `apps/frontend/src/main/unity-bridge-template.cs`
- `apps/frontend/src/main/utils/unity-doctor.ts`
- `apps/frontend/src/main/utils/unity-tweaks.ts`

### Modified
- `apps/frontend/src/shared/constants/ipc.ts`
- `apps/frontend/src/preload/api/unity-api.ts`
- `apps/frontend/src/main/ipc-handlers/unity-handlers.ts`

### To Modify
- `apps/frontend/src/renderer/components/Unity.tsx` (UI implementation)
