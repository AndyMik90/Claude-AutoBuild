"""
Tests for Interactive Spec Refinement
======================================

Tests for the enhanced interactive mode with multi-turn conversation.
"""

import json
import pytest
from pathlib import Path
from unittest.mock import MagicMock

# Add auto-claude to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "auto-claude"))

from spec.interactive import (
    InteractiveRefinement,
    generate_clarifying_questions,
)


class TestInteractiveRefinement:
    """Tests for InteractiveRefinement class."""

    @pytest.fixture
    def mock_ui(self):
        """Create mock UI module."""
        ui = MagicMock()
        ui.bold = MagicMock(return_value="")
        ui.muted = MagicMock(return_value="")
        return ui

    @pytest.fixture
    def temp_spec_dir(self, tmp_path):
        """Create temporary spec directory."""
        spec_dir = tmp_path / "spec"
        spec_dir.mkdir()
        return spec_dir

    def test_init_creates_empty_session(self, temp_spec_dir, mock_ui):
        """New session starts with empty state."""
        session = InteractiveRefinement(temp_spec_dir, mock_ui)
        assert session.conversation_history == []
        assert session.draft_sections == {}
        assert session.approved_sections == set()
        assert session.clarifications == []

    def test_add_user_message(self, temp_spec_dir, mock_ui):
        """Can add user messages."""
        session = InteractiveRefinement(temp_spec_dir, mock_ui)
        session.add_user_message("Hello")

        assert len(session.conversation_history) == 1
        assert session.conversation_history[0]["role"] == "user"
        assert session.conversation_history[0]["content"] == "Hello"

    def test_add_ai_message(self, temp_spec_dir, mock_ui):
        """Can add AI messages."""
        session = InteractiveRefinement(temp_spec_dir, mock_ui)
        session.add_ai_message("Hi there")

        assert len(session.conversation_history) == 1
        assert session.conversation_history[0]["role"] == "assistant"
        assert session.conversation_history[0]["content"] == "Hi there"

    def test_add_clarification(self, temp_spec_dir, mock_ui):
        """Can add clarification Q&A pairs."""
        session = InteractiveRefinement(temp_spec_dir, mock_ui)
        session.add_clarification("What is the scope?", "Just the login page")

        assert len(session.clarifications) == 1
        assert session.clarifications[0]["question"] == "What is the scope?"
        assert session.clarifications[0]["answer"] == "Just the login page"

    def test_save_and_load_session(self, temp_spec_dir, mock_ui):
        """Session persists across instances."""
        # Create session and add data
        session1 = InteractiveRefinement(temp_spec_dir, mock_ui)
        session1.add_user_message("Test message")
        session1.add_clarification("Q?", "A!")
        session1.update_draft_section("overview", "Test overview")
        session1.approve_section("overview")
        session1.save_session()

        # Create new instance - should load saved data
        session2 = InteractiveRefinement(temp_spec_dir, mock_ui)
        assert len(session2.conversation_history) == 1
        assert session2.conversation_history[0]["content"] == "Test message"
        assert len(session2.clarifications) == 1
        assert session2.draft_sections.get("overview") == "Test overview"
        assert "overview" in session2.approved_sections

    def test_has_existing_session(self, temp_spec_dir, mock_ui):
        """Detects existing sessions."""
        session = InteractiveRefinement(temp_spec_dir, mock_ui)
        assert not session.has_existing_session()

        session.add_user_message("Test")
        session.save_session()
        assert session.has_existing_session()

    def test_update_draft_section(self, temp_spec_dir, mock_ui):
        """Can update draft sections."""
        session = InteractiveRefinement(temp_spec_dir, mock_ui)
        session.update_draft_section("requirements", "Must do X")
        session.update_draft_section("requirements", "Must do X and Y")

        assert session.draft_sections["requirements"] == "Must do X and Y"

    def test_approve_section(self, temp_spec_dir, mock_ui):
        """Can approve sections."""
        session = InteractiveRefinement(temp_spec_dir, mock_ui)
        session.update_draft_section("overview", "Overview text")
        session.approve_section("overview")

        assert "overview" in session.approved_sections

    def test_reject_section(self, temp_spec_dir, mock_ui):
        """Can reject (unapprove) sections."""
        session = InteractiveRefinement(temp_spec_dir, mock_ui)
        session.update_draft_section("overview", "Text")
        session.approve_section("overview")
        session.reject_section("overview")

        assert "overview" not in session.approved_sections

    def test_get_unapproved_sections(self, temp_spec_dir, mock_ui):
        """Can get list of unapproved sections."""
        session = InteractiveRefinement(temp_spec_dir, mock_ui)
        session.update_draft_section("s1", "Section 1")
        session.update_draft_section("s2", "Section 2")
        session.update_draft_section("s3", "Section 3")
        session.approve_section("s1")

        unapproved = session.get_unapproved_sections()
        assert "s1" not in unapproved
        assert "s2" in unapproved
        assert "s3" in unapproved

    def test_all_sections_approved(self, temp_spec_dir, mock_ui):
        """Correctly reports when all sections approved."""
        session = InteractiveRefinement(temp_spec_dir, mock_ui)

        # No sections = not all approved
        assert not session.all_sections_approved()

        session.update_draft_section("s1", "Text")
        assert not session.all_sections_approved()

        session.approve_section("s1")
        assert session.all_sections_approved()

        session.update_draft_section("s2", "More text")
        assert not session.all_sections_approved()

    def test_get_conversation_context(self, temp_spec_dir, mock_ui):
        """Can get conversation context as string."""
        session = InteractiveRefinement(temp_spec_dir, mock_ui)
        session.add_clarification("Question?", "Answer!")
        session.add_user_message("Hello")
        session.add_ai_message("Hi")

        context = session.get_conversation_context()
        assert "Question?" in context
        assert "Answer!" in context
        assert "Hello" in context
        assert "Hi" in context


