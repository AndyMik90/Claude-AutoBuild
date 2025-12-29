/**
 * Internationalization constants
 * Available languages and display labels
 */

export type SupportedLanguage = 'en' | 'fr' | 'he';

export const AVAILABLE_LANGUAGES = [
  { value: 'en' as const, label: 'English', nativeLabel: 'English' },
  { value: 'fr' as const, label: 'French', nativeLabel: 'Français' },
  { value: 'he' as const, label: 'Hebrew', nativeLabel: 'עברית' }
] as const;

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
