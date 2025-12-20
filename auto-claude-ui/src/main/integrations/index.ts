/**
 * Integration module for external roadmap/feedback services
 *
 * Currently provides architecture for future integrations with:
 * - Canny.io (feedback management)
 * - GitHub Issues
 *
 * To add a new integration:
 * 1. Implement the IntegrationAdapter interface
 * 2. Add status mapping constants
 * 3. Register the adapter in this module
 */

export * from './types';

// Future: Export concrete adapter implementations
// export { CannyAdapter } from './canny-adapter';
// export { GitHubIssuesAdapter } from './github-issues-adapter';
