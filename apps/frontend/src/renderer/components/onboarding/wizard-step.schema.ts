/**
 * Wizard Step Schema System
 *
 * This schema-based system enables automatic wizard updates when new features are added.
 * Each wizard step self-registers with its metadata, making the wizard fully dynamic.
 *
 * HOW TO ADD A NEW WIZARD STEP:
 * 1. Create your step component (e.g., MyNewStep.tsx)
 * 2. Export the step definition alongside the component:
 *    export const myNewStepDefinition: WizardStepDefinition = {
 *      id: 'myNewStep',
 *      priority: 250, // Between existing steps
 *      translationKey: 'steps.myNewStep',
 *      component: lazy(() => import('./MyNewStep')),
 *      category: 'integration',
 *      showInProgress: true
 *    };
 * 3. Register it in wizard-registry.ts (auto-collected on build)
 *
 * The wizard automatically includes any registered step - no manual updates needed!
 */

import type { ComponentType, LazyExoticComponent } from 'react';

/**
 * Categories for wizard steps - helps with organization and filtering
 */
export type WizardStepCategory =
  | 'welcome'       // Welcome/intro screens
  | 'auth'          // Authentication (OAuth, API keys)
  | 'integration'   // External service integrations (GitHub, Linear)
  | 'memory'        // Memory/persistence configuration
  | 'agent'         // Agent/model configuration
  | 'completion';   // Final completion steps

/**
 * Props that every wizard step component receives
 */
export interface WizardStepProps {
  /** Navigate to the next step */
  onNext: () => void;
  /** Navigate to the previous step */
  onBack: () => void;
  /** Skip the entire wizard */
  onSkip?: () => void;
  /** Finish the wizard (for final step) */
  onFinish?: () => void;
  /** Open task creator (for completion step) */
  onOpenTaskCreator?: () => void;
  /** Open settings (for completion step) */
  onOpenSettings?: () => void;
  /** Whether this is the first step */
  isFirstStep?: boolean;
  /** Whether this is the last step */
  isLastStep?: boolean;
}

/**
 * Condition function to determine if a step should be shown
 * Can check settings, feature flags, environment, etc.
 */
export type StepCondition = (context: StepConditionContext) => boolean;

/**
 * Context provided to step condition functions
 */
export interface StepConditionContext {
  /** Current app settings */
  settings: Record<string, unknown>;
  /** Whether running in development mode */
  isDev: boolean;
  /** Platform (windows, mac, linux) */
  platform: string;
  /** Feature flags */
  features: Record<string, boolean>;
}

/**
 * Complete definition of a wizard step
 * This is the core schema that enables auto-discovery
 */
export interface WizardStepDefinition {
  /** Unique identifier for this step */
  id: string;

  /**
   * Priority determines step order (lower = earlier)
   * Recommended ranges:
   * - 0-99: Welcome/intro steps
   * - 100-199: Authentication steps
   * - 200-299: Integration steps
   * - 300-399: Memory/persistence steps
   * - 400-499: Agent configuration steps
   * - 900-999: Completion steps
   */
  priority: number;

  /** Translation key for the step label (e.g., 'steps.welcome') */
  translationKey: string;

  /** The React component to render for this step */
  component: ComponentType<WizardStepProps> | LazyExoticComponent<ComponentType<WizardStepProps>>;

  /** Category for grouping/filtering */
  category: WizardStepCategory;

  /** Whether to show this step in the progress indicator */
  showInProgress: boolean;

  /** Optional condition to determine if step should be included */
  condition?: StepCondition;

  /** Optional icon name (from lucide-react) */
  icon?: string;

  /**
   * Whether this step can be skipped
   * @default true
   */
  skippable?: boolean;

  /**
   * Version when this step was added (for changelog/tracking)
   * Format: semver (e.g., '1.2.0')
   */
  addedInVersion?: string;

  /**
   * Optional description shown in step details
   * Translation key, not raw text
   */
  descriptionKey?: string;
}

/**
 * Runtime representation of a wizard step (with resolved data)
 */
export interface WizardStepRuntime {
  id: string;
  label: string;
  description?: string;
  completed: boolean;
  current: boolean;
  skippable: boolean;
  showInProgress: boolean;
}

/**
 * Wizard configuration that can be extended
 */
export interface WizardConfig {
  /** All registered step definitions */
  steps: WizardStepDefinition[];

  /** Default condition context values */
  defaultContext: Partial<StepConditionContext>;

  /** Whether to persist step completion state */
  persistProgress: boolean;

  /** Key for localStorage/settings persistence */
  persistenceKey: string;
}

/**
 * Default priorities for built-in steps
 * Use these as reference when adding new steps
 */
export const STEP_PRIORITIES = {
  WELCOME: 0,
  OAUTH: 100,
  GITHUB: 150,
  LINEAR: 160,
  MEMORY: 300,
  GRAPHITI: 310,
  AGENT_CONFIG: 400,
  FIRST_SPEC: 450,
  COMPLETION: 999
} as const;

/**
 * Helper to create a step definition with type safety
 */
export function defineWizardStep(definition: WizardStepDefinition): WizardStepDefinition {
  // Apply defaults only if not already set in definition
  return {
    ...definition,
    skippable: definition.skippable ?? true,
    showInProgress: definition.showInProgress ?? true
  };
}

/**
 * Helper to create a conditional step
 */
export function conditionalStep(
  definition: Omit<WizardStepDefinition, 'condition'>,
  condition: StepCondition
): WizardStepDefinition {
  return defineWizardStep({
    ...definition,
    condition
  });
}
