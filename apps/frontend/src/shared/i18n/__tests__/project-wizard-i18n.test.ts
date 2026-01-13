/**
 * @vitest-environment jsdom
 */
/**
 * ProjectWizard i18n namespace verification tests
 *
 * Tests to verify that the project-wizard translation namespace is properly
 * registered and all required translation keys are present.
 */

import { describe, it, expect } from 'vitest';
import i18n, { resources } from '../index';

// Required translation keys for project-wizard namespace
const REQUIRED_TRANSLATION_KEYS = [
  // Wizard
  'wizard.title',
  'wizard.description',
  'wizard.helpText',
  'wizard.cancel',

  // Steps
  'steps.project',
  'steps.git',
  'steps.autoclaude',
  'steps.github',
  'steps.gitlab',
  'steps.complete',

  // Project
  'project.title',
  'project.description',
  'project.openExisting',
  'project.openExistingDescription',
  'project.createNew',
  'project.createNewDescription',
  'project.back',
  'project.continue',
  'project.openExistingAriaLabel',
  'project.createNewAriaLabel',

  // ProjectNew
  'projectNew.title',
  'projectNew.description',
  'projectNew.projectName',
  'projectNew.projectNamePlaceholder',
  'projectNew.projectNameHelp',
  'projectNew.location',
  'projectNew.locationPlaceholder',
  'projectNew.willCreate',
  'projectNew.browse',
  'projectNew.initGit',
  'projectNew.optionalLabel',
  'projectNew.creating',
  'projectNew.createProject',
  'projectNew.nameRequired',
  'projectNew.locationRequired',
  'projectNew.failedToCreate',

  // Git
  'git.title',
  'git.description',
  'git.optionalLabel',
  'git.notGitRepo',
  'git.noCommits',
  'git.needsInit',
  'git.needsCommit',
  'git.willSetup',
  'git.initRepo',
  'git.createCommit',
  'git.manual',
  'git.manualInstructions',
  'git.skip',
  'git.initialize',
  'git.settingUp',
  'git.initializingRepo',
  'git.success',
  'git.readyToUse',

  // AutoClaude
  'autoclaude.title',
  'autoclaude.description',
  'autoclaude.willDo',
  'autoclaude.createFolder',
  'autoclaude.copyFramework',
  'autoclaude.setupSpecs',
  'autoclaude.sourcePathNotConfigured',
  'autoclaude.sourcePathNotConfiguredDescription',
  'autoclaude.skip',
  'autoclaude.initialize',
  'autoclaude.initializing',
  'autoclaude.success',
  'autoclaude.readyToUse',

  // GitHub
  'github.title',
  'github.description',
  'github.optionalLabel',
  'github.progressAuthenticate',
  'github.progressConfigure',
  'github.connectTitle',
  'github.selectProject',
  'github.selectBranch',
  'github.branchDescription',
  'github.skip',
  'github.continue',
  'github.repoDescription',
  'github.createNewRepo',
  'github.linkExistingRepo',
  'github.ready',

  // GitLab
  'gitlab.title',
  'gitlab.description',
  'gitlab.optionalLabel',
  'gitlab.connectTitle',
  'gitlab.selectProject',
  'gitlab.selectBranch',
  'gitlab.branchDescription',
  'gitlab.skip',
  'gitlab.continue',
  'gitlab.repoDescription',
  'gitlab.createNewProject',
  'gitlab.linkExistingProject',
  'gitlab.ready',

  // Complete
  'complete.title',
  'complete.description',
  'complete.message',
  'complete.startBuilding',
  'complete.viewSettings',
  'complete.close'
];

// Helper function to get nested object value by key path
function getNestedValue(obj: any, keyPath: string): any {
  return keyPath.split('.').reduce((current, key) => {
    return current?.[key];
  }, obj);
}

