/**
 * Centralized Icon Exports for Design System
 *
 * This file serves as the single source of truth for all lucide-react icons used
 * throughout the design system demo app. By consolidating imports here, we enable:
 *
 * 1. Better tracking of which icons are actually used
 * 2. Potential code-splitting opportunities
 * 3. Easier future migration to alternative icon solutions
 * 4. Reduced bundle size through optimized tree-shaking
 *
 * Usage:
 *   import { Check, ChevronLeft, X } from '../lib/icons';
 *
 * When adding new icons:
 *   1. Import the icon from 'lucide-react'
 *   2. Add it to the export statement in alphabetical order
 */

export {
  Check,
  ChevronLeft,
  ChevronRight,
  Github,
  Heart,
  MessageSquare,
  Minus,
  Moon,
  MoreVertical,
  Plus,
  RotateCcw,
  Slack,
  Sparkles,
  Star,
  Sun,
  Video,
  X,
  Zap,
} from 'lucide-react';
