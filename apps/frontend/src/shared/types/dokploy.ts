/**
 * Dokploy API types
 */

// Server from Dokploy API
export interface DokployServer {
  serverId: string;
  name: string;
  description?: string;
  ipAddress?: string;
  serverStatus?: string;
}

// GitHub provider from Dokploy API
export interface DokployGitHubProvider {
  gitProviderId: string;
  name: string;
  providerType: 'github' | 'gitlab' | 'bitbucket' | 'gitea';
  // GitHub-specific nested object (contains the actual githubId for saveGithubProvider)
  github?: {
    githubId: string;
    githubAppName?: string;
    githubUsername?: string;
  };
  // Legacy fields (may appear at top level in some API versions)
  githubId?: string;
  githubAppName?: string;
  githubUsername?: string;
}

// Repository from Dokploy API
export interface DokployRepository {
  name: string;
  fullName: string;
  owner: string;
  url: string;
  private: boolean;
  defaultBranch?: string;
}

// Branch from Dokploy API
export interface DokployBranch {
  name: string;
}

// Project from Dokploy API
export interface DokployProject {
  projectId: string;
  name: string;
  description?: string;
  // Environment ID is needed to create applications
  environments?: Array<{
    environmentId: string;
    name: string;
  }>;
}

// Application from Dokploy API
export interface DokployApplication {
  applicationId: string;
  name: string;
  appName: string;
  projectId: string;
  environmentId: string;
  serverId?: string;
}

// Application types in Dokploy
export type DokployApplicationType =
  | 'application'
  | 'compose'
  | 'mariadb'
  | 'mongo'
  | 'mysql'
  | 'postgres'
  | 'redis';

// Deployment result
export interface DokployDeploymentResult {
  success: boolean;
  applicationId?: string;
  projectId?: string;
  error?: string;
}

// API request/response types
export interface DokployApiRequest {
  accountId: string;  // ID of the DokployAccount to use
  endpoint: string;   // API endpoint path (e.g., 'server.all')
  method: 'GET' | 'POST';
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}

export interface DokployApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Stored deployment info for a service
export interface DokployServiceDeployment {
  serviceKey: string;           // Key from project index (e.g., 'frontend', 'backend')
  serviceName: string;          // Display name
  applicationId: string;        // Dokploy application ID
  appName: string;              // Dokploy app name
  applicationType?: DokployApplicationType; // Type of application (application, compose, database, etc.)
  branch: string;               // Deployed branch
  domain?: string;              // Custom domain if set
  port?: number;                // Service port
  deployedAt: string;           // ISO date string
}

// Stored deployment info for the entire project
export interface DokployProjectDeployment {
  accountId: string;            // Dokploy account used
  accountName: string;          // For display purposes
  projectId: string;            // Dokploy project ID
  projectName: string;          // Dokploy project name
  environmentId: string;        // Dokploy environment ID
  serverId?: string;            // Server ID (null for local)
  repository: {
    owner: string;
    name: string;
    fullName: string;
  };
  services: DokployServiceDeployment[];
  createdAt: string;            // ISO date string
  updatedAt: string;            // ISO date string
}
