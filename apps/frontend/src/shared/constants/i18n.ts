/**
 * Internationalization constants
 * Available languages and display labels
 */

export type SupportedLanguage = 'en' | 'fr' | 'ja';

export const AVAILABLE_LANGUAGES = [
  { value: 'en' as const, label: 'English', nativeLabel: 'English' },
  { value: 'fr' as const, label: 'French', nativeLabel: 'Français' },
  { value: 'ja' as const, label: 'Japanese', nativeLabel: '日本語' }
] as const;

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
