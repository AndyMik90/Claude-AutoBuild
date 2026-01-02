"""
CrewAI Crews for Auto-Claude.

Available Crews:
- ProductManagementCrew: Transforms user requests into actionable specs
- DevelopmentCrew: Executes technical implementation via Auto-Claude
- QAReleasesCrew: Validates and prepares releases
"""

from .product_management import (
    create_product_management_crew,
    create_product_manager,
    create_requirements_analyst,
    create_priority_analyst,
)
from .development import (
    create_development_crew,
    create_tech_lead,
    create_senior_developer,
    create_code_reviewer,
)
from .qa_release import (
    create_qa_release_crew,
    create_qa_lead,
    create_security_analyst,
    create_release_manager,
)

__all__ = [
    # Product Management Crew
    "create_product_management_crew",
    "create_product_manager",
    "create_requirements_analyst",
    "create_priority_analyst",
    # Development Crew
    "create_development_crew",
    "create_tech_lead",
    "create_senior_developer",
    "create_code_reviewer",
    # QA & Release Crew
    "create_qa_release_crew",
    "create_qa_lead",
    "create_security_analyst",
    "create_release_manager",
]