describe('ProjectWizard i18n Namespace Tests', () => {
  describe('Namespace Registration', () => {
    it('should have project-wizard namespace registered for English', () => {
      expect(resources.en).toBeDefined();
      expect(resources.en['project-wizard']).toBeDefined();
    });

    it('should have project-wizard namespace registered for French', () => {
      expect(resources.fr).toBeDefined();
      expect(resources.fr['project-wizard']).toBeDefined();
    });

    it('should include project-wizard in the namespaces list', () => {
      // The i18n instance should be configured with project-wizard namespace
      expect(i18n).toBeDefined();
      expect(i18n.options.ns).toContain('project-wizard');
    });
  });

  describe('English Translation Keys', () => {
    const enTranslations = resources.en['project-wizard'] as Record<string, any>;

    it('should have all required translation keys in English', () => {
      const missingKeys: string[] = [];

      for (const key of REQUIRED_TRANSLATION_KEYS) {
        const value = getNestedValue(enTranslations, key);
        if (value === undefined) {
          missingKeys.push(key);
        }
      }

      expect(missingKeys).toEqual([]);
    });

    it('should have non-empty string values for all keys in English', () => {
      const emptyKeys: string[] = [];

      for (const key of REQUIRED_TRANSLATION_KEYS) {
        const value = getNestedValue(enTranslations, key);
        if (typeof value !== 'string' || value.trim() === '') {
          emptyKeys.push(key);
        }
      }

      expect(emptyKeys).toEqual([]);
    });

    it('should translate wizard.title correctly', () => {
      expect(enTranslations.wizard.title).toBe('Add Project');
    });

    it('should translate wizard.description correctly', () => {
      expect(enTranslations.wizard.description).toBe('Choose how you\'d like to add a project');
    });

    it('should translate project.createNew correctly', () => {
      expect(enTranslations.project.createNew).toBe('Create New Project');
    });
  });

  describe('French Translation Keys', () => {
    const frTranslations = resources.fr['project-wizard'] as Record<string, any>;

    it('should have all required translation keys in French', () => {
      const missingKeys: string[] = [];

      for (const key of REQUIRED_TRANSLATION_KEYS) {
        const value = getNestedValue(frTranslations, key);
        if (value === undefined) {
          missingKeys.push(key);
        }
      }

      expect(missingKeys).toEqual([]);
    });

    it('should have non-empty string values for all keys in French', () => {
      const emptyKeys: string[] = [];

      for (const key of REQUIRED_TRANSLATION_KEYS) {
        const value = getNestedValue(frTranslations, key);
        if (typeof value !== 'string' || value.trim() === '') {
          emptyKeys.push(key);
        }
      }

      expect(emptyKeys).toEqual([]);
    });

    it('should translate wizard.title correctly in French', () => {
      expect(frTranslations.wizard.title).toBe('Ajouter un projet');
    });

    it('should translate project.createNew correctly in French', () => {
      expect(frTranslations.project.createNew).toBe('Créer un nouveau projet');
    });
  });

  describe('Translation Key Structure', () => {
    const enTranslations = resources.en['project-wizard'] as Record<string, any>;
    const frTranslations = resources.fr['project-wizard'] as Record<string, any>;

    it('should have matching structure in English and French', () => {
      const enKeys = new Set<string>();
      const frKeys = new Set<string>();

      function collectKeys(obj: any, prefix = '') {
        for (const key in obj) {
          const fullKey = prefix ? `${prefix}.${key}` : key;
          enKeys.add(fullKey);
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            collectKeys(obj[key], fullKey);
          }
        }
      }

      function collectKeysFr(obj: any, prefix = '') {
        for (const key in obj) {
          const fullKey = prefix ? `${prefix}.${key}` : key;
          frKeys.add(fullKey);
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            collectKeysFr(obj[key], fullKey);
          }
        }
      }

      collectKeys(enTranslations);
      collectKeysFr(frTranslations);

      const enOnly = [...enKeys].filter(k => !frKeys.has(k));
      const frOnly = [...frKeys].filter(k => !enKeys.has(k));

      expect(enOnly).toEqual([]);
      expect(frOnly).toEqual([]);
    });

    it('should have all top-level sections', () => {
      const expectedSections = ['wizard', 'steps', 'project', 'projectNew', 'git', 'autoclaude', 'github', 'gitlab', 'complete'];

      for (const section of expectedSections) {
        expect(enTranslations[section]).toBeDefined();
        expect(frTranslations[section]).toBeDefined();
      }
    });
  });

  describe('i18n Instance Configuration', () => {
    it('should have project-wizard in available namespaces', () => {
      const ns = i18n.options.ns as string[];
      expect(ns).toContain('project-wizard');
    });

    it('should be able to get a translation using the project-wizard namespace', () => {
      const title = i18n.t('project-wizard:wizard.title');
      expect(title).toBe('Add Project');
    });

    it('should fallback to English if translation is missing', () => {
      // Test with a non-existent key
      const missing = i18n.t('project-wizard:nonexistent.key', { defaultValue: 'default' });
      expect(missing).toBe('default');
    });
  });
});
