"""
Tests for memory_manager.py integration with MemoryGraph.

These tests verify the parallel operation of MemoryGraph alongside
Graphiti and file-based memory systems.

Key scenarios tested:
1. Fire-and-forget async pattern for MemoryGraph saves
2. Parallel execution - MemoryGraph doesn't block main flow
3. Fallback chain behavior with MemoryGraph running in parallel
4. Enable/disable independence between memory systems
5. Error isolation - MemoryGraph failures don't affect main flow
"""

import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Add auto-claude to path
sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "backend"))

from integrations.memorygraph.config import clear_config_cache


@pytest.fixture(autouse=True)
def reset_config_cache():
    """Clear config cache before each test."""
    clear_config_cache()
    yield
    clear_config_cache()


class TestMemoryGraphFireAndForget:
    """Tests for the fire-and-forget async pattern."""

    @pytest.mark.asyncio
    async def test_memorygraph_save_scheduled_when_enabled(self):
        """MemoryGraph save is scheduled when enabled."""
        with patch.dict(os.environ, {"MEMORYGRAPH_ENABLED": "true"}, clear=True):
            clear_config_cache()

            # Track if the async save function was called
            save_called = asyncio.Event()

            async def mock_save(insights, project_dir):
                save_called.set()

            with patch(
                "integrations.memorygraph.storage.save_to_memorygraph",
                side_effect=mock_save,
            ):
                with patch(
                    "agents.memory_manager.is_graphiti_enabled", return_value=False
                ):
                    with patch("agents.memory_manager.save_file_based_memory"):
                        from agents.memory_manager import save_session_memory

                        result, storage_type = await save_session_memory(
                            spec_dir=Path("/tmp/spec"),
                            project_dir=Path("/tmp/project"),
                            subtask_id="task_1",
                            session_num=1,
                            success=True,
                            subtasks_completed=["task_1"],
                        )

                        # Give async task time to start
                        await asyncio.sleep(0.1)

                        assert result is True
                        assert storage_type == "file"
                        assert save_called.is_set()

    @pytest.mark.asyncio
    async def test_memorygraph_not_called_when_disabled(self):
        """MemoryGraph save is NOT called when disabled."""
        with patch.dict(os.environ, {}, clear=True):
            clear_config_cache()

            save_called = asyncio.Event()

            async def mock_save(insights, project_dir):
                save_called.set()

            with patch(
                "integrations.memorygraph.storage.save_to_memorygraph",
                side_effect=mock_save,
            ):
                with patch(
                    "agents.memory_manager.is_graphiti_enabled", return_value=False
                ):
                    with patch("agents.memory_manager.save_file_based_memory"):
                        from agents.memory_manager import save_session_memory

                        await save_session_memory(
                            spec_dir=Path("/tmp/spec"),
                            project_dir=Path("/tmp/project"),
                            subtask_id="task_1",
                            session_num=1,
                            success=True,
                            subtasks_completed=["task_1"],
                        )

                        await asyncio.sleep(0.1)
                        # Should NOT have been called
                        assert not save_called.is_set()

    @pytest.mark.asyncio
    async def test_memorygraph_failure_does_not_affect_main_result(self):
        """MemoryGraph failure doesn't affect the main save result."""
        with patch.dict(os.environ, {"MEMORYGRAPH_ENABLED": "true"}, clear=True):
            clear_config_cache()

            with patch(
                "integrations.memorygraph.storage.save_to_memorygraph",
                side_effect=Exception("MCP server unavailable"),
            ):
                with patch(
                    "agents.memory_manager.is_graphiti_enabled", return_value=False
                ):
                    with patch("agents.memory_manager.save_file_based_memory"):
                        from agents.memory_manager import save_session_memory

                        result, storage_type = await save_session_memory(
                            spec_dir=Path("/tmp/spec"),
                            project_dir=Path("/tmp/project"),
                            subtask_id="task_1",
                            session_num=1,
                            success=True,
                            subtasks_completed=["task_1"],
                        )

                        # Main save should still succeed
                        assert result is True
                        assert storage_type == "file"


