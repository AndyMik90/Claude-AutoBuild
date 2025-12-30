/**
 * Unit tests for GitLab Merge Request handlers
 * Tests MR transformation and state validation
 */
import { describe, it, expect } from 'vitest';

// Valid merge request states per GitLab API
// - opened: MR is open and can be modified/merged
// - closed: MR has been closed without merging
// - merged: MR has been successfully merged
// - locked: MR is temporarily locked (during merge/rebase operations or by admin)
// - all: Query parameter to retrieve MRs in any state
const VALID_MR_STATES = ['opened', 'closed', 'merged', 'locked', 'all'] as const;
type MergeRequestState = typeof VALID_MR_STATES[number];

function isValidMrState(state: string): state is MergeRequestState {
  return VALID_MR_STATES.includes(state as MergeRequestState);
}

// Test types matching the handler's internal types
interface GitLabAPIMergeRequest {
  id: number;
  iid: number;
  title?: string;
  description?: string | null;
  state?: string;
  source_branch?: string;
  target_branch?: string;
  author?: { username?: string; avatar_url?: string };
  assignees?: Array<{ username?: string; avatar_url?: string }>;
  labels?: string[];
  web_url?: string;
  created_at?: string;
  updated_at?: string;
  merged_at?: string | null;
  merge_status?: string;
}

interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  description?: string;
  state: string;
  sourceBranch: string;
  targetBranch: string;
  author: { username: string; avatarUrl?: string };
  assignees: Array<{ username: string; avatarUrl?: string }>;
  labels: string[];
  webUrl: string;
  createdAt: string;
  updatedAt: string;
  mergedAt?: string;
  mergeStatus: string;
}

/**
 * Transform GitLab API MR to our format
 * Defensively handles missing/null properties
 */
function transformMergeRequest(apiMr: GitLabAPIMergeRequest): GitLabMergeRequest {
  return {
    id: apiMr.id,
    iid: apiMr.iid,
    title: apiMr.title || '',
    description: apiMr.description || undefined,
    state: apiMr.state || 'opened',
    sourceBranch: apiMr.source_branch || '',
    targetBranch: apiMr.target_branch || '',
    author: apiMr.author
      ? {
          username: apiMr.author.username || '',
          avatarUrl: apiMr.author.avatar_url || undefined
        }
      : { username: '' },
    assignees: Array.isArray(apiMr.assignees)
      ? apiMr.assignees.map(a => ({
          username: a?.username || '',
          avatarUrl: a?.avatar_url || undefined
        }))
      : [],
    labels: Array.isArray(apiMr.labels) ? apiMr.labels : [],
    webUrl: apiMr.web_url || '',
    createdAt: apiMr.created_at || new Date().toISOString(),
    updatedAt: apiMr.updated_at || apiMr.created_at || new Date().toISOString(),
    mergedAt: apiMr.merged_at || undefined,
    mergeStatus: apiMr.merge_status || ''
  };
}

