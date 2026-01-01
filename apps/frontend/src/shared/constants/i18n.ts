/**
 * Internationalization constants
 * Available languages and display labels
 */

export type SupportedLanguage = 'en' | 'fr' | 'ko';

export const AVAILABLE_LANGUAGES = [
  { value: 'en' as const, label: 'English', nativeLabel: 'English' },
  { value: 'fr' as const, label: 'French', nativeLabel: 'Français' },
  { value: 'ko' as const, label: 'Korean', nativeLabel: '한국어' }
] as const;

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