class TestParallelExecutionWithGraphiti:
    """Tests for parallel execution of MemoryGraph with Graphiti."""

    @pytest.mark.asyncio
    async def test_graphiti_returns_without_waiting_for_memorygraph(self):
        """Graphiti returns immediately without waiting for slow MemoryGraph."""
        with patch.dict(
            os.environ,
            {"MEMORYGRAPH_ENABLED": "true"},
            clear=True,
        ):
            clear_config_cache()

            memorygraph_completed = asyncio.Event()

            async def slow_memorygraph_save(insights, project_dir):
                await asyncio.sleep(0.5)  # Simulate slow operation
                memorygraph_completed.set()

            mock_graphiti = MagicMock()
            mock_graphiti.is_enabled = True
            mock_graphiti.save_session_insights = AsyncMock(return_value=True)
            mock_graphiti.close = AsyncMock()

            # Create mock module for graphiti_memory
            mock_graphiti_module = MagicMock()
            mock_graphiti_module.GraphitiMemory = MagicMock(return_value=mock_graphiti)

            with patch(
                "integrations.memorygraph.storage.save_to_memorygraph",
                side_effect=slow_memorygraph_save,
            ):
                with patch(
                    "agents.memory_manager.is_graphiti_enabled", return_value=True
                ):
                    with patch.dict(
                        sys.modules, {"graphiti_memory": mock_graphiti_module}
                    ):
                        from agents.memory_manager import save_session_memory

                        result, storage_type = await save_session_memory(
                            spec_dir=Path("/tmp/spec"),
                            project_dir=Path("/tmp/project"),
                            subtask_id="task_1",
                            session_num=1,
                            success=True,
                            subtasks_completed=["task_1"],
                        )

                        # Graphiti should return immediately
                        assert result is True
                        assert storage_type == "graphiti"

                        # MemoryGraph should NOT have completed yet
                        assert not memorygraph_completed.is_set()


class TestFallbackChainWithMemoryGraph:
    """Tests for fallback chain behavior with MemoryGraph in parallel."""

    @pytest.mark.asyncio
    async def test_graphiti_fails_file_succeeds_memorygraph_still_runs(self):
        """When Graphiti fails, file fallback works and MemoryGraph still runs."""
        with patch.dict(os.environ, {"MEMORYGRAPH_ENABLED": "true"}, clear=True):
            clear_config_cache()

            memorygraph_called = asyncio.Event()

            async def track_memorygraph_call(insights, project_dir):
                memorygraph_called.set()

            mock_graphiti = MagicMock()
            mock_graphiti.is_enabled = True
            mock_graphiti.save_session_insights = AsyncMock(
                side_effect=Exception("Graphiti connection failed")
            )
            mock_graphiti.close = AsyncMock()

            # Create mock module for graphiti_memory
            mock_graphiti_module = MagicMock()
            mock_graphiti_module.GraphitiMemory = MagicMock(return_value=mock_graphiti)

            with patch(
                "integrations.memorygraph.storage.save_to_memorygraph",
                side_effect=track_memorygraph_call,
            ):
                with patch(
                    "agents.memory_manager.is_graphiti_enabled", return_value=True
                ):
                    with patch.dict(
                        sys.modules, {"graphiti_memory": mock_graphiti_module}
                    ):
                        with patch(
                            "agents.memory_manager.save_file_based_memory"
                        ) as mock_file:
                            from agents.memory_manager import save_session_memory

                            result, storage_type = await save_session_memory(
                                spec_dir=Path("/tmp/spec"),
                                project_dir=Path("/tmp/project"),
                                subtask_id="task_1",
                                session_num=1,
                                success=True,
                                subtasks_completed=["task_1"],
                            )

                            # Should fallback to file
                            assert result is True
                            assert storage_type == "file"
                            mock_file.assert_called_once()

                            # Give async task time to complete
                            await asyncio.sleep(0.1)

                            # MemoryGraph should have been called too
                            assert memorygraph_called.is_set()

    @pytest.mark.asyncio
    async def test_all_primary_systems_fail_returns_gracefully(self):
        """When primary systems fail, returns failure without crashing."""
        with patch.dict(os.environ, {"MEMORYGRAPH_ENABLED": "true"}, clear=True):
            clear_config_cache()

            with patch(
                "integrations.memorygraph.storage.save_to_memorygraph",
                side_effect=Exception("MemoryGraph failed"),
            ):
                with patch(
                    "agents.memory_manager.is_graphiti_enabled", return_value=False
                ):
                    with patch(
                        "agents.memory_manager.save_file_based_memory",
                        side_effect=Exception("File save failed"),
                    ):
                        from agents.memory_manager import save_session_memory

                        result, storage_type = await save_session_memory(
                            spec_dir=Path("/tmp/spec"),
                            project_dir=Path("/tmp/project"),
                            subtask_id="task_1",
                            session_num=1,
                            success=True,
                            subtasks_completed=["task_1"],
                        )

                        # Should return failure but not crash
                        assert result is False
                        assert storage_type == "none"


