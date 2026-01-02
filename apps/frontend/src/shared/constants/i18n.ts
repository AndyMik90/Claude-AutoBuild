/**
 * Internationalization constants
 * Available languages and display labels
 */

export type SupportedLanguage = 'en' | 'fr' | 'tr';

export const AVAILABLE_LANGUAGES = [
  { value: 'en' as const, label: 'English', nativeLabel: 'English' },
  { value: 'fr' as const, label: 'French', nativeLabel: 'Français' },
  { value: 'tr' as const, label: 'Turkish', nativeLabel: 'Türkçe' }
] as const;

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
