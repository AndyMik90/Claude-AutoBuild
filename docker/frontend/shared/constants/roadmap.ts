/**
 * Roadmap-related constants
 * Feature priority, complexity, and impact indicators
 */

// ============================================
// Roadmap Priority
// ============================================

export const ROADMAP_PRIORITY_LABELS: Record<string, string> = {
  must: 'Must Have',
  should: 'Should Have',
  could: 'Could Have',
  wont: "Won't Have"
};

export const ROADMAP_PRIORITY_COLORS: Record<string, string> = {
  must: 'bg-destructive/10 text-destructive border-destructive/30',
  should: 'bg-warning/10 text-warning border-warning/30',
  could: 'bg-info/10 text-info border-info/30',
  wont: 'bg-muted text-muted-foreground border-muted'
};

// ============================================
// Roadmap Complexity
// ============================================

export const ROADMAP_COMPLEXITY_COLORS: Record<string, string> = {
  low: 'bg-success/10 text-success',
  medium: 'bg-warning/10 text-warning',
  high: 'bg-destructive/10 text-destructive'
};

// ============================================
// Roadmap Impact
// ============================================

export const ROADMAP_IMPACT_COLORS: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-info/10 text-info',
  high: 'bg-success/10 text-success'
};