class TestEnableDisableIndependence:
    """Tests for independent enable/disable of memory systems."""

    @pytest.mark.asyncio
    async def test_only_graphiti_when_memorygraph_disabled(self):
        """Only Graphiti saves when MemoryGraph is disabled."""
        with patch.dict(os.environ, {}, clear=True):
            clear_config_cache()

            memorygraph_called = asyncio.Event()

            async def track_call(insights, project_dir):
                memorygraph_called.set()

            mock_graphiti = MagicMock()
            mock_graphiti.is_enabled = True
            mock_graphiti.save_session_insights = AsyncMock(return_value=True)
            mock_graphiti.close = AsyncMock()

            # Create mock module for graphiti_memory
            mock_graphiti_module = MagicMock()
            mock_graphiti_module.GraphitiMemory = MagicMock(return_value=mock_graphiti)

            with patch(
                "integrations.memorygraph.storage.save_to_memorygraph",
                side_effect=track_call,
            ):
                with patch(
                    "agents.memory_manager.is_graphiti_enabled", return_value=True
                ):
                    with patch.dict(
                        sys.modules, {"graphiti_memory": mock_graphiti_module}
                    ):
                        from agents.memory_manager import save_session_memory

                        result, storage_type = await save_session_memory(
                            spec_dir=Path("/tmp/spec"),
                            project_dir=Path("/tmp/project"),
                            subtask_id="task_1",
                            session_num=1,
                            success=True,
                            subtasks_completed=["task_1"],
                        )

                        assert result is True
                        assert storage_type == "graphiti"

                        await asyncio.sleep(0.1)
                        # MemoryGraph should NOT have been called
                        assert not memorygraph_called.is_set()

    @pytest.mark.asyncio
    async def test_file_plus_memorygraph_when_graphiti_disabled(self):
        """File fallback + MemoryGraph when Graphiti disabled."""
        with patch.dict(os.environ, {"MEMORYGRAPH_ENABLED": "true"}, clear=True):
            clear_config_cache()

            memorygraph_called = asyncio.Event()

            async def track_call(insights, project_dir):
                memorygraph_called.set()

            with patch(
                "integrations.memorygraph.storage.save_to_memorygraph",
                side_effect=track_call,
            ):
                with patch(
                    "agents.memory_manager.is_graphiti_enabled", return_value=False
                ):
                    with patch("agents.memory_manager.save_file_based_memory"):
                        from agents.memory_manager import save_session_memory

                        result, storage_type = await save_session_memory(
                            spec_dir=Path("/tmp/spec"),
                            project_dir=Path("/tmp/project"),
                            subtask_id="task_1",
                            session_num=1,
                            success=True,
                            subtasks_completed=["task_1"],
                        )

                        assert result is True
                        assert storage_type == "file"

                        await asyncio.sleep(0.1)
                        assert memorygraph_called.is_set()

    @pytest.mark.asyncio
    async def test_only_file_when_both_disabled(self):
        """Only file-based memory when both Graphiti and MemoryGraph disabled."""
        with patch.dict(os.environ, {}, clear=True):
            clear_config_cache()

            memorygraph_called = asyncio.Event()

            async def track_call(insights, project_dir):
                memorygraph_called.set()

            with patch(
                "integrations.memorygraph.storage.save_to_memorygraph",
                side_effect=track_call,
            ):
                with patch(
                    "agents.memory_manager.is_graphiti_enabled", return_value=False
                ):
                    with patch(
                        "agents.memory_manager.save_file_based_memory"
                    ) as mock_file:
                        from agents.memory_manager import save_session_memory

                        result, storage_type = await save_session_memory(
                            spec_dir=Path("/tmp/spec"),
                            project_dir=Path("/tmp/project"),
                            subtask_id="task_1",
                            session_num=1,
                            success=True,
                            subtasks_completed=["task_1"],
                        )

                        assert result is True
                        assert storage_type == "file"
                        mock_file.assert_called_once()

                        await asyncio.sleep(0.1)
                        # MemoryGraph should NOT have been called
                        assert not memorygraph_called.is_set()


class TestMemoryGraphContextRetrieval:
    """Tests for MemoryGraph context retrieval functions."""

    @pytest.mark.asyncio
    async def test_context_retrieved_when_enabled(self):
        """Retrieves context when MemoryGraph is enabled."""
        with patch.dict(os.environ, {"MEMORYGRAPH_ENABLED": "true"}, clear=True):
            clear_config_cache()

            mock_context = "## Prior Knowledge\n- Fixed auth issue before"

            with patch(
                "integrations.memorygraph.context.get_context_for_subtask",
                new_callable=AsyncMock,
                return_value=mock_context,
            ):
                from agents.memory_manager import get_memorygraph_context

                context = await get_memorygraph_context(
                    project_dir=Path("/tmp/project"),
                    subtask={"id": "task_1", "description": "Fix auth bug"},
                )

                assert context == mock_context

    @pytest.mark.asyncio
    async def test_context_none_when_disabled(self):
        """Returns None when MemoryGraph is disabled."""
        with patch.dict(os.environ, {}, clear=True):
            clear_config_cache()

            from agents.memory_manager import get_memorygraph_context

            context = await get_memorygraph_context(
                project_dir=Path("/tmp/project"),
                subtask={"id": "task_1", "description": "Fix auth bug"},
            )

            assert context is None

    @pytest.mark.asyncio
    async def test_context_none_on_error(self):
        """Returns None on errors without crashing."""
        with patch.dict(os.environ, {"MEMORYGRAPH_ENABLED": "true"}, clear=True):
            clear_config_cache()

            with patch(
                "integrations.memorygraph.context.get_context_for_subtask",
                new_callable=AsyncMock,
                side_effect=Exception("Connection failed"),
            ):
                from agents.memory_manager import get_memorygraph_context

                context = await get_memorygraph_context(
                    project_dir=Path("/tmp/project"),
                    subtask={"id": "task_1", "description": "Fix auth bug"},
                )

                # Should return None, not raise
                assert context is None


