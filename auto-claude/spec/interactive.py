"""
Interactive Spec Refinement
============================

Enhanced interactive mode for multi-turn spec refinement with AI collaboration.
The AI asks clarifying questions and the user can iterate on spec sections.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Any


class InteractiveRefinement:
    """
    Manages interactive spec refinement sessions.

    Features:
    - Multi-turn conversation with AI
    - AI-generated clarifying questions
    - Section-by-section approval
    - Session persistence for resuming
    """

    def __init__(self, spec_dir: Path, ui_module):
        """
        Initialize interactive refinement session.

        Args:
            spec_dir: Directory for the spec
            ui_module: UI module with formatting functions
        """
        self.spec_dir = spec_dir
        self.ui = ui_module
        self.conversation_history: list[dict[str, str]] = []
        self.draft_sections: dict[str, str] = {}
        self.approved_sections: set[str] = set()
        self.clarifications: list[dict[str, str]] = []

        # Load existing session if resuming
        self._load_session()

    def _get_session_file(self) -> Path:
        """Get path to session file."""
        return self.spec_dir / "interactive_session.json"

    def _load_session(self) -> None:
        """Load existing session if available."""
        session_file = self._get_session_file()
        if session_file.exists():
            with open(session_file) as f:
                data = json.load(f)
            self.conversation_history = data.get("conversation_history", [])
            self.draft_sections = data.get("draft_sections", {})
            self.approved_sections = set(data.get("approved_sections", []))
            self.clarifications = data.get("clarifications", [])

    def save_session(self) -> None:
        """Save current session state."""
        session_file = self._get_session_file()
        with open(session_file, "w") as f:
            json.dump(
                {
                    "conversation_history": self.conversation_history,
                    "draft_sections": self.draft_sections,
                    "approved_sections": list(self.approved_sections),
                    "clarifications": self.clarifications,
                    "updated_at": datetime.now().isoformat(),
                },
                f,
                indent=2,
            )

    def has_existing_session(self) -> bool:
        """Check if there's an existing session to resume."""
        return self._get_session_file().exists()

    def add_user_message(self, message: str) -> None:
        """Add a user message to conversation history."""
        self.conversation_history.append(
            {
                "role": "user",
                "content": message,
                "timestamp": datetime.now().isoformat(),
            }
        )
        self.save_session()

    def add_ai_message(self, message: str) -> None:
        """Add an AI message to conversation history."""
        self.conversation_history.append(
            {
                "role": "assistant",
                "content": message,
                "timestamp": datetime.now().isoformat(),
            }
        )
        self.save_session()

    def add_clarification(self, question: str, answer: str) -> None:
        """Record a clarification Q&A pair."""
        self.clarifications.append(
            {
                "question": question,
                "answer": answer,
                "timestamp": datetime.now().isoformat(),
            }
        )
        self.save_session()

    def update_draft_section(self, section_name: str, content: str) -> None:
        """Update a draft section."""
        self.draft_sections[section_name] = content
        self.save_session()

    def approve_section(self, section_name: str) -> None:
        """Mark a section as approved."""
        self.approved_sections.add(section_name)
        self.save_session()

    def reject_section(self, section_name: str) -> None:
        """Remove approval for a section."""
        self.approved_sections.discard(section_name)
        self.save_session()

    def get_unapproved_sections(self) -> list[str]:
        """Get list of sections not yet approved."""
        all_sections = set(self.draft_sections.keys())
        return list(all_sections - self.approved_sections)

    def all_sections_approved(self) -> bool:
        """Check if all sections are approved."""
        return len(self.draft_sections) > 0 and len(self.get_unapproved_sections()) == 0

    def get_conversation_context(self) -> str:
        """Get conversation history as context string."""
        context_parts = []

        # Add clarifications
        if self.clarifications:
            context_parts.append("Previous Clarifications:")
            for c in self.clarifications:
                context_parts.append(f"Q: {c['question']}")
                context_parts.append(f"A: {c['answer']}")
            context_parts.append("")

        # Add recent conversation
        if self.conversation_history:
            context_parts.append("Conversation History:")
            for msg in self.conversation_history[-10:]:  # Last 10 messages
                role = "User" if msg["role"] == "user" else "AI"
                context_parts.append(f"{role}: {msg['content']}")

        return "\n".join(context_parts)


