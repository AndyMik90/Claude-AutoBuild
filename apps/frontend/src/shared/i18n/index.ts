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
import enErrors from './locales/en/errors.json';

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
import frErrors from './locales/fr/errors.json';

// Import Chinese (Simplified) translation resources
import zhCnCommon from './locales/zh-CN/common.json';
import zhCnNavigation from './locales/zh-CN/navigation.json';
import zhCnSettings from './locales/zh-CN/settings.json';
import zhCnTasks from './locales/zh-CN/tasks.json';
import zhCnWelcome from './locales/zh-CN/welcome.json';
import zhCnOnboarding from './locales/zh-CN/onboarding.json';
import zhCnDialogs from './locales/zh-CN/dialogs.json';
import zhCnGitlab from './locales/zh-CN/gitlab.json';
import zhCnTaskReview from './locales/zh-CN/taskReview.json';
import zhCnTerminal from './locales/zh-CN/terminal.json';
import zhCnErrors from './locales/zh-CN/errors.json';

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
    errors: enErrors
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
    errors: frErrors
  },
  'zh-CN': {
    common: zhCnCommon,
    navigation: zhCnNavigation,
    settings: zhCnSettings,
    tasks: zhCnTasks,
    welcome: zhCnWelcome,
    onboarding: zhCnOnboarding,
    dialogs: zhCnDialogs,
    gitlab: zhCnGitlab,
    taskReview: zhCnTaskReview,
    terminal: zhCnTerminal,
    errors: zhCnErrors
  }
} as const;

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en', // Default language (will be overridden by settings)
    fallbackLng: 'en',
    defaultNS,
    ns: ['common', 'navigation', 'settings', 'tasks', 'welcome', 'onboarding', 'dialogs', 'gitlab', 'taskReview', 'terminal', 'errors'],
    interpolation: {
      escapeValue: false // React already escapes values
    },
    react: {
      useSuspense: false // Disable suspense for Electron compatibility
    }
  });

export default i18n;