class TestMemoryGraphStatusFunctions:
    """Tests for MemoryGraph status functions in memory_manager."""

    def test_is_memorygraph_enabled_false_when_disabled(self):
        """Returns False when MEMORYGRAPH_ENABLED not set."""
        with patch.dict(os.environ, {}, clear=True):
            clear_config_cache()

            from agents.memory_manager import is_memorygraph_enabled

            assert is_memorygraph_enabled() is False

    def test_is_memorygraph_enabled_true_when_set(self):
        """Returns True when MEMORYGRAPH_ENABLED=true."""
        with patch.dict(os.environ, {"MEMORYGRAPH_ENABLED": "true"}, clear=True):
            clear_config_cache()

            from agents.memory_manager import is_memorygraph_enabled

            assert is_memorygraph_enabled() is True

    def test_get_memorygraph_status_returns_config(self):
        """Returns config dict when module available."""
        with patch.dict(
            os.environ,
            {"MEMORYGRAPH_ENABLED": "true", "MEMORYGRAPH_BACKEND": "neo4j"},
            clear=True,
        ):
            clear_config_cache()

            from agents.memory_manager import get_memorygraph_status

            status = get_memorygraph_status()
            assert status["enabled"] is True
            assert status["backend"] == "neo4j"


class TestInsightsDataIntegrity:
    """Tests for verifying insights data is correctly passed to MemoryGraph."""

    @pytest.mark.asyncio
    async def test_insights_contain_expected_fields(self):
        """Verify insights passed to MemoryGraph contain expected fields."""
        with patch.dict(os.environ, {"MEMORYGRAPH_ENABLED": "true"}, clear=True):
            clear_config_cache()

            captured_insights = {}

            async def capture_insights(insights, project_dir):
                captured_insights.update(insights)

            with patch(
                "integrations.memorygraph.storage.save_to_memorygraph",
                side_effect=capture_insights,
            ):
                with patch(
                    "agents.memory_manager.is_graphiti_enabled", return_value=False
                ):
                    with patch("agents.memory_manager.save_file_based_memory"):
                        from agents.memory_manager import save_session_memory

                        await save_session_memory(
                            spec_dir=Path("/tmp/spec"),
                            project_dir=Path("/tmp/project"),
                            subtask_id="task_1",
                            session_num=1,
                            success=True,
                            subtasks_completed=["task_1", "task_2"],
                            discoveries={
                                "patterns_found": ["async pattern"],
                                "gotchas_encountered": ["race condition"],
                            },
                        )

                        await asyncio.sleep(0.1)

                        # Verify structure
                        assert "subtasks_completed" in captured_insights
                        assert "what_worked" in captured_insights
                        assert "what_failed" in captured_insights
                        assert "discoveries" in captured_insights

                        # Verify content
                        assert captured_insights["subtasks_completed"] == [
                            "task_1",
                            "task_2",
                        ]
                        assert "task_1" in captured_insights["what_worked"][0]

    @pytest.mark.asyncio
    async def test_failure_insights_recorded_correctly(self):
        """Verify failure insights are recorded when success=False."""
        with patch.dict(os.environ, {"MEMORYGRAPH_ENABLED": "true"}, clear=True):
            clear_config_cache()

            captured_insights = {}

            async def capture_insights(insights, project_dir):
                captured_insights.update(insights)

            with patch(
                "integrations.memorygraph.storage.save_to_memorygraph",
                side_effect=capture_insights,
            ):
                with patch(
                    "agents.memory_manager.is_graphiti_enabled", return_value=False
                ):
                    with patch("agents.memory_manager.save_file_based_memory"):
                        from agents.memory_manager import save_session_memory

                        await save_session_memory(
                            spec_dir=Path("/tmp/spec"),
                            project_dir=Path("/tmp/project"),
                            subtask_id="task_1",
                            session_num=1,
                            success=False,  # Failed
                            subtasks_completed=[],
                        )

                        await asyncio.sleep(0.1)

                        # Verify failure is recorded
                        assert len(captured_insights["what_worked"]) == 0
                        assert len(captured_insights["what_failed"]) > 0
                        assert "task_1" in captured_insights["what_failed"][0]
