"""Backward compatibility shim - import from analysis.risk_classifier instead."""
from analysis.risk_classifier import (
    RiskClassifier,
    RiskAssessment,
    ValidationRecommendations,
    ComplexityAnalysis,
    ScopeAnalysis,
    IntegrationAnalysis,
    InfrastructureAnalysis,
    KnowledgeAnalysis,
    RiskAnalysis,
    AssessmentFlags,
    load_risk_assessment,
    get_validation_requirements,
)

__all__ = [
    "RiskClassifier",
    "RiskAssessment",
    "ValidationRecommendations",
    "ComplexityAnalysis",
    "ScopeAnalysis",
    "IntegrationAnalysis",
    "InfrastructureAnalysis",
    "KnowledgeAnalysis",
    "RiskAnalysis",
    "AssessmentFlags",
    "load_risk_assessment",
    "get_validation_requirements",
]
