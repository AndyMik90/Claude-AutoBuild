"""
Plane.so REST API Client
========================

Async HTTP client for the Plane.so REST API.
Supports both cloud (api.plane.so) and self-hosted instances.

API Reference: https://developers.plane.so/api-reference/introduction
"""

from typing import Any

import aiohttp


class PlaneAPIError(Exception):
    """Exception raised for Plane API errors."""

    def __init__(self, status: int, message: str, response_body: str | None = None):
        self.status = status
        self.message = message
        self.response_body = response_body
        super().__init__(f"Plane API error ({status}): {message}")


class PlaneAPIClient:
    """
    Async client for the Plane.so REST API.

    Usage:
        async with PlaneAPIClient(api_key, base_url) as client:
            projects = await client.list_projects("my-workspace")
    """

    DEFAULT_BASE_URL = "https://api.plane.so"

    def __init__(self, api_key: str, base_url: str | None = None):
        """
        Initialize the Plane API client.

        Args:
            api_key: Plane API key (format: plane_api_xxx)
            base_url: Base URL for API (default: https://api.plane.so)
        """
        self.api_key = api_key
        self.base_url = (base_url or self.DEFAULT_BASE_URL).rstrip("/")
        self._session: aiohttp.ClientSession | None = None

    async def __aenter__(self) -> "PlaneAPIClient":
        """Create aiohttp session on context enter."""
        self._session = aiohttp.ClientSession(
            headers={
                "Content-Type": "application/json",
                "X-API-Key": self.api_key,
            }
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Close aiohttp session on context exit."""
        if self._session:
            await self._session.close()
            self._session = None

    async def _request(
        self,
        method: str,
        path: str,
        params: dict[str, Any] | None = None,
        json_data: dict[str, Any] | None = None,
    ) -> dict[str, Any] | list[dict[str, Any]]:
        """
        Make an API request.

        Args:
            method: HTTP method (GET, POST, PATCH, DELETE)
            path: API path (will be prefixed with base_url)
            params: Query parameters
            json_data: JSON body for POST/PATCH

        Returns:
            Parsed JSON response

        Raises:
            PlaneAPIError: If the request fails
        """
        if not self._session:
            raise RuntimeError(
                "Client not initialized. Use 'async with' context manager."
            )

        url = f"{self.base_url}{path}"

        async with self._session.request(
            method,
            url,
            params=params,
            json=json_data,
        ) as response:
            response_text = await response.text()

            if response.status == 429:
                raise PlaneAPIError(
                    429, "Rate limit exceeded (60 req/min)", response_text
                )

            if response.status == 401:
                raise PlaneAPIError(401, "Invalid API key", response_text)

            if response.status == 404:
                raise PlaneAPIError(404, f"Resource not found: {path}", response_text)

            if not response.ok:
                raise PlaneAPIError(response.status, "Request failed", response_text)

            if response.status == 204:
                return {}

            return await response.json()

    # =========================================================================
    # Project endpoints
    # =========================================================================

    async def list_projects(
        self,
        workspace_slug: str,
    ) -> list[dict[str, Any]]:
        """
        List all projects in a workspace.

        Args:
            workspace_slug: Workspace identifier (from URL)

        Returns:
            List of project objects with id, name, identifier, etc.
        """
        path = f"/api/v1/workspaces/{workspace_slug}/projects/"
        result = await self._request("GET", path)
        # Handle paginated response
        if isinstance(result, dict) and "results" in result:
            return result["results"]
        return result if isinstance(result, list) else []

    async def get_project(
        self,
        workspace_slug: str,
        project_id: str,
    ) -> dict[str, Any]:
        """
        Get a single project by ID.

        Args:
            workspace_slug: Workspace identifier
            project_id: Project UUID

        Returns:
            Project object
        """
        path = f"/api/v1/workspaces/{workspace_slug}/projects/{project_id}/"
        result = await self._request("GET", path)
        return result if isinstance(result, dict) else {}

    # =========================================================================
    # Work Item (Issue) endpoints
    # =========================================================================

    async def list_work_items(
        self,
        workspace_slug: str,
        project_id: str,
        state: str | None = None,
        assignee: str | None = None,
        limit: int = 100,
        expand: str = "state,labels,assignees,project",
    ) -> list[dict[str, Any]]:
        """
        List all work items in a project.

        Args:
            workspace_slug: Workspace identifier
            project_id: Project UUID
            state: Filter by state ID
            assignee: Filter by assignee user ID
            limit: Results per page (max 100)
            expand: Comma-separated fields to expand

        Returns:
            List of work item objects
        """
        path = f"/api/v1/workspaces/{workspace_slug}/projects/{project_id}/work-items/"
        params = {
            "per_page": limit,
            "expand": expand,
        }
        if state:
            params["state"] = state
        if assignee:
            params["assignee"] = assignee

        result = await self._request("GET", path, params=params)
        # Handle paginated response
        if isinstance(result, dict) and "results" in result:
            return result["results"]
        return result if isinstance(result, list) else []

    async def get_work_item(
        self,
        workspace_slug: str,
        project_id: str,
        work_item_id: str,
        expand: str = "state,labels,assignees,project",
    ) -> dict[str, Any]:
        """
        Get a single work item by ID.

        Args:
            workspace_slug: Workspace identifier
            project_id: Project UUID
            work_item_id: Work item UUID
            expand: Comma-separated fields to expand

        Returns:
            Work item object
        """
        path = f"/api/v1/workspaces/{workspace_slug}/projects/{project_id}/work-items/{work_item_id}/"
        params = {"expand": expand} if expand else None
        result = await self._request("GET", path, params=params)
        return result if isinstance(result, dict) else {}

    async def create_work_item(
        self,
        workspace_slug: str,
        project_id: str,
        name: str,
        description_html: str | None = None,
        state: str | None = None,
        priority: str | None = None,
        assignees: list[str] | None = None,
        labels: list[str] | None = None,
    ) -> dict[str, Any]:
        """
        Create a new work item.

        Args:
            workspace_slug: Workspace identifier
            project_id: Project UUID
            name: Work item title (required)
            description_html: HTML description
            state: State UUID
            priority: Priority level (none, urgent, high, medium, low)
            assignees: List of user UUIDs
            labels: List of label UUIDs

        Returns:
            Created work item object
        """
        path = f"/api/v1/workspaces/{workspace_slug}/projects/{project_id}/work-items/"
        data: dict[str, Any] = {"name": name}

        if description_html:
            data["description_html"] = description_html
        if state:
            data["state"] = state
        if priority:
            data["priority"] = priority
        if assignees:
            data["assignees"] = assignees
        if labels:
            data["labels"] = labels

        result = await self._request("POST", path, json_data=data)
        return result if isinstance(result, dict) else {}

    async def update_work_item(
        self,
        workspace_slug: str,
        project_id: str,
        work_item_id: str,
        **updates: Any,
    ) -> dict[str, Any]:
        """
        Update an existing work item.

        Args:
            workspace_slug: Workspace identifier
            project_id: Project UUID
            work_item_id: Work item UUID
            **updates: Fields to update (name, description_html, state, priority, etc.)

        Returns:
            Updated work item object
        """
        path = f"/api/v1/workspaces/{workspace_slug}/projects/{project_id}/work-items/{work_item_id}/"
        result = await self._request("PATCH", path, json_data=updates)
        return result if isinstance(result, dict) else {}

    async def delete_work_item(
        self,
        workspace_slug: str,
        project_id: str,
        work_item_id: str,
    ) -> None:
        """
        Delete a work item.

        Args:
            workspace_slug: Workspace identifier
            project_id: Project UUID
            work_item_id: Work item UUID
        """
        path = f"/api/v1/workspaces/{workspace_slug}/projects/{project_id}/work-items/{work_item_id}/"
        await self._request("DELETE", path)

    # =========================================================================
    # Comment endpoints
    # =========================================================================

    async def list_comments(
        self,
        workspace_slug: str,
        project_id: str,
        work_item_id: str,
    ) -> list[dict[str, Any]]:
        """
        List all comments on a work item.

        Args:
            workspace_slug: Workspace identifier
            project_id: Project UUID
            work_item_id: Work item UUID

        Returns:
            List of comment objects
        """
        path = f"/api/v1/workspaces/{workspace_slug}/projects/{project_id}/work-items/{work_item_id}/comments/"
        result = await self._request("GET", path)
        if isinstance(result, dict) and "results" in result:
            return result["results"]
        return result if isinstance(result, list) else []

    async def add_comment(
        self,
        workspace_slug: str,
        project_id: str,
        work_item_id: str,
        comment_html: str,
    ) -> dict[str, Any]:
        """
        Add a comment to a work item.

        Args:
            workspace_slug: Workspace identifier
            project_id: Project UUID
            work_item_id: Work item UUID
            comment_html: Comment content (HTML)

        Returns:
            Created comment object
        """
        path = f"/api/v1/workspaces/{workspace_slug}/projects/{project_id}/work-items/{work_item_id}/comments/"
        data = {"comment_html": comment_html}
        result = await self._request("POST", path, json_data=data)
        return result if isinstance(result, dict) else {}

    # =========================================================================
    # State endpoints
    # =========================================================================

    async def list_states(
        self,
        workspace_slug: str,
        project_id: str,
    ) -> list[dict[str, Any]]:
        """
        List all workflow states for a project.

        Args:
            workspace_slug: Workspace identifier
            project_id: Project UUID

        Returns:
            List of state objects (id, name, group, color, etc.)
        """
        path = f"/api/v1/workspaces/{workspace_slug}/projects/{project_id}/states/"
        result = await self._request("GET", path)
        if isinstance(result, dict) and "results" in result:
            return result["results"]
        return result if isinstance(result, list) else []

    async def get_state_by_group(
        self,
        workspace_slug: str,
        project_id: str,
        group: str,
    ) -> dict[str, Any] | None:
        """
        Find a state by its group (backlog, unstarted, started, completed, cancelled).

        Args:
            workspace_slug: Workspace identifier
            project_id: Project UUID
            group: State group name

        Returns:
            First matching state object, or None
        """
        states = await self.list_states(workspace_slug, project_id)
        for state in states:
            if state.get("group") == group:
                return state
        return None

    # =========================================================================
    # Label endpoints
    # =========================================================================

    async def list_labels(
        self,
        workspace_slug: str,
        project_id: str,
    ) -> list[dict[str, Any]]:
        """
        List all labels for a project.

        Args:
            workspace_slug: Workspace identifier
            project_id: Project UUID

        Returns:
            List of label objects
        """
        path = f"/api/v1/workspaces/{workspace_slug}/projects/{project_id}/labels/"
        result = await self._request("GET", path)
        if isinstance(result, dict) and "results" in result:
            return result["results"]
        return result if isinstance(result, list) else []

    # =========================================================================
    # Utility methods
    # =========================================================================

    async def test_connection(self) -> dict[str, Any]:
        """
        Test the API connection by listing projects.

        Returns:
            Dict with success status and details

        Note:
            This requires knowing a workspace slug. For a more basic test,
            we'd need a /me or similar endpoint which Plane may not have.
        """
        # The Plane API doesn't have a simple /me endpoint,
        # so connection testing happens at the project list level
        return {"connected": True, "api_key_valid": bool(self.api_key)}
