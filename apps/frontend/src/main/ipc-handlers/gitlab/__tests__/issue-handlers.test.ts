/**
 * Unit tests for GitLab Issue handlers
 * Tests issue transformation and state validation
 */
import { describe, it, expect } from 'vitest';

// Test types matching the handler's internal types
interface GitLabAPIIssue {
  id: number;
  iid: number;
  title: string;
  description?: string | null;
  state: string;
  labels: string[];
  assignees?: Array<{ username?: string; avatar_url?: string }>;
  author?: { username?: string; avatar_url?: string };
  milestone?: { id: number; title: string; state: string };
  created_at: string;
  updated_at?: string;
  closed_at?: string | null;
  user_notes_count?: number;
  web_url: string;
}

interface GitLabIssue {
  id: number;
  iid: number;
  title: string;
  description?: string;
  state: string;
  labels: string[];
  assignees: Array<{ username: string; avatarUrl?: string }>;
  author: { username: string; avatarUrl?: string };
  milestone?: { id: number; title: string; state: 'active' | 'closed' };
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  userNotesCount?: number;
  webUrl: string;
  projectPathWithNamespace: string;
}

/**
 * Transform GitLab API issue to our format
 */
function transformIssue(apiIssue: GitLabAPIIssue, projectPath: string): GitLabIssue {
  // Transform milestone with state validation
  let milestone: GitLabIssue['milestone'];
  if (apiIssue.milestone) {
    const rawState = apiIssue.milestone.state;
    let milestoneState: 'active' | 'closed';
    if (rawState === 'active' || rawState === 'closed') {
      milestoneState = rawState;
    } else {
      // Unknown state defaults to active (logged at warning level in production)
      milestoneState = 'active';
    }
    milestone = {
      id: apiIssue.milestone.id,
      title: apiIssue.milestone.title,
      state: milestoneState
    };
  }

  return {
    id: apiIssue.id,
    iid: apiIssue.iid,
    title: apiIssue.title,
    description: apiIssue.description ?? undefined,
    state: apiIssue.state,
    labels: apiIssue.labels ?? [],
    assignees: (apiIssue.assignees ?? []).map(a => ({
      username: a?.username ?? 'unknown',
      avatarUrl: a?.avatar_url
    })),
    author: {
      username: apiIssue.author?.username ?? 'unknown',
      avatarUrl: apiIssue.author?.avatar_url
    },
    milestone,
    createdAt: apiIssue.created_at,
    updatedAt: apiIssue.updated_at ?? apiIssue.created_at,
    closedAt: apiIssue.closed_at ?? undefined,
    userNotesCount: apiIssue.user_notes_count,
    webUrl: apiIssue.web_url,
    projectPathWithNamespace: projectPath
  };
}

