/**
 * Theme constants
 * Color themes for multi-theme support with light/dark mode variants
 */

import type { ColorThemeDefinition } from '../types/settings';

// ============================================
// Color Themes
// ============================================

/**
 * All available color themes with preview colors for the theme selector.
 * Each theme has both light and dark mode variants defined in CSS.
 */
export const COLOR_THEMES: ColorThemeDefinition[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Oscura-inspired with pale yellow accent',
    previewColors: { bg: '#F2F2ED', accent: '#E6E7A3', darkBg: '#0B0B0F', darkAccent: '#E6E7A3' }
  },
  {
    id: 'dusk',
    name: 'Dusk',
    description: 'Warmer variant with slightly lighter dark mode',
    previewColors: { bg: '#F5F5F0', accent: '#E6E7A3', darkBg: '#131419', darkAccent: '#E6E7A3' }
  },
  {
    id: 'lime',
    name: 'Lime',
    description: 'Fresh, energetic lime with purple accents',
    previewColors: { bg: '#E8F5A3', accent: '#7C3AED', darkBg: '#0F0F1A' }
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Calm, professional blue tones',
    previewColors: { bg: '#E0F2FE', accent: '#0284C7', darkBg: '#082F49' }
  },
  {
    id: 'retro',
    name: 'Retro',
    description: 'Warm, nostalgic amber vibes',
    previewColors: { bg: '#FEF3C7', accent: '#D97706', darkBg: '#1C1917' }
  },
  {
    id: 'neo',
    name: 'Neo',
    description: 'Modern cyberpunk pink/magenta',
    previewColors: { bg: '#FDF4FF', accent: '#D946EF', darkBg: '#0F0720' }
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Natural, earthy green tones',
    previewColors: { bg: '#DCFCE7', accent: '#16A34A', darkBg: '#052E16' }
  }
];
