/**
 * Mock for react-i18next
 *
 * Provides translation functionality for tests.
 * This mock supports both namespace-based and direct key-based translations.
 */

// English translations (complete for all namespaces)
const enTranslations = {
  // Common namespace
  common: {
    'actions.close': 'Close',
    'actions.cancel': 'Cancel',
    'actions.back': 'Back',
    'actions.continue': 'Continue',
    'actions.skip': 'Skip',
    'actions.save': 'Save',
    'actions.delete': 'Delete'
  },
  // Project-wizard namespace
  'project-wizard': {
    'wizard.title': 'Add Project',
    'wizard.description': 'Choose how you\'d like to add a project',
    'wizard.helpText': 'Follow the steps to configure your project',
    'wizard.cancel': 'Cancel',
    'steps.project': 'Project',
    'steps.git': 'Git',
    'steps.autoclaude': 'Auto Claude',
    'steps.github': 'GitHub',
    'steps.gitlab': 'GitLab',
    'steps.complete': 'Complete',
    'project.title': 'Add Project',
    'project.description': 'Choose how you\'d like to add a project',
    'project.openExisting': 'Open Existing Folder',
    'project.openExistingDescription': 'Browse to an existing project on your computer',
    'project.createNew': 'Create New Project',
    'project.createNewDescription': 'Start fresh with a new project folder',
    'project.back': 'Back',
    'project.continue': 'Continue',
    'project.openExistingAriaLabel': 'Open existing project folder',
    'project.createNewAriaLabel': 'Create new project folder',
    'projectNew.title': 'Create New Project',
    'projectNew.description': 'Set up a new project folder',
    'projectNew.projectName': 'Project Name',
    'projectNew.projectNamePlaceholder': 'my-awesome-project',
    'projectNew.projectNameHelp': 'This will be the folder name. Use lowercase with hyphens.',
    'projectNew.location': 'Location',
    'projectNew.locationPlaceholder': 'Select a folder...',
    'projectNew.willCreate': 'Will create:',
    'projectNew.browse': 'Browse',
    'projectNew.initGit': 'Initialize git repository',
    'projectNew.optionalLabel': 'Optional - You can initialize git later',
    'projectNew.creating': 'Creating...',
    'projectNew.createProject': 'Create Project',
    'projectNew.nameRequired': 'Please enter a project name',
    'projectNew.locationRequired': 'Please select a location',
    'projectNew.failedToCreate': 'Failed to create project',
    'git.title': 'Initialize Git Repository',
    'git.description': 'Git is recommended for safe feature development with isolated workspaces',
    'git.optionalLabel': 'Optional - Skip if you\'ll add Git later',
    'git.notGitRepo': 'This folder is not a git repository',
    'git.noCommits': 'Git repository has no commits',
    'git.needsInit': 'Git needs to be initialized for Auto Claude to manage your code safely.',
    'git.needsCommit': 'At least one commit is required for Auto Claude to create worktrees.',
    'git.willSetup': 'We\'ll set up git for you:',
    'git.initRepo': 'Initialize a new git repository',
    'git.createCommit': 'Create an initial commit with your current files',
    'git.manual': 'Prefer to do it manually?',
    'git.manualInstructions': 'Open a terminal in your project folder and run:',
    'git.skip': 'Skip for now',
    'git.initialize': 'Initialize Git',
    'git.settingUp': 'Setting up Git',
    'git.initializingRepo': 'Initializing git repository and creating initial commit...',
    'git.success': 'Git Initialized',
    'git.readyToUse': 'Your project is now ready to use with Auto Claude!',
    'autoclaude.title': 'Initialize Auto Claude',
    'autoclaude.description': 'Set up the Auto Claude framework in your project',
    'autoclaude.willDo': 'This will:',
    'autoclaude.createFolder': 'Create a .auto-claude folder in your project',
    'autoclaude.copyFramework': 'Copy the Auto Claude framework files',
    'autoclaude.setupSpecs': 'Set up the specs directory for your tasks',
    'autoclaude.sourcePathNotConfigured': 'Source path not configured',
    'autoclaude.sourcePathNotConfiguredDescription': 'Please set the Auto Claude source path in App Settings before initializing.',
    'autoclaude.skip': 'Skip for now',
    'autoclaude.initialize': 'Initialize Auto Claude',
    'autoclaude.initializing': 'Initializing...',
    'autoclaude.success': 'Auto Claude Initialized',
    'autoclaude.readyToUse': 'Auto Claude is now set up in your project!',
    'github.title': 'Connect to GitHub',
    'github.description': 'Auto Claude can integrate with GitHub for branch management',
    'github.optionalLabel': 'Optional - Skip if not using GitHub',
    'github.progressAuthenticate': 'Authenticate',
    'github.progressConfigure': 'Configure',
    'github.connectTitle': 'Authenticate with GitHub',
    'github.selectProject': 'Select GitHub Repository',
    'github.selectBranch': 'Select Base Branch',
    'github.branchDescription': 'Choose which branch Auto Claude should use as the base for creating task branches.',
    'github.skip': 'Skip for now',
    'github.continue': 'Continue',
    'github.repoDescription': 'Auto Claude will use this repository for managing task branches.',
    'github.createNewRepo': 'Create new repository',
    'github.linkExistingRepo': 'Link existing repository',
    'github.ready': 'GitHub configured successfully!',
    'gitlab.title': 'Connect to GitLab',
    'gitlab.description': 'Auto Claude can integrate with GitLab for merge request management',
    'gitlab.optionalLabel': 'Optional - Skip if not using GitLab',
    'gitlab.connectTitle': 'Authenticate with GitLab',
    'gitlab.selectProject': 'Select GitLab Project',
    'gitlab.selectBranch': 'Select Base Branch',
    'gitlab.branchDescription': 'Choose which branch Auto Claude should use as the base for creating task branches.',
    'gitlab.skip': 'Skip for now',
    'gitlab.continue': 'Continue',
    'gitlab.repoDescription': 'Auto Claude will use this project for managing merge requests.',
    'gitlab.createNewProject': 'Create new project',
    'gitlab.linkExistingProject': 'Link existing project',
    'gitlab.ready': 'GitLab configured successfully!',
    'complete.title': 'Project Ready!',
    'complete.description': 'Your project has been set up successfully',
    'complete.message': 'You\'re all set to start using Auto Claude',
    'complete.startBuilding': 'Start Building',
    'complete.viewSettings': 'View Settings',
    'complete.close': 'Close'
  },
  // Onboarding namespace (from existing tests)
  onboarding: {
    'welcome.title': 'Welcome to Auto Claude',
    'welcome.subtitle': 'AI-powered autonomous coding assistant',
    'welcome.getStarted': 'Get Started',
    'welcome.skip': 'Skip Setup',
    'wizard.helpText': 'Let us help you get started with Auto Claude',
    'authChoice.title': 'Choose Your Authentication Method',
    'authChoice.subtitle': 'Select how you want to authenticate',
    'authChoice.oauthTitle': 'Sign in with Anthropic',
    'authChoice.oauthDesc': 'OAuth authentication',
    'authChoice.apiKeyTitle': 'Use Custom API Key',
    'authChoice.apiKeyDesc': 'Enter your own API key',
    'authChoice.skip': 'Skip for now'
  }
};

