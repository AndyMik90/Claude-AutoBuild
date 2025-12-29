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
import enTaskReview from './locales/en/taskReview.json';

// Import French translation resources
import frCommon from './locales/fr/common.json';
import frNavigation from './locales/fr/navigation.json';
import frSettings from './locales/fr/settings.json';
import frTasks from './locales/fr/tasks.json';
import frWelcome from './locales/fr/welcome.json';
import frOnboarding from './locales/fr/onboarding.json';
import frDialogs from './locales/fr/dialogs.json';
import frTaskReview from './locales/fr/taskReview.json';

// Import Hebrew translation resources
import heCommon from './locales/he/common.json';
import heNavigation from './locales/he/navigation.json';
import heSettings from './locales/he/settings.json';
import heTasks from './locales/he/tasks.json';
import heWelcome from './locales/he/welcome.json';
import heOnboarding from './locales/he/onboarding.json';
import heDialogs from './locales/he/dialogs.json';
import heTaskReview from './locales/he/taskReview.json';

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
    taskReview: enTaskReview
  },
  fr: {
    common: frCommon,
    navigation: frNavigation,
    settings: frSettings,
    tasks: frTasks,
    welcome: frWelcome,
    onboarding: frOnboarding,
    dialogs: frDialogs,
    taskReview: frTaskReview
  },
  he: {
    common: heCommon,
    navigation: heNavigation,
    settings: heSettings,
    tasks: heTasks,
    welcome: heWelcome,
    onboarding: heOnboarding,
    dialogs: heDialogs,
    taskReview: heTaskReview
  }
} as const;

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en', // Default language (will be overridden by settings)
    fallbackLng: 'en',
    defaultNS,
    ns: ['common', 'navigation', 'settings', 'tasks', 'welcome', 'onboarding', 'dialogs', 'taskReview'],
    interpolation: {
      escapeValue: false // React already escapes values
    },
    react: {
      useSuspense: false // Disable suspense for Electron compatibility
    }
  });

export default i18n;