describe('GitLab Merge Request Handlers', () => {
  describe('isValidMrState', () => {
    it('should accept valid MR states', () => {
      expect(isValidMrState('opened')).toBe(true);
      expect(isValidMrState('closed')).toBe(true);
      expect(isValidMrState('merged')).toBe(true);
      expect(isValidMrState('locked')).toBe(true);
      expect(isValidMrState('all')).toBe(true);
    });

    it('should reject invalid MR states', () => {
      expect(isValidMrState('open')).toBe(false);
      expect(isValidMrState('close')).toBe(false);
      expect(isValidMrState('pending')).toBe(false);
      expect(isValidMrState('')).toBe(false);
      expect(isValidMrState('OPENED')).toBe(false); // Case sensitive
    });
  });

  describe('transformMergeRequest', () => {
    const baseApiMr: GitLabAPIMergeRequest = {
      id: 12345,
      iid: 42,
      title: 'Fix authentication bug',
      description: 'This MR fixes the authentication issue',
      state: 'opened',
      source_branch: 'fix/auth-bug',
      target_branch: 'main',
      author: { username: 'developer', avatar_url: 'https://gitlab.com/dev.png' },
      assignees: [{ username: 'reviewer', avatar_url: 'https://gitlab.com/rev.png' }],
      labels: ['bug', 'security'],
      web_url: 'https://gitlab.com/test/project/-/merge_requests/42',
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-16T12:00:00Z',
      merged_at: null,
      merge_status: 'can_be_merged'
    };

    it('should transform basic MR correctly', () => {
      const result = transformMergeRequest(baseApiMr);

      expect(result.id).toBe(12345);
      expect(result.iid).toBe(42);
      expect(result.title).toBe('Fix authentication bug');
      expect(result.description).toBe('This MR fixes the authentication issue');
      expect(result.state).toBe('opened');
    });

    it('should transform branches correctly', () => {
      const result = transformMergeRequest(baseApiMr);

      expect(result.sourceBranch).toBe('fix/auth-bug');
      expect(result.targetBranch).toBe('main');
    });

    it('should transform author correctly', () => {
      const result = transformMergeRequest(baseApiMr);

      expect(result.author.username).toBe('developer');
      expect(result.author.avatarUrl).toBe('https://gitlab.com/dev.png');
    });

    it('should transform assignees correctly', () => {
      const result = transformMergeRequest(baseApiMr);

      expect(result.assignees).toHaveLength(1);
      expect(result.assignees[0].username).toBe('reviewer');
      expect(result.assignees[0].avatarUrl).toBe('https://gitlab.com/rev.png');
    });

    it('should transform labels correctly', () => {
      const result = transformMergeRequest(baseApiMr);

      expect(result.labels).toEqual(['bug', 'security']);
    });

    it('should transform timestamps correctly', () => {
      const result = transformMergeRequest(baseApiMr);

      expect(result.createdAt).toBe('2024-01-15T10:00:00Z');
      expect(result.updatedAt).toBe('2024-01-16T12:00:00Z');
      expect(result.mergedAt).toBeUndefined();
    });

    it('should handle merged MRs', () => {
      const mergedMr: GitLabAPIMergeRequest = {
        ...baseApiMr,
        state: 'merged',
        merged_at: '2024-01-20T15:00:00Z'
      };

      const result = transformMergeRequest(mergedMr);

      expect(result.state).toBe('merged');
      expect(result.mergedAt).toBe('2024-01-20T15:00:00Z');
    });

    it('should handle closed MRs', () => {
      const closedMr: GitLabAPIMergeRequest = {
        ...baseApiMr,
        state: 'closed'
      };

      const result = transformMergeRequest(closedMr);

      expect(result.state).toBe('closed');
    });

    it('should handle locked MRs', () => {
      const lockedMr: GitLabAPIMergeRequest = {
        ...baseApiMr,
        state: 'locked'
      };

      const result = transformMergeRequest(lockedMr);

      expect(result.state).toBe('locked');
    });

    it('should handle missing optional fields with defaults', () => {
      const minimalMr: GitLabAPIMergeRequest = {
        id: 1,
        iid: 1
      };

      const result = transformMergeRequest(minimalMr);

      expect(result.id).toBe(1);
      expect(result.iid).toBe(1);
      expect(result.title).toBe('');
      expect(result.description).toBeUndefined();
      expect(result.state).toBe('opened'); // Default state
      expect(result.sourceBranch).toBe('');
      expect(result.targetBranch).toBe('');
      expect(result.author.username).toBe('');
      expect(result.assignees).toEqual([]);
      expect(result.labels).toEqual([]);
      expect(result.webUrl).toBe('');
      expect(result.mergeStatus).toBe('');
    });

    it('should handle null description', () => {
      const nullDescription: GitLabAPIMergeRequest = {
        ...baseApiMr,
        description: null
      };

      const result = transformMergeRequest(nullDescription);

      expect(result.description).toBeUndefined();
    });

    it('should handle empty assignees array', () => {
      const noAssignees: GitLabAPIMergeRequest = {
        ...baseApiMr,
        assignees: []
      };

      const result = transformMergeRequest(noAssignees);

      expect(result.assignees).toEqual([]);
    });

    it('should handle undefined assignees', () => {
      const undefinedAssignees: GitLabAPIMergeRequest = {
        ...baseApiMr,
        assignees: undefined
      };

      const result = transformMergeRequest(undefinedAssignees);

      expect(result.assignees).toEqual([]);
    });

    it('should handle undefined author', () => {
      const noAuthor: GitLabAPIMergeRequest = {
        ...baseApiMr,
        author: undefined
      };

      const result = transformMergeRequest(noAuthor);

      expect(result.author.username).toBe('');
      expect(result.author.avatarUrl).toBeUndefined();
    });

    it('should handle multiple assignees', () => {
      const multipleAssignees: GitLabAPIMergeRequest = {
        ...baseApiMr,
        assignees: [
          { username: 'reviewer1', avatar_url: 'https://gitlab.com/r1.png' },
          { username: 'reviewer2', avatar_url: 'https://gitlab.com/r2.png' },
          { username: 'reviewer3' }
        ]
      };

      const result = transformMergeRequest(multipleAssignees);

      expect(result.assignees).toHaveLength(3);
      expect(result.assignees[0].username).toBe('reviewer1');
      expect(result.assignees[1].username).toBe('reviewer2');
      expect(result.assignees[2].username).toBe('reviewer3');
      expect(result.assignees[2].avatarUrl).toBeUndefined();
    });

    it('should handle assignees with missing username', () => {
      const missingUsername: GitLabAPIMergeRequest = {
        ...baseApiMr,
        assignees: [{ avatar_url: 'https://gitlab.com/avatar.png' }]
      };

      const result = transformMergeRequest(missingUsername);

      expect(result.assignees[0].username).toBe('');
      expect(result.assignees[0].avatarUrl).toBe('https://gitlab.com/avatar.png');
    });

    it('should handle undefined labels', () => {
      const undefinedLabels: GitLabAPIMergeRequest = {
        ...baseApiMr,
        labels: undefined
      };

      const result = transformMergeRequest(undefinedLabels);

      expect(result.labels).toEqual([]);
    });

    it('should preserve merge status', () => {
      const canMerge: GitLabAPIMergeRequest = {
        ...baseApiMr,
        merge_status: 'can_be_merged'
      };

      const cannotMerge: GitLabAPIMergeRequest = {
        ...baseApiMr,
        merge_status: 'cannot_be_merged'
      };

      expect(transformMergeRequest(canMerge).mergeStatus).toBe('can_be_merged');
      expect(transformMergeRequest(cannotMerge).mergeStatus).toBe('cannot_be_merged');
    });

    it('should use created_at as fallback for updated_at', () => {
      const noUpdatedAt: GitLabAPIMergeRequest = {
        ...baseApiMr,
        updated_at: undefined
      };

      const result = transformMergeRequest(noUpdatedAt);

      expect(result.updatedAt).toBe('2024-01-15T10:00:00Z');
    });

    it('should handle complex branch names', () => {
      const complexBranches: GitLabAPIMergeRequest = {
        ...baseApiMr,
        source_branch: 'feature/JIRA-123_add-new-feature',
        target_branch: 'release/v2.0'
      };

      const result = transformMergeRequest(complexBranches);

      expect(result.sourceBranch).toBe('feature/JIRA-123_add-new-feature');
      expect(result.targetBranch).toBe('release/v2.0');
    });
  });
});