// Helper function to get nested value from dot notation key
function getNestedValue(obj: any, key: string): string {
  const parts = key.split('.');
  let current = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return key; // Return key if not found
    }
  }
  return typeof current === 'string' ? current : key;
}

/**
 * Helper function to apply interpolation to translation strings
 * Replaces {{param}} patterns with values from options object
 */
function applyInterpolation(text: string, options?: any): string {
  if (options && typeof text === 'string') {
    return text.replace(/\{\{(\w+)\}\}/g, (_match, param) => options[param] || '');
  }
  return text;
}

export const useTranslation = (namespaces?: string | string[]) => {
  return {
    t: (key: string, options?: any) => {
      // Handle namespace prefix in key (e.g., 'project-wizard:wizard.title')
      if (key.includes(':')) {
        const [ns, nsKey] = key.split(':');
        if (ns in enTranslations) {
          const result = getNestedValue((enTranslations as any)[ns], nsKey);
          return applyInterpolation(result, options);
        }
      }

      // Handle namespace-based translation
      if (namespaces) {
        const nsArray = Array.isArray(namespaces) ? namespaces : [namespaces];
        for (const ns of nsArray) {
          if (ns in enTranslations) {
            const result = getNestedValue((enTranslations as any)[ns], key);
            if (result !== key) {
              // Handle interpolation if options provided
              if (options && typeof result === 'string') {
                return result.replace(/\{\{(\w+)\}\}/g, (_match, param) => options[param] || '');
              }
              return result;
            }
          }
        }
      }

      // Fallback to looking in all namespaces
      for (const ns of Object.keys(enTranslations)) {
        const result = getNestedValue((enTranslations as any)[ns], key);
        if (result !== key) {
          return applyInterpolation(result, options);
        }
      }

      // Return key if not found
      return applyInterpolation(key, options);
    },
    i18n: {
      language: 'en',
      changeLanguage: async () => 'en'
    }
  };
};

export const Trans = ({ children }: { children: React.ReactNode }) => children;

export default {
  useTranslation,
  Trans
};