class TestGenerateClarifyingQuestions:
    """Tests for clarifying question generation."""

    def test_generates_questions(self):
        """Generates at least 3 questions."""
        questions = generate_clarifying_questions("Add user authentication")
        assert len(questions) >= 3

    def test_max_five_questions(self):
        """Returns at most 5 questions."""
        questions = generate_clarifying_questions(
            "Build a complete e-commerce platform with user authentication, "
            "product management, shopping cart, payment integration, and admin dashboard"
        )
        assert len(questions) <= 5

    def test_short_description_triggers_scope_question(self):
        """Short descriptions get scope clarification."""
        questions = generate_clarifying_questions("Fix button")
        # Should have a scope/details question
        assert any("scope" in q.lower() or "detail" in q.lower() for q in questions)

    def test_user_related_triggers_interaction_question(self):
        """User-related tasks get interaction questions."""
        questions = generate_clarifying_questions("Add user profile page")
        assert any("interact" in q.lower() or "user" in q.lower() for q in questions)

    def test_data_related_triggers_data_question(self):
        """Data-related tasks get data questions."""
        questions = generate_clarifying_questions("Store user preferences in database")
        assert any("data" in q.lower() or "database" in q.lower() for q in questions)

    def test_api_related_triggers_integration_question(self):
        """API-related tasks get integration questions."""
        questions = generate_clarifying_questions("Create REST API endpoint")
        assert any("api" in q.lower() or "integrat" in q.lower() for q in questions)

    def test_questions_are_unique(self):
        """All generated questions are unique."""
        questions = generate_clarifying_questions("Generic task description")
        assert len(questions) == len(set(questions))


class TestSessionPersistence:
    """Tests for session file persistence."""

    @pytest.fixture
    def mock_ui(self):
        """Create mock UI module."""
        return MagicMock()

    @pytest.fixture
    def temp_spec_dir(self, tmp_path):
        """Create temporary spec directory."""
        spec_dir = tmp_path / "spec"
        spec_dir.mkdir()
        return spec_dir

    def test_session_file_location(self, temp_spec_dir, mock_ui):
        """Session file is in spec directory."""
        session = InteractiveRefinement(temp_spec_dir, mock_ui)
        assert session._get_session_file() == temp_spec_dir / "interactive_session.json"

    def test_session_file_is_valid_json(self, temp_spec_dir, mock_ui):
        """Session file contains valid JSON."""
        session = InteractiveRefinement(temp_spec_dir, mock_ui)
        session.add_user_message("Test")
        session.save_session()

        session_file = session._get_session_file()
        with open(session_file) as f:
            data = json.load(f)

        assert "conversation_history" in data
        assert "draft_sections" in data
        assert "approved_sections" in data

    def test_session_includes_timestamp(self, temp_spec_dir, mock_ui):
        """Session file includes update timestamp."""
        session = InteractiveRefinement(temp_spec_dir, mock_ui)
        session.add_user_message("Test")
        session.save_session()

        session_file = session._get_session_file()
        with open(session_file) as f:
            data = json.load(f)

        assert "updated_at" in data
