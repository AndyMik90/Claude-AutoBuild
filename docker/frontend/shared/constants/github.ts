/**
 * GitHub integration constants
 * Issue states, complexity levels, and investigation-related constants
 */

// ============================================
// GitHub Issue State
// ============================================

export const GITHUB_ISSUE_STATE_LABELS: Record<string, string> = {
  open: 'Open',
  closed: 'Closed'
};

export const GITHUB_ISSUE_STATE_COLORS: Record<string, string> = {
  open: 'bg-success/10 text-success border-success/30',
  closed: 'bg-purple-500/10 text-purple-400 border-purple-500/30'
};

// ============================================
// GitHub Complexity (for investigation results)
// ============================================

export const GITHUB_COMPLEXITY_COLORS: Record<string, string> = {
  simple: 'bg-success/10 text-success',
  standard: 'bg-warning/10 text-warning',
  complex: 'bg-destructive/10 text-destructive'
};
