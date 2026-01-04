/**
 * Internationalization constants
 * Available languages and display labels
 */

export type SupportedLanguage = 'en' | 'fr' | 'zh-CN' | 'zh-TW';

export const AVAILABLE_LANGUAGES = [
  { value: 'en' as const, label: 'English', nativeLabel: 'English' },
  { value: 'fr' as const, label: 'French', nativeLabel: 'Français' },
  { value: 'zh-CN' as const, label: 'Simplified Chinese', nativeLabel: '简体中文' },
  { value: 'zh-TW' as const, label: 'Traditional Chinese', nativeLabel: '繁體中文' }
] as const;

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
