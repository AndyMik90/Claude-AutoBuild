# Auto-Claude Azure DevOps Integration Plan

## Overview

This document outlines the implementation plan for adding Azure DevOps (ADO) support to Auto-Claude, making it a multi-provider tool that works with GitHub, GitLab, and Azure DevOps.

**Repository:** [github.com/QliknzMB/Auto-Claude-ADO](https://github.com/QliknzMB/Auto-Claude-ADO)
**Forked from:** [github.com/AndyMik90/Auto-Claude](https://github.com/AndyMik90/Auto-Claude)

### Multi-Provider Architecture

This fork adds **provider selection** so users can choose their Git platform:

| Provider | Status | Features |
|----------|--------|----------|
| **GitHub** | Existing | PRs, Issues, Webhooks |
| **GitLab** | Existing | MRs, Issues, Webhooks |
| **Azure DevOps** | New (this plan) | PRs, Work Items, Service Hooks |

Users configure their provider in settings or via environment variables. The UI adapts terminology (e.g., "Pull Request" vs "Merge Request", "Issues" vs "Work Items").

---

## Phase 1: Environment Configuration

### 1.1 New Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `GIT_PROVIDER` | Provider selection | `github`, `gitlab`, `ado` |
| `ADO_PAT` | Personal Access Token | `xxxxxxxxxxxxxxxxx` |
| `ADO_ORGANIZATION` | Organization name | `Aurivue` |
| `ADO_PROJECT` | Project name | `Aurivue-Platform` |
| `ADO_REPO_NAME` | Repository name | `Aurivue-Platform` |
| `ADO_INSTANCE_URL` | Instance URL (optional) | `https://dev.azure.com` |

### 1.2 Updated `.env.example`

```env
# Git Provider Selection (github, gitlab, ado)
GIT_PROVIDER=ado

# Azure DevOps Configuration
ADO_PAT=your_personal_access_token
ADO_ORGANIZATION=YourOrg
ADO_PROJECT=YourProject
ADO_REPO_NAME=YourRepo
ADO_INSTANCE_URL=https://dev.azure.com

# GitHub (existing)
# GITHUB_TOKEN=
# GITHUB_OWNER=
# GITHUB_REPO=

# GitLab (existing)
# GITLAB_TOKEN=
# GITLAB_INSTANCE_URL=
```

---

## Phase 2: Backend Integration Changes

### 2.1 Directory Structure (Provider Abstraction)

```
apps/backend/integrations/
├── __init__.py
├── graphiti/          # Keep as-is (memory system)
├── linear/            # Keep as-is (optional issue tracker)
├── providers/         # NEW: Provider abstraction layer
│   ├── __init__.py
│   ├── base.py        # Abstract base class for all providers
│   ├── factory.py     # Provider factory (returns GitHub/GitLab/ADO)
│   └── types.py       # Shared types (PR, Issue/WorkItem, etc.)
├── github/            # Keep existing
│   └── github.py
├── gitlab/            # Keep existing
│   └── gitlab.py
└── ado/               # NEW: Azure DevOps integration
    ├── __init__.py
    ├── client.py      # ADO API client wrapper
    ├── repos.py       # Repository operations
    ├── pull_requests.py
    ├── work_items.py  # ADO equivalent of GitHub Issues
    └── webhooks.py    # Service hooks handler
```

### 2.2 Provider Abstraction Layer

**File: `apps/backend/integrations/providers/base.py`**

```python
"""Abstract base class for Git providers (GitHub, GitLab, ADO)."""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from .types import PullRequest, WorkItem, Repository, Branch

class GitProvider(ABC):
    """Abstract interface for Git provider integrations."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name (github, gitlab, ado)."""
        pass

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable name (GitHub, GitLab, Azure DevOps)."""
        pass

    # Terminology mapping
    @property
    def pr_term(self) -> str:
        """What this provider calls a PR (Pull Request, Merge Request)."""
        return "Pull Request"

    @property
    def issue_term(self) -> str:
        """What this provider calls issues (Issue, Work Item)."""
        return "Issue"

    # Repository operations
    @abstractmethod
    async def get_repository(self) -> Repository:
        pass

    @abstractmethod
    async def list_branches(self) -> List[Branch]:
        pass

    # Pull Request / Merge Request operations
    @abstractmethod
    async def create_pull_request(
        self,
        title: str,
        description: str,
        source_branch: str,
        target_branch: str
    ) -> PullRequest:
        pass

    @abstractmethod
    async def list_pull_requests(self, status: str = "open") -> List[PullRequest]:
        pass

    @abstractmethod
    async def get_pull_request(self, pr_id: int) -> PullRequest:
        pass

    @abstractmethod
    async def merge_pull_request(self, pr_id: int, strategy: str = "squash") -> PullRequest:
        pass

    # Issue / Work Item operations
    @abstractmethod
    async def create_issue(
        self,
        title: str,
        description: str,
        issue_type: str = "task"
    ) -> WorkItem:
        pass

    @abstractmethod
    async def list_issues(self, state: str = "open") -> List[WorkItem]:
        pass

    @abstractmethod
    async def get_issue(self, issue_id: int) -> WorkItem:
        pass

    @abstractmethod
    async def close_issue(self, issue_id: int) -> WorkItem:
        pass
```

**File: `apps/backend/integrations/providers/factory.py`**

```python
"""Factory for creating Git provider instances."""

import os
from typing import Optional
from .base import GitProvider

def get_provider(provider_name: Optional[str] = None) -> GitProvider:
    """
    Get a Git provider instance.

    Args:
        provider_name: One of 'github', 'gitlab', 'ado'.
                      If None, reads from GIT_PROVIDER env var.

    Returns:
        Configured GitProvider instance.
    """
    provider = provider_name or os.getenv("GIT_PROVIDER", "github").lower()

    if provider == "github":
        from ..github.github import GitHubProvider
        return GitHubProvider()
    elif provider == "gitlab":
        from ..gitlab.gitlab import GitLabProvider
        return GitLabProvider()
    elif provider in ("ado", "azure", "azuredevops"):
        from ..ado.client import ADOProvider
        return ADOProvider()
    else:
        raise ValueError(f"Unknown provider: {provider}. Use 'github', 'gitlab', or 'ado'.")
```

**File: `apps/backend/integrations/providers/types.py`**

```python
"""Shared types for all Git providers."""

from dataclasses import dataclass
from typing import Optional, List
from datetime import datetime

@dataclass
class Identity:
    """User identity across providers."""
    display_name: str
    unique_name: str  # email or username
    avatar_url: Optional[str] = None

@dataclass
class Repository:
    """Repository info (normalized across providers)."""
    id: str
    name: str
    default_branch: str
    web_url: str
    provider: str  # github, gitlab, ado

@dataclass
class Branch:
    """Branch info."""
    name: str
    commit_id: str
    is_default: bool = False

@dataclass
class PullRequest:
    """Pull Request / Merge Request (normalized)."""
    id: int
    title: str
    description: str
    status: str  # open, closed, merged
    source_branch: str
    target_branch: str
    author: Identity
    created_at: datetime
    web_url: str
    provider: str
    provider_id_field: str = "id"

@dataclass
class WorkItem:
    """Issue / Work Item (normalized)."""
    id: int
    title: str
    description: Optional[str]
    state: str  # open, closed, active, resolved, etc.
    item_type: str  # bug, task, feature, user story, etc.
    assigned_to: Optional[Identity]
    created_at: datetime
    web_url: str
    provider: str
    tags: List[str] = None
```

### 2.3 ADO Client Implementation

**File: `apps/backend/integrations/ado/client.py`**

```python
"""Azure DevOps API Client for Auto-Claude."""

import os
from azure.devops.connection import Connection
from msrest.authentication import BasicAuthentication
from typing import Optional
from ..providers.base import GitProvider
from ..providers.types import Repository, Branch, PullRequest, WorkItem, Identity

class ADOProvider(GitProvider):
    """Azure DevOps provider implementation."""

    def __init__(
        self,
        organization: Optional[str] = None,
        project: Optional[str] = None,
        repo_name: Optional[str] = None,
        pat: Optional[str] = None,
        instance_url: Optional[str] = None
    ):
        self.organization = organization or os.getenv("ADO_ORGANIZATION")
        self.project = project or os.getenv("ADO_PROJECT")
        self.repo_name = repo_name or os.getenv("ADO_REPO_NAME")
        self.pat = pat or os.getenv("ADO_PAT")
        self.instance_url = instance_url or os.getenv("ADO_INSTANCE_URL", "https://dev.azure.com")

        if not all([self.organization, self.project, self.pat]):
            raise ValueError("ADO_ORGANIZATION, ADO_PROJECT, and ADO_PAT are required")

        self.org_url = f"{self.instance_url}/{self.organization}"
        self.credentials = BasicAuthentication("", self.pat)
        self.connection = Connection(base_url=self.org_url, creds=self.credentials)

        # Lazy-loaded API clients
        self._git_client = None
        self._work_item_client = None

    @property
    def name(self) -> str:
        return "ado"

    @property
    def display_name(self) -> str:
        return "Azure DevOps"

    @property
    def pr_term(self) -> str:
        return "Pull Request"

    @property
    def issue_term(self) -> str:
        return "Work Item"

    @property
    def git(self):
        """Get Git API client."""
        if self._git_client is None:
            self._git_client = self.connection.clients.get_git_client()
        return self._git_client

    @property
    def work_items(self):
        """Get Work Item Tracking API client."""
        if self._work_item_client is None:
            self._work_item_client = self.connection.clients.get_work_item_tracking_client()
        return self._work_item_client

    # Repository operations
    async def get_repository(self) -> Repository:
        repo = self.git.get_repository(self.repo_name, project=self.project)
        return Repository(
            id=repo.id,
            name=repo.name,
            default_branch=repo.default_branch.replace("refs/heads/", ""),
            web_url=repo.web_url,
            provider="ado"
        )

    async def list_branches(self) -> list[Branch]:
        branches = self.git.get_branches(self.repo_name, project=self.project)
        return [
            Branch(
                name=b.name,
                commit_id=b.commit.commit_id,
                is_default=b.is_base_version
            )
            for b in branches
        ]

    # Pull Request operations
    async def create_pull_request(
        self,
        title: str,
        description: str,
        source_branch: str,
        target_branch: str
    ) -> PullRequest:
        from azure.devops.v7_1.git.models import GitPullRequest

        source_ref = f"refs/heads/{source_branch}" if not source_branch.startswith("refs/") else source_branch
        target_ref = f"refs/heads/{target_branch}" if not target_branch.startswith("refs/") else target_branch

        pr = GitPullRequest(
            title=title,
            description=description,
            source_ref_name=source_ref,
            target_ref_name=target_ref
        )

        created = self.git.create_pull_request(
            git_pull_request_to_create=pr,
            repository_id=self.repo_name,
            project=self.project
        )

        return self._map_pull_request(created)

    async def list_pull_requests(self, status: str = "open") -> list[PullRequest]:
        from azure.devops.v7_1.git.models import GitPullRequestSearchCriteria

        status_map = {"open": "active", "closed": "completed", "all": "all"}
        ado_status = status_map.get(status, "active")

        search_criteria = GitPullRequestSearchCriteria(status=ado_status)
        prs = self.git.get_pull_requests(
            repository_id=self.repo_name,
            search_criteria=search_criteria,
            project=self.project
        )

        return [self._map_pull_request(pr) for pr in prs]

    async def get_pull_request(self, pr_id: int) -> PullRequest:
        pr = self.git.get_pull_request(
            repository_id=self.repo_name,
            pull_request_id=pr_id,
            project=self.project
        )
        return self._map_pull_request(pr)

    async def merge_pull_request(self, pr_id: int, strategy: str = "squash") -> PullRequest:
        pr = self.git.get_pull_request(
            repository_id=self.repo_name,
            pull_request_id=pr_id,
            project=self.project
        )

        pr.status = "completed"
        pr.completion_options = {
            "deleteSourceBranch": True,
            "mergeStrategy": strategy
        }

        updated = self.git.update_pull_request(
            git_pull_request_to_update=pr,
            repository_id=self.repo_name,
            pull_request_id=pr_id,
            project=self.project
        )

        return self._map_pull_request(updated)

    def _map_pull_request(self, pr) -> PullRequest:
        return PullRequest(
            id=pr.pull_request_id,
            title=pr.title,
            description=pr.description or "",
            status="open" if pr.status == "active" else "closed",
            source_branch=pr.source_ref_name.replace("refs/heads/", ""),
            target_branch=pr.target_ref_name.replace("refs/heads/", ""),
            author=Identity(
                display_name=pr.created_by.display_name,
                unique_name=pr.created_by.unique_name
            ),
            created_at=pr.creation_date,
            web_url=f"{self.instance_url}/{self.organization}/{self.project}/_git/{self.repo_name}/pullrequest/{pr.pull_request_id}",
            provider="ado",
            provider_id_field="pullRequestId"
        )

    # Work Item operations
    async def create_issue(
        self,
        title: str,
        description: str,
        issue_type: str = "task"
    ) -> WorkItem:
        from azure.devops.v7_1.work_item_tracking.models import JsonPatchOperation

        type_map = {"bug": "Bug", "task": "Task", "feature": "User Story"}
        ado_type = type_map.get(issue_type.lower(), "Task")

        operations = [
            JsonPatchOperation(op="add", path="/fields/System.Title", value=title),
            JsonPatchOperation(op="add", path="/fields/System.Description", value=description)
        ]

        wi = self.work_items.create_work_item(
            document=operations,
            project=self.project,
            type=ado_type
        )

        return self._map_work_item(wi)

    async def list_issues(self, state: str = "open") -> list[WorkItem]:
        from azure.devops.v7_1.work_item_tracking.models import Wiql

        state_filter = "Active" if state == "open" else "Closed"

        wiql = Wiql(query=f"""
            SELECT [System.Id]
            FROM WorkItems
            WHERE [System.TeamProject] = '{self.project}'
              AND [System.State] = '{state_filter}'
            ORDER BY [System.ChangedDate] DESC
        """)

        result = self.work_items.query_by_wiql(wiql, project=self.project)

        if not result.work_items:
            return []

        ids = [wi.id for wi in result.work_items[:200]]
        items = self.work_items.get_work_items(ids=ids, expand="All")

        return [self._map_work_item(wi) for wi in items]

    async def get_issue(self, issue_id: int) -> WorkItem:
        wi = self.work_items.get_work_item(id=issue_id, project=self.project, expand="All")
        return self._map_work_item(wi)

    async def close_issue(self, issue_id: int) -> WorkItem:
        from azure.devops.v7_1.work_item_tracking.models import JsonPatchOperation

        operations = [
            JsonPatchOperation(op="replace", path="/fields/System.State", value="Closed")
        ]

        wi = self.work_items.update_work_item(
            document=operations,
            id=issue_id,
            project=self.project
        )

        return self._map_work_item(wi)

    def _map_work_item(self, wi) -> WorkItem:
        fields = wi.fields
        assigned = fields.get("System.AssignedTo")

        return WorkItem(
            id=wi.id,
            title=fields.get("System.Title", ""),
            description=fields.get("System.Description"),
            state="open" if fields.get("System.State") in ["New", "Active"] else "closed",
            item_type=fields.get("System.WorkItemType", "Task"),
            assigned_to=Identity(
                display_name=assigned.get("displayName", ""),
                unique_name=assigned.get("uniqueName", "")
            ) if assigned else None,
            created_at=fields.get("System.CreatedDate"),
            web_url=f"{self.instance_url}/{self.organization}/{self.project}/_workitems/edit/{wi.id}",
            provider="ado",
            tags=fields.get("System.Tags", "").split("; ") if fields.get("System.Tags") else []
        )
```

---

## Phase 3: Frontend Integration Changes

### 3.1 Directory Structure (Provider Abstraction)

```
apps/frontend/src/renderer/features/
├── tasks/           # Keep as-is
├── terminals/       # Keep as-is
├── projects/        # Keep as-is
├── settings/        # Add provider selection UI
├── git-provider/    # NEW: Unified provider feature (replaces github/)
│   ├── components/
│   │   ├── ProviderSelector.tsx      # Dropdown: GitHub / GitLab / ADO
│   │   ├── ProviderSettings.tsx      # Config form (adapts per provider)
│   │   ├── PullRequestList.tsx       # Generic PR/MR list
│   │   ├── PullRequestCard.tsx
│   │   ├── IssueList.tsx             # Generic Issue/Work Item list
│   │   └── IssueCard.tsx
│   ├── hooks/
│   │   ├── useProvider.ts            # Get current provider
│   │   ├── usePullRequests.ts
│   │   ├── useIssues.ts
│   │   └── useProviderConfig.ts
│   ├── services/
│   │   ├── providerFactory.ts        # Returns correct API service
│   │   ├── githubApi.ts
│   │   ├── gitlabApi.ts
│   │   └── adoApi.ts
│   ├── types/
│   │   ├── provider.types.ts         # Shared types
│   │   ├── github.types.ts
│   │   ├── gitlab.types.ts
│   │   └── ado.types.ts
│   └── context/
│       └── ProviderContext.tsx       # React context for provider state
```

### 3.2 Provider Selection UI

**File: `apps/frontend/src/renderer/features/git-provider/components/ProviderSelector.tsx`**

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useProviderConfig } from '../hooks/useProviderConfig';

type ProviderType = 'github' | 'gitlab' | 'ado';

interface ProviderOption {
  id: ProviderType;
  name: string;
  icon: string;
  description: string;
}

const PROVIDERS: ProviderOption[] = [
  {
    id: 'github',
    name: 'GitHub',
    icon: '🐙',
    description: 'GitHub.com or GitHub Enterprise',
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    icon: '🦊',
    description: 'GitLab.com or self-hosted GitLab',
  },
  {
    id: 'ado',
    name: 'Azure DevOps',
    icon: '🔷',
    description: 'Azure DevOps Services or Server',
  },
];

export function ProviderSelector() {
  const { t } = useTranslation();
  const { provider, setProvider } = useProviderConfig();

  return (
    <div className="provider-selector">
      <h3>{t('settings.gitProvider.title', 'Git Provider')}</h3>
      <p className="text-muted">
        {t('settings.gitProvider.description', 'Select your Git hosting platform')}
      </p>

      <div className="provider-options">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            className={`provider-option ${provider === p.id ? 'selected' : ''}`}
            onClick={() => setProvider(p.id)}
          >
            <span className="provider-icon">{p.icon}</span>
            <div className="provider-info">
              <span className="provider-name">{p.name}</span>
              <span className="provider-desc">{p.description}</span>
            </div>
            {provider === p.id && <span className="checkmark">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### 3.3 ADO API Service (Frontend)

**File: `apps/frontend/src/renderer/features/git-provider/services/adoApi.ts`**

```typescript
import type { ADOConfig, PullRequest, WorkItem } from '../types/ado.types';

class ADOApiService {
  private config: ADOConfig | null = null;
  private baseUrl: string = '';

  initialize(config: ADOConfig) {
    this.config = config;
    const instanceUrl = config.instanceUrl || 'https://dev.azure.com';
    this.baseUrl = `${instanceUrl}/${config.organization}/${config.project}/_apis`;
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.config) {
      throw new Error('ADO API not initialized');
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Basic ${btoa(`:${this.config.pat}`)}`,
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      throw new Error(`ADO API error: ${response.status}`);
    }

    return response.json();
  }

  // Pull Request operations
  async getPullRequests(status: string = 'active'): Promise<{ value: PullRequest[] }> {
    return this.fetch(
      `/git/repositories/${this.config!.repoName}/pullrequests?searchCriteria.status=${status}&api-version=7.1`
    );
  }

  async createPullRequest(
    title: string,
    description: string,
    sourceBranch: string,
    targetBranch: string = 'develop'
  ): Promise<PullRequest> {
    return this.fetch(`/git/repositories/${this.config!.repoName}/pullrequests?api-version=7.1`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        description,
        sourceRefName: `refs/heads/${sourceBranch}`,
        targetRefName: `refs/heads/${targetBranch}`,
      }),
    });
  }

  // Work Item operations
  async queryWorkItems(wiql: string): Promise<{ workItems: { id: number }[] }> {
    return this.fetch(`/wit/wiql?api-version=7.1`, {
      method: 'POST',
      body: JSON.stringify({ query: wiql }),
    });
  }

  async getWorkItems(ids: number[]): Promise<{ value: WorkItem[] }> {
    return this.fetch(`/wit/workitems?ids=${ids.join(',')}&$expand=All&api-version=7.1`);
  }

  async createWorkItem(type: string, title: string, description?: string): Promise<WorkItem> {
    const operations = [
      { op: 'add', path: '/fields/System.Title', value: title },
    ];

    if (description) {
      operations.push({ op: 'add', path: '/fields/System.Description', value: description });
    }

    return this.fetch(`/wit/workitems/$${type}?api-version=7.1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json-patch+json' },
      body: JSON.stringify(operations),
    });
  }
}

export const adoApi = new ADOApiService();
export default adoApi;
```

---

## Phase 4: Dependencies

### Backend (Python)

Add to `apps/backend/requirements.txt`:

```
azure-devops>=7.1.0
msrest>=0.7.1
```

### Frontend (Node.js)

Add to `apps/frontend/package.json`:

```json
{
  "dependencies": {
    "azure-devops-node-api": "^14.0.0"
  }
}
```

---

## Phase 5: Migration Checklist

### Files to Modify

| File | Action | Priority |
|------|--------|----------|
| `apps/backend/.env.example` | Add ADO vars | High |
| `apps/backend/requirements.txt` | Add azure-devops | High |
| `apps/backend/integrations/__init__.py` | Export providers | High |
| `apps/frontend/package.json` | Add azure-devops-node-api | High |
| `apps/frontend/src/main/index.ts` | Register ADO IPC handlers | High |
| `apps/frontend/src/renderer/features/settings/` | Add provider selector | Medium |
| `README.md` | Document multi-provider setup | Medium |

### Search & Replace Patterns

| Search | Replace | Scope |
|--------|---------|-------|
| `GITHUB_TOKEN` | `ADO_PAT` (when provider=ado) | Environment |
| Direct GitHub API calls | `get_provider()` factory | Backend |
| `github.com` URLs | Provider-specific URLs | Throughout |

---

## Phase 6: API Mapping Reference

| GitHub API | ADO API | Notes |
|------------|---------|-------|
| `pulls.create()` | `git_client.create_pull_request()` | Refs need `refs/heads/` prefix |
| `pulls.list()` | `git_client.get_pull_requests()` | Uses search criteria |
| `pulls.merge()` | `git_client.update_pull_request()` | Set status="completed" |
| `issues.create()` | `wit_client.create_work_item()` | JSON Patch operations |
| `issues.list()` | `wit_client.query_by_wiql()` | WIQL query language |
| Webhooks | Service Hooks | Different payload format |

---

## Appendix: ADO API Quick Reference

### Authentication

```bash
# Base64 encode PAT (empty username)
echo -n ":$ADO_PAT" | base64

# Use in header
curl -H "Authorization: Basic $(echo -n :$ADO_PAT | base64)" \
  "https://dev.azure.com/Aurivue/Aurivue-Platform/_apis/git/repositories?api-version=7.1"
```

### Common Endpoints

| Operation | Endpoint |
|-----------|----------|
| List repos | `GET /_apis/git/repositories` |
| List PRs | `GET /_apis/git/repositories/{repo}/pullrequests` |
| Create PR | `POST /_apis/git/repositories/{repo}/pullrequests` |
| Query work items | `POST /_apis/wit/wiql` |
| Create work item | `POST /_apis/wit/workitems/${type}` |

### WIQL Examples

```sql
-- Active bugs assigned to me
SELECT [System.Id], [System.Title]
FROM WorkItems
WHERE [System.TeamProject] = 'Aurivue-Platform'
  AND [System.WorkItemType] = 'Bug'
  AND [System.State] = 'Active'
  AND [System.AssignedTo] = @Me
```

---

## Resources

- [Azure DevOps REST API Reference](https://learn.microsoft.com/en-us/rest/api/azure/devops/)
- [azure-devops-node-api](https://github.com/microsoft/azure-devops-node-api)
- [Azure DevOps Python API](https://github.com/microsoft/azure-devops-python-api)
- [Service Hooks Documentation](https://learn.microsoft.com/en-us/azure/devops/service-hooks/)
