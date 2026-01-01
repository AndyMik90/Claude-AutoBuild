---
name: Autofill DevTools errors on startup
about: Console shows Autofill.enable errors during Electron startup
title: '[Bug] Autofill DevTools protocol errors on every startup'
labels: bug, electron, low-priority, cosmetic
assignees: ''
---

## Severity
**LOW** - Cosmetic issue, does not affect functionality

## Problem Description

The Electron app shows DevTools protocol errors on every startup:

```
ERROR:CONSOLE(1)] "Request Autofill.enable failed. {"code":-32601,"message":"'Autofill.enable' wasn't found"}", source: devtools://devtools/bundled/core/protocol_client/protocol_client.js (1)
```

**Impact:**
- ❌ Console pollution with error messages
- ✅ App functions normally despite errors
- ✅ No performance impact
- ✅ No user-facing issues

## Root Cause

Chrome DevTools bundled with Electron attempts to enable the `Autofill` protocol domain, which may not be available in all Electron versions or when running in certain modes.

**Why it happens:**
1. Electron uses Chromium DevTools frontend
2. DevTools frontend tries to enable all available protocol domains on connection
3. Autofill domain is not implemented/available in this Electron context
4. Protocol client reports -32601 (method not found) error

This is a known issue in Electron apps and doesn't indicate a real problem with Auto-Claude.

## Recommended Solutions

### Option 1: Suppress Console Errors (Easiest)
Filter out Autofill-related console errors in the main process:

```typescript
// apps/frontend/src/main/index.ts
import { app } from 'electron';

// Suppress known DevTools protocol errors
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const message = args.join(' ');
  
  // Ignore Autofill.enable errors
  if (message.includes('Autofill.enable') || 
      message.includes("wasn't found")) {
    return;
  }
  
  originalConsoleError.apply(console, args);
};
```

**Pros:**
- Quick fix (5 minutes)
- No impact on functionality
- Reduces console noise

**Cons:**
- Doesn't address root cause
- May hide legitimate errors if filter is too broad

### Option 2: Update Electron Version (If Available)
Check if newer Electron version includes Autofill protocol:

```bash
# apps/frontend/package.json
# Current: electron: "^XX.X.X"
# Try: electron: "^latest"
```

**Pros:**
- May resolve issue at the source
- Gets latest Electron features/fixes

**Cons:**
- Requires testing entire app
- May introduce breaking changes
- No guarantee newer version fixes this

### Option 3: Disable DevTools Autofill Extension
Configure Electron to disable the Autofill DevTools extension:

```typescript
// apps/frontend/src/main/index.ts
app.on('ready', () => {
  // Disable problematic DevTools extensions
  if (process.env.NODE_ENV === 'development') {
    const { session } = require('electron');
    session.defaultSession.removeExtension('Autofill');
  }
});
```

**Pros:**
- Targeted fix for Autofill specifically
- Preserves other DevTools functionality

**Cons:**
- May not work if Autofill isn't loaded as extension
- Requires research into Electron extension API

### Option 4: Ignore (Recommended for Now)
Since this is purely cosmetic and doesn't affect functionality:

- Document in known issues
- Revisit when Electron is upgraded for other reasons
- Focus on higher-priority items

## Testing Criteria

If implementing a fix:

1. **Error Suppression:**
   - [ ] Start app in development mode
   - [ ] Check console - no Autofill errors
   - [ ] Verify other console errors still appear

2. **Functionality Check:**
   - [ ] DevTools still opens and works
   - [ ] All DevTools panels functional (Console, Network, etc.)
   - [ ] No new errors introduced

3. **Production Build:**
   - [ ] Build production version
   - [ ] Verify fix persists in production
   - [ ] Check app startup logs

## Related Issues

- Related to Electron DevTools integration
- May appear alongside other protocol errors (see startup logs)

## Effort Estimate

- **Option 1 (Suppress):** 15-30 minutes
- **Option 2 (Update Electron):** 2-4 hours (testing required)
- **Option 3 (Disable Extension):** 1-2 hours (research + implementation)
- **Option 4 (Ignore):** 0 hours

## References

- Electron DevTools Protocol: https://www.electronjs.org/docs/latest/api/web-contents#contentsdevtoolswebcontents-readonly
- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
- Similar issues: Search "Electron Autofill.enable wasn't found"
