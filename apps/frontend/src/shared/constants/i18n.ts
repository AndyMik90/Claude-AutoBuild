/**
 * Internationalization constants
 * Available languages and display labels
 */

export type SupportedLanguage = 'en' | 'fr' | 'cs';

export const AVAILABLE_LANGUAGES = [
  { value: 'en' as const, label: 'English', nativeLabel: 'English' },
  { value: 'fr' as const, label: 'French', nativeLabel: 'Français' },
  { value: 'cs' as const, label: 'Czech', nativeLabel: 'Čeština' }
] as const;

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
