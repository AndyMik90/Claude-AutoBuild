# QA Fix Request

**Status**: REJECTED
**Date**: 2025-12-15T17:47:00Z
**QA Session**: 1

## Critical Issues to Fix

### 1. Missing `onRerunWizard` prop in App.tsx

**Problem**: The `AppSettingsDialog` component accepts an `onRerunWizard` callback prop, but this prop is not passed when rendering `AppSettingsDialog` in `App.tsx`. This causes the "Re-run Wizard" button to never appear in Settings.

**Location**: `src/renderer/App.tsx` lines 355-365

**Required Fix**:

Add the `onRerunWizard` prop to the `AppSettingsDialog` component:

```tsx
<AppSettingsDialog
  open={isSettingsDialogOpen}
  onOpenChange={(open) => {
    setIsSettingsDialogOpen(open);
    if (!open) {
      setSettingsInitialSection(undefined);
    }
  }}
  initialSection={settingsInitialSection}
  onRerunWizard={() => {
    // Reset onboarding state to trigger wizard
    useSettingsStore.getState().updateSettings({ onboardingCompleted: false });
    setIsSettingsDialogOpen(false);
    setIsOnboardingWizardOpen(true);
  }}
/>
```

**Alternative** (if you want to avoid directly calling store methods in JSX):

1. Create a handler function:
```tsx
const handleRerunWizard = useCallback(async () => {
  // Reset onboarding state
  await updateSettings({ onboardingCompleted: false });
  // Close settings dialog
  setIsSettingsDialogOpen(false);
  // Open onboarding wizard
  setIsOnboardingWizardOpen(true);
}, [updateSettings]);
```

2. Extract `updateSettings` from the store:
```tsx
const { updateSettings } = useSettingsStore();
```

3. Pass to the component:
```tsx
<AppSettingsDialog
  ...
  onRerunWizard={handleRerunWizard}
/>
```

**Verification**: After implementing this fix:
1. Build the app without TypeScript errors
2. Launch the app
3. Open Settings (gear icon)
4. Verify "Re-run Wizard" button appears in the Application section (below Notifications)
5. Click the button
6. Verify Settings dialog closes
7. Verify Onboarding Wizard opens from step 1 (Welcome)
8. Complete or skip the wizard
9. Verify `onboardingCompleted` is set back to `true` when finished

## After Fixes

Once fixes are complete:
1. Commit with message: `fix: Add onRerunWizard prop to AppSettingsDialog (qa-requested)`
2. QA will automatically re-run
3. Loop continues until approved
