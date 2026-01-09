/**
 * Azure DevOps module types and interfaces
 */

export interface ADOConfig {
  organization: string;
  project: string;
  repoName: string;
  pat: string;
  instanceUrl: string;
}

export interface ADOAPIWorkItem {
  id: number;
  rev: number;
  fields: {
    'System.Id': number;
    'System.Title': string;
    'System.Description'?: string;
    'System.State': string;
    'System.WorkItemType': string;
    'System.Tags'?: string;
    'System.AssignedTo'?: {
      displayName: string;
      uniqueName: string;
      imageUrl?: string;
    };
    'System.CreatedBy': {
      displayName: string;
      uniqueName: string;
      imageUrl?: string;
    };
    'System.CreatedDate': string;
    'System.ChangedDate': string;
    'System.IterationPath'?: string;
    'System.AreaPath'?: string;
    'Microsoft.VSTS.Common.Priority'?: number;
  };
  url: string;
  _links?: {
    html?: { href: string };
  };
}

export interface ADOAPIRepository {
  id: string;
  name: string;
  defaultBranch: string;
  webUrl: string;
  project: {
    id: string;
    name: string;
    state: string;
  };
}

export interface ADOAPIPullRequest {
  pullRequestId: number;
  title: string;
  description?: string;
  status: 'active' | 'abandoned' | 'completed' | 'all';
  createdBy: {
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
  };
  creationDate: string;
  closedDate?: string;
  sourceRefName: string;
  targetRefName: string;
  mergeStatus?: string;
  isDraft?: boolean;
  reviewers?: Array<{
    displayName: string;
    uniqueName: string;
    vote: number;
    imageUrl?: string;
  }>;
  labels?: Array<{ name: string }>;
  url: string;
  _links?: {
    web?: { href: string };
  };
}

export interface ADOAPIComment {
  id: number;
  content: string;
  author: {
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
  };
  publishedDate: string;
  lastUpdatedDate: string;
}

export interface ADOWorkItem {
  id: number;
  number: number; // Alias for id, for compatibility with GitHub issues
  title: string;
  body?: string;
  state: 'open' | 'closed';
  workItemType: string;
  tags: string[];
  assignees: Array<{
    login: string;
    displayName: string;
    avatarUrl?: string;
  }>;
  author: {
    login: string;
    displayName: string;
    avatarUrl?: string;
  };
  priority?: number;
  iteration?: string;
  areaPath?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  url: string;
  htmlUrl: string;
}

export interface ADOPullRequest {
  id: number;
  number: number; // Alias for pullRequestId
  title: string;
  body?: string;
  state: 'open' | 'closed' | 'merged';
  author: {
    login: string;
    displayName: string;
    avatarUrl?: string;
  };
  sourceBranch: string;
  targetBranch: string;
  isDraft: boolean;
  mergeStatus?: string;
  reviewers: Array<{
    login: string;
    displayName: string;
    avatarUrl?: string;
    vote: number; // -10 = rejected, 0 = no vote, 5 = approved with suggestions, 10 = approved
  }>;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  url: string;
  htmlUrl: string;
}
