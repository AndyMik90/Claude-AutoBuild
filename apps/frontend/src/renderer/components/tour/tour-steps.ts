/**
 * Tour Steps Configuration
 *
 * Defines the steps for the interactive feature tour.
 * Each step highlights a UI element and explains its purpose.
 */

import type { TourStep } from './TourOverlay';

/**
 * Main application tour steps
 * Introduces users to core Auto-Claude features
 */
export const MAIN_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    titleKey: 'steps.welcome.title',
    descriptionKey: 'steps.welcome.description',
    position: 'center'
  },
  {
    id: 'sidebar',
    target: '[data-tour="sidebar"]',
    titleKey: 'steps.sidebar.title',
    descriptionKey: 'steps.sidebar.description',
    position: 'right'
  },
  {
    id: 'kanban',
    target: '[data-tour="kanban-board"]',
    titleKey: 'steps.kanban.title',
    descriptionKey: 'steps.kanban.description',
    position: 'bottom'
  },
  {
    id: 'create-task',
    target: '[data-tour="create-task-button"]',
    titleKey: 'steps.createTask.title',
    descriptionKey: 'steps.createTask.description',
    position: 'bottom'
  },
  {
    id: 'task-flow',
    titleKey: 'steps.taskFlow.title',
    descriptionKey: 'steps.taskFlow.description',
    position: 'center'
  },
  {
    id: 'terminals',
    target: '[data-tour="terminals"]',
    titleKey: 'steps.terminals.title',
    descriptionKey: 'steps.terminals.description',
    position: 'left'
  },
  {
    id: 'settings',
    target: '[data-tour="settings-button"]',
    titleKey: 'steps.settings.title',
    descriptionKey: 'steps.settings.description',
    position: 'bottom'
  },
  {
    id: 'ready',
    titleKey: 'steps.ready.title',
    descriptionKey: 'steps.ready.description',
    position: 'center'
  }
];

/**
 * Quick tour for returning users (shorter version)
 */
export const QUICK_TOUR_STEPS: TourStep[] = [
  {
    id: 'whats-new',
    titleKey: 'quick.whatsNew.title',
    descriptionKey: 'quick.whatsNew.description',
    position: 'center'
  },
  {
    id: 'create-task',
    target: '[data-tour="create-task-button"]',
    titleKey: 'steps.createTask.title',
    descriptionKey: 'steps.createTask.description',
    position: 'bottom'
  }
];

/**
 * Feature-specific tours (can be triggered from help menu)
 */
export const FEATURE_TOURS = {
  tasks: [
    {
      id: 'task-intro',
      titleKey: 'features.tasks.intro.title',
      descriptionKey: 'features.tasks.intro.description',
      position: 'center' as const
    },
    {
      id: 'task-status',
      titleKey: 'features.tasks.status.title',
      descriptionKey: 'features.tasks.status.description',
      position: 'center' as const
    }
  ],

  ideation: [
    {
      id: 'ideation-intro',
      target: '[data-tour="ideation"]',
      titleKey: 'features.ideation.intro.title',
      descriptionKey: 'features.ideation.intro.description',
      position: 'right' as const
    }
  ],

  roadmap: [
    {
      id: 'roadmap-intro',
      target: '[data-tour="roadmap"]',
      titleKey: 'features.roadmap.intro.title',
      descriptionKey: 'features.roadmap.intro.description',
      position: 'right' as const
    }
  ]
};
