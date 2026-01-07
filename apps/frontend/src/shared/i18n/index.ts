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

// Import Japanese translation resources
import jaCommon from './locales/ja/common.json';
import jaNavigation from './locales/ja/navigation.json';
import jaSettings from './locales/ja/settings.json';
import jaTasks from './locales/ja/tasks.json';
import jaWelcome from './locales/ja/welcome.json';
import jaOnboarding from './locales/ja/onboarding.json';
import jaDialogs from './locales/ja/dialogs.json';
import jaGitlab from './locales/ja/gitlab.json';
import jaTaskReview from './locales/ja/taskReview.json';
import jaTerminal from './locales/ja/terminal.json';

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
    terminal: enTerminal
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
    terminal: frTerminal
  },
  ja: {
    common: jaCommon,
    navigation: jaNavigation,
    settings: jaSettings,
    tasks: jaTasks,
    welcome: jaWelcome,
    onboarding: jaOnboarding,
    dialogs: jaDialogs,
    gitlab: jaGitlab,
    taskReview: jaTaskReview,
    terminal: jaTerminal
  }
} as const;

// Detect system locale and fall back to 'en'
const systemLocale = typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en'; // e.g., 'ja' from 'ja-JP'
const supportedLanguages = ['en', 'fr', 'ja'];
let defaultLanguage = supportedLanguages.includes(systemLocale) ? systemLocale : 'en';

// Force 'en' in test environment
if (process.env.NODE_ENV === 'test') {
  defaultLanguage = 'en';
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: defaultLanguage, // Use system locale or default to 'en'
    fallbackLng: 'en',
    defaultNS,
    ns: ['common', 'navigation', 'settings', 'tasks', 'welcome', 'onboarding', 'dialogs', 'gitlab', 'taskReview', 'terminal'],
    interpolation: {
      escapeValue: false // React already escapes values
    },
    react: {
      useSuspense: false // Disable suspense for Electron compatibility
    }
  });

export default i18n;
