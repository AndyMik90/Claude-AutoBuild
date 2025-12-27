# Onboarding Wizard System

The wizard system uses a **schema-based auto-discovery pattern** that automatically detects and integrates new steps.

## Quick Start: Adding a New Wizard Step

### 1. Create the Step Component

```tsx
// MyNewStep.tsx
import { WizardStepProps } from './wizard-step.schema';

export function MyNewStep({ onNext, onBack, onSkip }: WizardStepProps) {
  return (
    <div>
      <h2>My New Step</h2>
      {/* Your content */}
      <button onClick={onBack}>Back</button>
      <button onClick={onNext}>Next</button>
    </div>
  );
}
```

### 2. Register the Step in the Registry

Open `wizard-registry.ts` and add:

```typescript
// 1. Add import at the top (lazy loading is used automatically)

// 2. Create step definition
const myNewStep = defineWizardStep({
  id: 'myNewStep',
  priority: 250,  // Between existing steps
  translationKey: 'steps.myNewStep',
  component: lazy(() => import('./MyNewStep').then(m => ({ default: m.MyNewStep }))),
  category: 'integration',
  showInProgress: true,
  icon: 'Settings',
  addedInVersion: '1.2.0'
});

// 3. Add to STEP_DEFINITIONS array
const STEP_DEFINITIONS: WizardStepDefinition[] = [
  welcomeStep,
  oauthStep,
  myNewStep,  // <-- Add here
  memoryStep,
  completionStep,
];
```

### 3. Add Translations

In all `locales/*/onboarding.json` files:

```json
{
  "steps": {
    "myNewStep": "My Step"
  },
  "myNewStep": {
    "title": "My New Step",
    "description": "Description of the step"
  }
}
```

**Done!** The wizard will automatically display the new step.

---

## Priority Schema

| Range | Priority | Description |
|-------|----------|-------------|
| Welcome | 0-99 | Welcome/intro screens |
| Auth | 100-199 | Authentication (OAuth, API keys) |
| Integration | 200-299 | External services (GitHub, Linear) |
| Memory | 300-399 | Memory/persistence |
| Agent | 400-499 | Agent configuration |
| Completion | 900-999 | Completion screens |

## Conditional Steps

Steps can be shown/hidden based on conditions:

```typescript
const conditionalStep = defineWizardStep({
  id: 'advancedMemory',
  priority: 320,
  translationKey: 'steps.advancedMemory',
  component: lazy(() => import('./AdvancedMemoryStep')),
  category: 'memory',
  showInProgress: true,
  // Only show when feature is enabled
  condition: (ctx) => ctx.features?.advancedMemory === true
});
```

## Available Condition Context

```typescript
interface StepConditionContext {
  settings: Record<string, unknown>;  // App settings
  isDev: boolean;                      // Development mode?
  platform: string;                    // 'Windows', 'macOS', 'Linux'
  features: Record<string, boolean>;   // Feature flags
}
```

## Step Categories

- `welcome` - Welcome screens
- `auth` - Authentication
- `integration` - External services
- `memory` - Memory configuration
- `agent` - Agent settings
- `completion` - Completion

## Debugging

```typescript
import { debugSteps } from './wizard-registry';

// Display all registered steps in the console
debugSteps();
```