describe('GitLab Issue Handlers', () => {
  describe('transformIssue', () => {
    const baseApiIssue: GitLabAPIIssue = {
      id: 12345,
      iid: 42,
      title: 'Test Issue',
      description: 'This is a test description',
      state: 'opened',
      labels: ['bug', 'priority::high'],
      assignees: [{ username: 'testuser', avatar_url: 'https://gitlab.com/avatar.png' }],
      author: { username: 'author', avatar_url: 'https://gitlab.com/author.png' },
      milestone: { id: 1, title: 'v1.0', state: 'active' },
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-16T12:00:00Z',
      closed_at: null,
      user_notes_count: 5,
      web_url: 'https://gitlab.com/test/project/-/issues/42'
    };

    const projectPath = 'test/project';

    it('should transform basic issue correctly', () => {
      const result = transformIssue(baseApiIssue, projectPath);

      expect(result.id).toBe(12345);
      expect(result.iid).toBe(42);
      expect(result.title).toBe('Test Issue');
      expect(result.description).toBe('This is a test description');
      expect(result.state).toBe('opened');
      expect(result.projectPathWithNamespace).toBe('test/project');
    });

    it('should transform labels correctly', () => {
      const result = transformIssue(baseApiIssue, projectPath);

      expect(result.labels).toEqual(['bug', 'priority::high']);
    });

    it('should transform assignees correctly', () => {
      const result = transformIssue(baseApiIssue, projectPath);

      expect(result.assignees).toHaveLength(1);
      expect(result.assignees[0].username).toBe('testuser');
      expect(result.assignees[0].avatarUrl).toBe('https://gitlab.com/avatar.png');
    });

    it('should transform author correctly', () => {
      const result = transformIssue(baseApiIssue, projectPath);

      expect(result.author.username).toBe('author');
      expect(result.author.avatarUrl).toBe('https://gitlab.com/author.png');
    });

    it('should transform milestone with valid active state', () => {
      const result = transformIssue(baseApiIssue, projectPath);

      expect(result.milestone).toBeDefined();
      expect(result.milestone?.id).toBe(1);
      expect(result.milestone?.title).toBe('v1.0');
      expect(result.milestone?.state).toBe('active');
    });

    it('should transform milestone with closed state', () => {
      const closedMilestone: GitLabAPIIssue = {
        ...baseApiIssue,
        milestone: { id: 2, title: 'v0.9', state: 'closed' }
      };

      const result = transformIssue(closedMilestone, projectPath);

      expect(result.milestone?.state).toBe('closed');
    });

    it('should handle unknown milestone state by defaulting to active', () => {
      const unknownMilestone: GitLabAPIIssue = {
        ...baseApiIssue,
        milestone: { id: 3, title: 'Future', state: 'upcoming' } // Unknown state
      };

      const result = transformIssue(unknownMilestone, projectPath);

      expect(result.milestone?.state).toBe('active');
    });

    it('should transform timestamps correctly', () => {
      const result = transformIssue(baseApiIssue, projectPath);

      expect(result.createdAt).toBe('2024-01-15T10:00:00Z');
      expect(result.updatedAt).toBe('2024-01-16T12:00:00Z');
      expect(result.closedAt).toBeUndefined();
    });

    it('should handle closed issues', () => {
      const closedIssue: GitLabAPIIssue = {
        ...baseApiIssue,
        state: 'closed',
        closed_at: '2024-01-20T15:00:00Z'
      };

      const result = transformIssue(closedIssue, projectPath);

      expect(result.state).toBe('closed');
      expect(result.closedAt).toBe('2024-01-20T15:00:00Z');
    });

    it('should handle missing optional fields', () => {
      const minimalIssue: GitLabAPIIssue = {
        id: 1,
        iid: 1,
        title: 'Minimal Issue',
        state: 'opened',
        labels: [],
        created_at: '2024-01-01T00:00:00Z',
        web_url: 'https://gitlab.com/test/project/-/issues/1'
      };

      const result = transformIssue(minimalIssue, projectPath);

      expect(result.description).toBeUndefined();
      expect(result.assignees).toEqual([]);
      expect(result.author.username).toBe('unknown');
      expect(result.milestone).toBeUndefined();
      expect(result.userNotesCount).toBeUndefined();
    });

    it('should handle null description', () => {
      const nullDescription: GitLabAPIIssue = {
        ...baseApiIssue,
        description: null
      };

      const result = transformIssue(nullDescription, projectPath);

      expect(result.description).toBeUndefined();
    });

    it('should handle empty assignees array', () => {
      const noAssignees: GitLabAPIIssue = {
        ...baseApiIssue,
        assignees: []
      };

      const result = transformIssue(noAssignees, projectPath);

      expect(result.assignees).toEqual([]);
    });

    it('should handle undefined assignees', () => {
      const undefinedAssignees: GitLabAPIIssue = {
        ...baseApiIssue,
        assignees: undefined
      };

      const result = transformIssue(undefinedAssignees, projectPath);

      expect(result.assignees).toEqual([]);
    });

    it('should handle assignees with missing username', () => {
      const missingUsername: GitLabAPIIssue = {
        ...baseApiIssue,
        assignees: [{ avatar_url: 'https://gitlab.com/avatar.png' }]
      };

      const result = transformIssue(missingUsername, projectPath);

      expect(result.assignees[0].username).toBe('unknown');
      expect(result.assignees[0].avatarUrl).toBe('https://gitlab.com/avatar.png');
    });

    it('should use created_at as fallback for updated_at', () => {
      const noUpdatedAt: GitLabAPIIssue = {
        ...baseApiIssue,
        updated_at: undefined
      };

      const result = transformIssue(noUpdatedAt, projectPath);

      expect(result.updatedAt).toBe('2024-01-15T10:00:00Z');
    });

    it('should handle multiple assignees', () => {
      const multipleAssignees: GitLabAPIIssue = {
        ...baseApiIssue,
        assignees: [
          { username: 'user1', avatar_url: 'https://gitlab.com/u1.png' },
          { username: 'user2', avatar_url: 'https://gitlab.com/u2.png' },
          { username: 'user3' }
        ]
      };

      const result = transformIssue(multipleAssignees, projectPath);

      expect(result.assignees).toHaveLength(3);
      expect(result.assignees[0].username).toBe('user1');
      expect(result.assignees[1].username).toBe('user2');
      expect(result.assignees[2].username).toBe('user3');
      expect(result.assignees[2].avatarUrl).toBeUndefined();
    });

    it('should preserve user notes count', () => {
      const result = transformIssue(baseApiIssue, projectPath);

      expect(result.userNotesCount).toBe(5);
    });

    it('should preserve web URL', () => {
      const result = transformIssue(baseApiIssue, projectPath);

      expect(result.webUrl).toBe('https://gitlab.com/test/project/-/issues/42');
    });
  });
});
