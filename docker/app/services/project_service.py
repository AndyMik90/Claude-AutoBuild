"""Project management service for Auto-Claude Docker Web UI.

Refactored to use PostgreSQL with user scoping.
"""

import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, List
import shutil

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import Settings
from db.models import Project as ProjectModel, ProjectAgentProfile, ProjectCredentials
from db.models import User, ProjectStatus
from services.git_service import GitService


class ProjectError(Exception):
    """Exception for project errors."""

    def __init__(self, message: str, code: str = "project_error"):
        self.message = message
        self.code = code
        super().__init__(message)


class ProjectService:
    """Service for managing projects with user scoping."""

    def __init__(self, db: AsyncSession, settings: Settings, user: User):
        self.db = db
        self.settings = settings
        self.user = user
        self.git_service = GitService(settings)

    def _get_user_repos_dir(self) -> Path:
        """Get the repos directory for the current user."""
        # Per-user directory: /repos/{user_id}/
        user_dir = self.settings.repos_dir / str(self.user.id)
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir

    async def list_projects(self) -> List[ProjectModel]:
        """List all projects for the current user."""
        result = await self.db.execute(
            select(ProjectModel)
            .where(ProjectModel.owner_id == self.user.id)
            .order_by(ProjectModel.last_accessed.desc())
        )
        return list(result.scalars().all())

    async def get_project(self, project_id: uuid.UUID) -> Optional[ProjectModel]:
        """Get a project by ID (scoped to current user)."""
        result = await self.db.execute(
            select(ProjectModel).where(
                and_(
                    ProjectModel.id == project_id,
                    ProjectModel.owner_id == self.user.id,
                )
            )
        )
        project = result.scalar_one_or_none()

        if project:
            # Update last accessed
            project.last_accessed = datetime.utcnow()
            await self.db.commit()

        return project

    async def get_project_by_name(self, name: str) -> Optional[ProjectModel]:
        """Get a project by name (scoped to current user)."""
        result = await self.db.execute(
            select(ProjectModel).where(
                and_(
                    ProjectModel.name == name,
                    ProjectModel.owner_id == self.user.id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def create_project(
        self,
        repo_url: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> ProjectModel:
        """Create a new project by cloning a repository."""
        # Clone to user's repos directory
        user_repos_dir = self._get_user_repos_dir()

        # Override settings temporarily for git service
        original_repos_dir = self.settings.repos_dir
        self.settings.repos_dir = user_repos_dir

        try:
            result = await self.git_service.clone_repository(repo_url, name=name)
        finally:
            self.settings.repos_dir = original_repos_dir

        if not result.success:
            raise ProjectError(result.error or "Clone failed", "clone_failed")

        # Create project record
        project = ProjectModel(
            name=result.repo_name or name or "unknown",
            repo_url=repo_url,
            path=str(result.path),
            owner_id=self.user.id,
            description=description,
        )
        self.db.add(project)

        # Flush to get the project ID before creating related records
        await self.db.flush()

        # Create default agent profile
        agent_profile = ProjectAgentProfile(
            project_id=project.id,
        )
        self.db.add(agent_profile)

        # Create empty credentials record
        credentials = ProjectCredentials(
            project_id=project.id,
        )
        self.db.add(credentials)

        await self.db.commit()
        await self.db.refresh(project)

        return project

    async def delete_project(
        self,
        project_id: uuid.UUID,
        delete_files: bool = False,
    ) -> bool:
        """Delete a project (scoped to current user)."""
        project = await self.get_project(project_id)
        if not project:
            return False

        # Optionally delete files
        if delete_files:
            project_path = Path(project.path)
            if project_path.exists():
                shutil.rmtree(project_path)

        await self.db.delete(project)
        await self.db.commit()
        return True

    async def update_project_status(
        self,
        project_id: uuid.UUID,
        status: ProjectStatus,
    ) -> Optional[ProjectModel]:
        """Update project status."""
        project = await self.get_project(project_id)
        if not project:
            return None

        project.status = status
        project.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(project)

        return project

    async def update_project(
        self,
        project_id: uuid.UUID,
        name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Optional[ProjectModel]:
        """Update project details."""
        project = await self.get_project(project_id)
        if not project:
            return None

        if name is not None:
            project.name = name
        if description is not None:
            project.description = description

        project.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(project)

        return project

    async def pull_project(self, project_id: uuid.UUID) -> tuple[bool, str]:
        """Pull latest changes for a project."""
        project = await self.get_project(project_id)
        if not project:
            return False, "Project not found"

        project_path = Path(project.path)
        if not project_path.exists():
            return False, "Project directory not found"

        return await self.git_service.pull(project_path)

    async def get_agent_profile(
        self,
        project_id: uuid.UUID,
    ) -> Optional[ProjectAgentProfile]:
        """Get agent profile for a project."""
        project = await self.get_project(project_id)
        if not project:
            return None

        result = await self.db.execute(
            select(ProjectAgentProfile).where(
                ProjectAgentProfile.project_id == project_id
            )
        )
        return result.scalar_one_or_none()

    async def update_agent_profile(
        self,
        project_id: uuid.UUID,
        **updates,
    ) -> Optional[ProjectAgentProfile]:
        """Update agent profile for a project."""
        profile = await self.get_agent_profile(project_id)
        if not profile:
            return None

        for key, value in updates.items():
            if hasattr(profile, key):
                setattr(profile, key, value)

        profile.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(profile)

        return profile

    async def get_credentials(
        self,
        project_id: uuid.UUID,
    ) -> Optional[ProjectCredentials]:
        """Get credentials for a project (without decrypted values)."""
        project = await self.get_project(project_id)
        if not project:
            return None

        result = await self.db.execute(
            select(ProjectCredentials).where(
                ProjectCredentials.project_id == project_id
            )
        )
        return result.scalar_one_or_none()


async def get_project_service(
    db: AsyncSession,
    settings: Settings,
    user: User,
) -> ProjectService:
    """Factory function to create a ProjectService instance."""
    return ProjectService(db, settings, user)
