#!/usr/bin/env python3
"""
Tests for Agent Module Structure
================================

Verifies that the agent module refactoring is correct:
1. All modules can be imported
2. All public API functions are accessible
3. Module structure is correct

Note: The backwards compatibility tests for the old agent.py shim have been
removed since the shim files were deleted in the backend code cleanup.
"""

import pytest
from pathlib import Path


class TestAgentModuleImports:
    """Tests for agent module imports."""

    def test_base_module_imports(self):
        """Test that agents.base module can be imported."""
        from agents import base

        assert hasattr(base, "AUTO_CONTINUE_DELAY_SECONDS")
        assert hasattr(base, "HUMAN_INTERVENTION_FILE")

    def test_utils_module_imports(self):
        """Test that agents.utils module can be imported."""
        from agents import utils

        assert hasattr(utils, "get_latest_commit")
        assert hasattr(utils, "load_implementation_plan")

    def test_memory_manager_module_imports(self):
        """Test that agents.memory_manager module can be imported."""
        from agents import memory_manager

        assert hasattr(memory_manager, "save_session_memory")
        assert hasattr(memory_manager, "get_graphiti_context")

    def test_session_module_imports(self):
        """Test that agents.session module can be imported."""
        from agents import session

        assert hasattr(session, "run_agent_session")
        assert hasattr(session, "post_session_processing")

    def test_planner_module_imports(self):
        """Test that agents.planner module can be imported."""
        from agents import planner

        assert hasattr(planner, "run_followup_planner")

    def test_coder_module_imports(self):
        """Test that agents.coder module can be imported."""
        from agents import coder

        assert hasattr(coder, "run_autonomous_agent")


class TestAgentPublicAPI:
    """Tests for agent module public API."""

    def test_run_autonomous_agent_accessible(self):
        """Test run_autonomous_agent is accessible from main module."""
        import agents

        assert hasattr(agents, "run_autonomous_agent")

    def test_run_followup_planner_accessible(self):
        """Test run_followup_planner is accessible from main module."""
        import agents

        assert hasattr(agents, "run_followup_planner")

    def test_save_session_memory_accessible(self):
        """Test save_session_memory is accessible from main module."""
        import agents

        assert hasattr(agents, "save_session_memory")

    def test_get_graphiti_context_accessible(self):
        """Test get_graphiti_context is accessible from main module."""
        import agents

        assert hasattr(agents, "get_graphiti_context")

    def test_run_agent_session_accessible(self):
        """Test run_agent_session is accessible from main module."""
        import agents

        assert hasattr(agents, "run_agent_session")

    def test_post_session_processing_accessible(self):
        """Test post_session_processing is accessible from main module."""
        import agents

        assert hasattr(agents, "post_session_processing")

    def test_get_latest_commit_accessible(self):
        """Test get_latest_commit is accessible from main module."""
        import agents

        assert hasattr(agents, "get_latest_commit")

    def test_load_implementation_plan_accessible(self):
        """Test load_implementation_plan is accessible from main module."""
        import agents

        assert hasattr(agents, "load_implementation_plan")


class TestAgentModuleStructure:
    """Tests for agent module file structure."""

    def test_agents_init_exists(self, agents_dir):
        """Test __init__.py exists in agents directory."""
        assert (agents_dir / "__init__.py").exists()

    def test_agents_base_exists(self, agents_dir):
        """Test base.py exists in agents directory."""
        assert (agents_dir / "base.py").exists()

    def test_agents_utils_exists(self, agents_dir):
        """Test utils.py exists in agents directory."""
        assert (agents_dir / "utils.py").exists()

    def test_agents_memory_manager_exists(self, agents_dir):
        """Test memory_manager.py exists in agents directory."""
        assert (agents_dir / "memory_manager.py").exists()

    def test_agents_session_exists(self, agents_dir):
        """Test session.py exists in agents directory."""
        assert (agents_dir / "session.py").exists()

    def test_agents_planner_exists(self, agents_dir):
        """Test planner.py exists in agents directory."""
        assert (agents_dir / "planner.py").exists()

    def test_agents_coder_exists(self, agents_dir):
        """Test coder.py exists in agents directory."""
        assert (agents_dir / "coder.py").exists()


@pytest.fixture
def agents_dir():
    """Return the path to the agents directory."""
    return Path(__file__).parent.parent.parent / "apps" / "backend" / "agents"
