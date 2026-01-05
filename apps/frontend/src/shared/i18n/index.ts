import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import English translation resources
import enCommon from './locales/en/common.json';
import enNavigation from './locales/en/navigation.json';
import enSettings from './locales/en/settings.json';
import enTasks from './locales/en/tasks.json';
import enWelcome from './locales/en/welcome.json';
import enOnboarding from './locales/en/onboarding.json';
import enDialogs from './locales/en/dialogs.json';
import enGitlab from './locales/en/gitlab.json';
import enTaskReview from './locales/en/taskReview.json';
import enTerminal from './locales/en/terminal.json';
import enInsights from './locales/en/insights.json';
import enChangelog from './locales/en/changelog.json';
import enRateLimit from './locales/en/rateLimit.json';
import enCompetitorAnalysis from './locales/en/competitorAnalysis.json';
import enAppUpdate from './locales/en/appUpdate.json';
import enWorktrees from './locales/en/worktrees.json';
import enIdeation from './locales/en/ideation.json';
import enProjectIndex from './locales/en/projectIndex.json';
import enModels from './locales/en/models.json';

// Import French translation resources
import frCommon from './locales/fr/common.json';
import frNavigation from './locales/fr/navigation.json';
import frSettings from './locales/fr/settings.json';
import frTasks from './locales/fr/tasks.json';
import frWelcome from './locales/fr/welcome.json';
import frOnboarding from './locales/fr/onboarding.json';
import frDialogs from './locales/fr/dialogs.json';
import frGitlab from './locales/fr/gitlab.json';
import frTaskReview from './locales/fr/taskReview.json';
import frTerminal from './locales/fr/terminal.json';
import frInsights from './locales/fr/insights.json';
import frChangelog from './locales/fr/changelog.json';
import frRateLimit from './locales/fr/rateLimit.json';
import frCompetitorAnalysis from './locales/fr/competitorAnalysis.json';
import frAppUpdate from './locales/fr/appUpdate.json';
import frWorktrees from './locales/fr/worktrees.json';
import frIdeation from './locales/fr/ideation.json';
import frProjectIndex from './locales/fr/projectIndex.json';
import frModels from './locales/fr/models.json';

// Import Korean translation resources
import koCommon from './locales/ko/common.json';
import koNavigation from './locales/ko/navigation.json';
import koSettings from './locales/ko/settings.json';
import koTasks from './locales/ko/tasks.json';
import koWelcome from './locales/ko/welcome.json';
import koOnboarding from './locales/ko/onboarding.json';
import koDialogs from './locales/ko/dialogs.json';
import koGitlab from './locales/ko/gitlab.json';
import koTaskReview from './locales/ko/taskReview.json';
import koTerminal from './locales/ko/terminal.json';
import koInsights from './locales/ko/insights.json';
import koChangelog from './locales/ko/changelog.json';
import koRateLimit from './locales/ko/rateLimit.json';
import koCompetitorAnalysis from './locales/ko/competitorAnalysis.json';
import koAppUpdate from './locales/ko/appUpdate.json';
import koWorktrees from './locales/ko/worktrees.json';
import koIdeation from './locales/ko/ideation.json';
import koProjectIndex from './locales/ko/projectIndex.json';
import koModels from './locales/ko/models.json';

export const defaultNS = 'common';

export const resources = {
  en: {
    common: enCommon,
    navigation: enNavigation,
    settings: enSettings,
    tasks: enTasks,
    welcome: enWelcome,
    onboarding: enOnboarding,
    dialogs: enDialogs,
    gitlab: enGitlab,
    taskReview: enTaskReview,
    terminal: enTerminal,
    insights: enInsights,
    changelog: enChangelog,
    rateLimit: enRateLimit,
    competitorAnalysis: enCompetitorAnalysis,
    appUpdate: enAppUpdate,
    worktrees: enWorktrees,
    ideation: enIdeation,
    projectIndex: enProjectIndex,
    models: enModels
  },
  fr: {
    common: frCommon,
    navigation: frNavigation,
    settings: frSettings,
    tasks: frTasks,
    welcome: frWelcome,
    onboarding: frOnboarding,
    dialogs: frDialogs,
    gitlab: frGitlab,
    taskReview: frTaskReview,
    terminal: frTerminal,
    insights: frInsights,
    changelog: frChangelog,
    rateLimit: frRateLimit,
    competitorAnalysis: frCompetitorAnalysis,
    appUpdate: frAppUpdate,
    worktrees: frWorktrees,
    ideation: frIdeation,
    projectIndex: frProjectIndex,
    models: frModels
  },
  ko: {
    common: koCommon,
    navigation: koNavigation,
    settings: koSettings,
    tasks: koTasks,
    welcome: koWelcome,
    onboarding: koOnboarding,
    dialogs: koDialogs,
    gitlab: koGitlab,
    taskReview: koTaskReview,
    terminal: koTerminal,
    insights: koInsights,
    changelog: koChangelog,
    rateLimit: koRateLimit,
    competitorAnalysis: koCompetitorAnalysis,
    appUpdate: koAppUpdate,
    worktrees: koWorktrees,
    ideation: koIdeation,
    projectIndex: koProjectIndex,
    models: koModels
  }
} as const;

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en', // Default language (will be overridden by settings)
    fallbackLng: 'en',
    defaultNS,
    ns: ['common', 'navigation', 'settings', 'tasks', 'welcome', 'onboarding', 'dialogs', 'gitlab', 'taskReview', 'terminal', 'insights', 'changelog', 'rateLimit', 'competitorAnalysis', 'appUpdate', 'worktrees', 'ideation', 'projectIndex', 'models'],
    interpolation: {
      escapeValue: false // React already escapes values
    },
    react: {
      useSuspense: false // Disable suspense for Electron compatibility
    }
  });

export default i18n;
