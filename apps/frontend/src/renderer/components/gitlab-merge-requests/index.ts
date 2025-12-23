/**
 * GitLab Merge Requests UI Components
 *
 * TODO: Integrate into sidebar and App.tsx
 * These components are ready to use but not yet wired into the UI.
 * To integrate:
 * 1. Add 'gitlab-mrs' to SidebarView type in Sidebar.tsx
 * 2. Add nav item in toolsNavItems array in Sidebar.tsx
 * 3. Add view case in App.tsx (similar to gitlab-issues)
 *
 * Left to maintainers' discretion whether to add MR support
 * (GitHub integration doesn't have PR support either)
 */

// Main export for the gitlab-merge-requests module
export { GitLabMergeRequests } from './GitLabMergeRequests';

// Re-export components for external usage if needed
export {
  MergeRequestList,
  MergeRequestItem,
  CreateMergeRequestDialog
} from './components';
