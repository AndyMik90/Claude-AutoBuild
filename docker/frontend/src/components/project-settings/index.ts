// Note: ProjectSettings component is deprecated - use unified AppSettings instead
export { GeneralSettings } from './GeneralSettings';
export { EnvironmentSettings } from './EnvironmentSettings';
export { IntegrationSettings } from './IntegrationSettings';
export { SecuritySettings } from './SecuritySettings';
export { useProjectSettings } from './hooks/useProjectSettings';
export type { UseProjectSettingsReturn } from './hooks/useProjectSettings';

// New refactored components for ProjectSettings dialog
export { AutoBuildIntegration } from './AutoBuildIntegration';
export { ClaudeAuthSection } from './ClaudeAuthSection';
export { LinearIntegrationSection } from './LinearIntegrationSection';
export { GitHubIntegrationSection } from './GitHubIntegrationSection';
export { MemoryBackendSection } from './MemoryBackendSection';
export { AgentConfigSection } from './AgentConfigSection';
export { NotificationsSection } from './NotificationsSection';

// Utility components
export { CollapsibleSection } from './CollapsibleSection';
export { PasswordInput } from './PasswordInput';
export { StatusBadge } from './StatusBadge';
export { ConnectionStatus } from './ConnectionStatus';
export { InfrastructureStatus } from './InfrastructureStatus';

// Per-project configuration (for Docker multi-user)
export { AgentProfileSettings } from './AgentProfileSettings';
export { CredentialSettings } from './CredentialSettings';