def generate_clarifying_questions(task_description: str) -> list[str]:
    """
    Generate a list of clarifying questions based on the task.

    This is a heuristic-based approach. In production, these could be
    generated by the AI based on the specific task context.
    """
    questions = []

    # Check for common areas needing clarification
    task_lower = task_description.lower()

    # Scope clarification
    if len(task_description) < 100:
        questions.append(
            "Can you provide more details about the scope of this task? "
            "What specific functionality or behavior are you looking for?"
        )

    # User interaction
    if any(word in task_lower for word in ["user", "frontend", "ui", "page", "form"]):
        questions.append(
            "How should users interact with this feature? "
            "Are there specific user flows or interactions to consider?"
        )

    # Data handling
    if any(
        word in task_lower for word in ["data", "database", "store", "save", "persist"]
    ):
        questions.append(
            "What data needs to be stored or processed? "
            "Are there any existing database schemas or data models to follow?"
        )

    # Integration
    if any(word in task_lower for word in ["api", "endpoint", "integrate", "connect"]):
        questions.append(
            "Are there specific API contracts or integrations to consider? "
            "What systems does this need to interact with?"
        )

    # Error handling
    if not any(
        word in task_lower for word in ["error", "fail", "invalid", "exception"]
    ):
        questions.append(
            "How should errors or edge cases be handled? "
            "Are there specific error scenarios to consider?"
        )

    # Authentication/Authorization
    if any(
        word in task_lower for word in ["user", "auth", "permission", "role", "access"]
    ):
        questions.append(
            "Are there authentication or authorization requirements? "
            "Who should have access to this feature?"
        )

    # Ensure at least 3 questions
    if len(questions) < 3:
        default_questions = [
            "What are the most important acceptance criteria for this feature?",
            "Are there any constraints or limitations to be aware of?",
            "Are there any related features or systems this should integrate with?",
        ]
        for q in default_questions:
            if q not in questions and len(questions) < 3:
                questions.append(q)

    return questions[:5]  # Return max 5 questions


def display_draft_section(
    section_name: str, content: str, ui_module, approved: bool = False
) -> None:
    """Display a draft section with formatting."""
    status = "✓ Approved" if approved else "📝 Draft"
    print()
    print(f"  {ui_module.bold(f'=== {section_name} ===')} [{status}]")
    print()
    for line in content.split("\n"):
        print(f"  {line}")
    print()


def prompt_section_action(ui_module) -> str:
    """Prompt user for action on a section."""
    print(f"  {ui_module.muted('Actions:')}")
    print(f"  {ui_module.muted('[a]pprove - Accept this section')}")
    print(f"  {ui_module.muted('[m]odify  - Request changes')}")
    print(f"  {ui_module.muted('[r]ewrite - Provide your own version')}")
    print(f"  {ui_module.muted('[s]kip    - Review later')}")

    choice = input("  > ").strip().lower()
    return (
        choice
        if choice in ["a", "m", "r", "s", "approve", "modify", "rewrite", "skip"]
        else "s"
    )


def run_interactive_refinement(
    task_description: str,
    spec_dir: Path,
    ui_module,
) -> dict[str, Any]:
    """
    Run an interactive refinement session.

    Args:
        task_description: Initial task description
        spec_dir: Directory for the spec
        ui_module: UI module with formatting functions

    Returns:
        Dictionary with refined requirements and conversation history
    """
    session = InteractiveRefinement(spec_dir, ui_module)

    # Check for existing session
    if session.has_existing_session():
        print()
        print(f"  {ui_module.bold('Found existing refinement session.')}")
        resume = input("  Resume? [Y/n]: ").strip().lower()
        if resume == "n":
            # Start fresh
            session = InteractiveRefinement.__new__(InteractiveRefinement)
            session.__init__(spec_dir, ui_module)
            # Clear session file
            session_file = session._get_session_file()
            if session_file.exists():
                session_file.unlink()

    # Initial message
    session.add_user_message(f"I want to build: {task_description}")

    print()
    print(f"  {ui_module.bold('Interactive Spec Refinement')}")
    print(f"  {ui_module.muted('-' * 40)}")
    print()

    # Generate clarifying questions
    questions = generate_clarifying_questions(task_description)

    print(
        f"  {ui_module.muted('To create a complete spec, I need to understand a few things:')}"
    )
    print()

    # Ask clarifying questions
    for i, question in enumerate(questions, 1):
        print(f"  {ui_module.bold(f'Question {i}:')} {question}")
        print()

        answer = ""
        answer_lines = []
        print(f"  {ui_module.muted('(Enter your answer, blank line when done)')}")
        while True:
            try:
                line = input("  > " if not answer_lines else "    ")
                if not line and answer_lines:
                    break
                if line:
                    answer_lines.append(line)
            except EOFError:
                break

        answer = (
            " ".join(answer_lines).strip() if answer_lines else "No answer provided"
        )
        session.add_clarification(question, answer)
        print()

    # Summary
    print(f"  {ui_module.bold('Great! Here is what I understand:')}")
    print()
    print(f"  {ui_module.muted('Task:')} {task_description}")
    print()
    print(f"  {ui_module.muted('Clarifications:')}")
    for c in session.clarifications:
        print(
            f"  • {c['answer'][:80]}..."
            if len(c["answer"]) > 80
            else f"  • {c['answer']}"
        )
    print()

    # Build enhanced requirements
    requirements = {
        "task_description": task_description,
        "workflow_type": "feature",
        "services_involved": [],
        "clarifications": session.clarifications,
        "conversation_context": session.get_conversation_context(),
        "interactive": True,
        "created_at": datetime.now().isoformat(),
    }

    session.save_session()

    return requirements
