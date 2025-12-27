/**
 * Linear Task Import Modal
 * Main modal component for importing tasks from Linear
 *
 * This file has been refactored for better code quality and maintainability.
 * The implementation is now split into:
 * - linear-import/hooks/ - Custom hooks for data fetching, filtering, and state management
 * - linear-import/components/ - Reusable UI components
 * - linear-import/types.ts - Type definitions and constants
 *
 * The main component orchestrates these pieces using the useLinearImportModal hook.
 */

export { LinearTaskImportModalRefactored as LinearTaskImportModal } from './linear-import/LinearTaskImportModalRefactored';
