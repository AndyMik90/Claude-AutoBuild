/**
 * Internationalization constants
 * Available languages and display labels
 */

export type SupportedLanguage = 'en' | 'fr' | 'pl';

export const AVAILABLE_LANGUAGES = [
  { value: 'en' as const, label: 'English', nativeLabel: 'English' },
  { value: 'fr' as const, label: 'French', nativeLabel: 'Français' },
  { value: 'pl' as const, label: 'Polish', nativeLabel: 'Polski' }
] as const;

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
