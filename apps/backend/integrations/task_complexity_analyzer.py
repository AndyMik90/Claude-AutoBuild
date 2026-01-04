"""
Task Complexity Analyzer

Analyzes tasks to estimate their complexity level for routing decisions.
Uses multiple heuristics and optionally a fast LLM for better estimation.

Complexity Levels:
- TRIVIAL: Simple edits, formatting, comments (~1-10 lines)
- SIMPLE: Single-file changes, small features (~10-50 lines)
- MODERATE: Multi-file changes, medium features (~50-200 lines)
- COMPLEX: Architecture changes, large features (~200-1000 lines)
- EXPERT: System design, critical refactoring (1000+ lines)
"""

import os
import re
import logging
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List, Tuple
from enum import Enum

from .execution_modes import TaskComplexity

logger = logging.getLogger(__name__)


@dataclass
class ComplexityFactors:
    """Factors that contribute to task complexity."""
    
    # Scope factors
    estimated_files: int = 1
    estimated_lines: int = 10
    estimated_functions: int = 1
    
    # Technical factors
    requires_architecture_change: bool = False
    requires_database_change: bool = False
    requires_api_change: bool = False
    requires_security_review: bool = False
    requires_testing: bool = False
    
    # Domain factors
    involves_concurrency: bool = False
    involves_state_management: bool = False
    involves_external_apis: bool = False
    involves_authentication: bool = False
    involves_performance_optimization: bool = False
    
    # Context factors
    codebase_familiarity: float = 0.5  # 0-1, how familiar the model is with codebase
    documentation_available: bool = True
    existing_tests: bool = False
    
    # Risk factors
    touches_critical_path: bool = False
    backward_compatibility_required: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "estimated_files": self.estimated_files,
            "estimated_lines": self.estimated_lines,
            "estimated_functions": self.estimated_functions,
            "requires_architecture_change": self.requires_architecture_change,
            "requires_database_change": self.requires_database_change,
            "requires_api_change": self.requires_api_change,
            "requires_security_review": self.requires_security_review,
            "requires_testing": self.requires_testing,
            "involves_concurrency": self.involves_concurrency,
            "involves_state_management": self.involves_state_management,
            "involves_external_apis": self.involves_external_apis,
            "involves_authentication": self.involves_authentication,
            "involves_performance_optimization": self.involves_performance_optimization,
            "codebase_familiarity": self.codebase_familiarity,
            "documentation_available": self.documentation_available,
            "existing_tests": self.existing_tests,
            "touches_critical_path": self.touches_critical_path,
            "backward_compatibility_required": self.backward_compatibility_required,
        }


@dataclass
class ComplexityAnalysis:
    """Result of complexity analysis."""
    complexity: TaskComplexity
    confidence: float  # 0-1
    factors: ComplexityFactors
    reasoning: str
    warnings: List[str] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)
    
    # Scoring breakdown
    scope_score: float = 0.0
    technical_score: float = 0.0
    domain_score: float = 0.0
    risk_score: float = 0.0
    total_score: float = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "complexity": self.complexity.value,
            "confidence": self.confidence,
            "factors": self.factors.to_dict(),
            "reasoning": self.reasoning,
            "warnings": self.warnings,
            "suggestions": self.suggestions,
            "scores": {
                "scope": self.scope_score,
                "technical": self.technical_score,
                "domain": self.domain_score,
                "risk": self.risk_score,
                "total": self.total_score,
            },
        }


# Keywords and patterns for complexity detection
COMPLEXITY_PATTERNS = {
    # Architecture keywords (high complexity)
    "architecture": [
        r"\barchitecture\b", r"\brefactor\b", r"\bredesign\b", r"\bmigrat[ei]",
        r"\boverhaul\b", r"\brewrite\b", r"\bmodular", r"\bmicroservice",
        r"\bmonolith", r"\bscalability\b", r"\binfrastructure\b",
    ],
    
    # Database keywords (moderate-high complexity)
    "database": [
        r"\bdatabase\b", r"\bschema\b", r"\bmigration\b", r"\bsql\b",
        r"\borm\b", r"\bquery\b", r"\bindex", r"\btable\b", r"\bforeign.?key",
        r"\btransaction", r"\brollback\b",
    ],
    
    # API keywords (moderate complexity)
    "api": [
        r"\bapi\b", r"\bendpoint\b", r"\brest\b", r"\bgraphql\b",
        r"\bwebhook\b", r"\bwebsocket\b", r"\bgrpc\b", r"\bopenapi\b",
    ],
    
    # Security keywords (high complexity)
    "security": [
        r"\bsecurity\b", r"\bauth", r"\bencrypt", r"\bdecrypt",
        r"\btoken\b", r"\bjwt\b", r"\boauth\b", r"\bpermission",
        r"\baccess.?control", r"\bvulnerabil", r"\bsanitiz",
    ],
    
    # Concurrency keywords (high complexity)
    "concurrency": [
        r"\basync\b", r"\bawait\b", r"\bthread", r"\bparallel",
        r"\bconcurren", r"\block\b", r"\bmutex\b", r"\bsemaphore",
        r"\brace.?condition", r"\bdeadlock",
    ],
    
    # State management keywords (moderate complexity)
    "state": [
        r"\bstate\b", r"\bredux\b", r"\bvuex\b", r"\bmobx\b",
        r"\bcontext\b", r"\bprovider\b", r"\bstore\b", r"\bcache\b",
    ],
    
    # Testing keywords (adds complexity)
    "testing": [
        r"\btest\b", r"\bunit.?test", r"\bintegration.?test",
        r"\be2e\b", r"\bcoverage\b", r"\bmock\b", r"\bstub\b",
    ],
    
    # Simple task keywords (low complexity)
    "simple": [
        r"\bfix\s+typo", r"\bupdate\s+comment", r"\brename\b",
        r"\bformat", r"\blint", r"\bstyle\b", r"\bcleanup\b",
        r"\bremove\s+unused", r"\badd\s+comment",
    ],
    
    # Performance keywords (moderate-high complexity)
    "performance": [
        r"\bperformance\b", r"\boptimiz", r"\bprofile\b",
        r"\bbenchmark\b", r"\blatency\b", r"\bthroughput\b",
        r"\bmemory.?leak", r"\bcache\b",
    ],
}

# File count patterns
FILE_COUNT_PATTERNS = [
    (r"\ball\s+files?\b", 10),
    (r"\bmultiple\s+files?\b", 5),
    (r"\bseveral\s+files?\b", 4),
    (r"\bfew\s+files?\b", 3),
    (r"\bcouple\s+files?\b", 2),
    (r"\bsingle\s+file\b", 1),
    (r"\bone\s+file\b", 1),
    (r"\bacross\s+the\s+codebase\b", 20),
    (r"\bproject.?wide\b", 15),
]


class TaskComplexityAnalyzer:
    """
    Analyzes task descriptions to estimate complexity.
    
    Uses a combination of:
    - Keyword pattern matching
    - Heuristic scoring
    - Optional LLM-based analysis for higher accuracy
    """
    
    def __init__(self, use_llm: bool = False, llm_model: str = "ollama:llama3.2:3b"):
        self.use_llm = use_llm
        self.llm_model = llm_model
    
    def analyze(
        self,
        task_description: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> ComplexityAnalysis:
        """
        Analyze a task description to estimate complexity.
        
        Args:
            task_description: The task description or prompt
            context: Optional context (file list, codebase info, etc.)
        
        Returns:
            ComplexityAnalysis with estimated complexity and factors
        """
        context = context or {}
        
        # Extract factors from description
        factors = self._extract_factors(task_description, context)
        
        # Calculate scores
        scope_score = self._calculate_scope_score(factors)
        technical_score = self._calculate_technical_score(factors)
        domain_score = self._calculate_domain_score(factors)
        risk_score = self._calculate_risk_score(factors)
        
        total_score = (
            scope_score * 0.3 +
            technical_score * 0.3 +
            domain_score * 0.25 +
            risk_score * 0.15
        )
        
        # Map score to complexity level
        complexity = self._score_to_complexity(total_score)
        
        # Calculate confidence
        confidence = self._calculate_confidence(task_description, factors)
        
        # Generate reasoning
        reasoning = self._generate_reasoning(complexity, factors, total_score)
        
        # Generate warnings and suggestions
        warnings = self._generate_warnings(complexity, factors)
        suggestions = self._generate_suggestions(complexity, factors)
        
        return ComplexityAnalysis(
            complexity=complexity,
            confidence=confidence,
            factors=factors,
            reasoning=reasoning,
            warnings=warnings,
            suggestions=suggestions,
            scope_score=scope_score,
            technical_score=technical_score,
            domain_score=domain_score,
            risk_score=risk_score,
            total_score=total_score,
        )
    
    def _extract_factors(
        self,
        description: str,
        context: Dict[str, Any],
    ) -> ComplexityFactors:
        """Extract complexity factors from description and context."""
        desc_lower = description.lower()
        
        factors = ComplexityFactors()
        
        # Estimate file count
        factors.estimated_files = self._estimate_file_count(desc_lower, context)
        
        # Estimate line count (rough heuristic)
        factors.estimated_lines = self._estimate_line_count(desc_lower, factors.estimated_files)
        
        # Detect technical requirements
        factors.requires_architecture_change = self._matches_patterns(desc_lower, "architecture")
        factors.requires_database_change = self._matches_patterns(desc_lower, "database")
        factors.requires_api_change = self._matches_patterns(desc_lower, "api")
        factors.requires_security_review = self._matches_patterns(desc_lower, "security")
        factors.requires_testing = self._matches_patterns(desc_lower, "testing")
        
        # Detect domain complexity
        factors.involves_concurrency = self._matches_patterns(desc_lower, "concurrency")
        factors.involves_state_management = self._matches_patterns(desc_lower, "state")
        factors.involves_external_apis = self._matches_patterns(desc_lower, "api")
        factors.involves_authentication = self._matches_patterns(desc_lower, "security")
        factors.involves_performance_optimization = self._matches_patterns(desc_lower, "performance")
        
        # Context-based factors
        if context.get("files"):
            factors.estimated_files = max(factors.estimated_files, len(context["files"]))
        
        factors.codebase_familiarity = context.get("familiarity", 0.5)
        factors.documentation_available = context.get("has_docs", True)
        factors.existing_tests = context.get("has_tests", False)
        
        # Risk factors
        factors.touches_critical_path = any(
            keyword in desc_lower
            for keyword in ["critical", "production", "core", "main", "essential"]
        )
        factors.backward_compatibility_required = any(
            keyword in desc_lower
            for keyword in ["backward", "compatible", "legacy", "deprecat"]
        )
        
        return factors
    
    def _matches_patterns(self, text: str, category: str) -> bool:
        """Check if text matches any patterns in category."""
        patterns = COMPLEXITY_PATTERNS.get(category, [])
        return any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)
    
    def _estimate_file_count(self, description: str, context: Dict[str, Any]) -> int:
        """Estimate number of files affected."""
        # Check context first
        if context.get("files"):
            return len(context["files"])
        
        # Check patterns
        for pattern, count in FILE_COUNT_PATTERNS:
            if re.search(pattern, description, re.IGNORECASE):
                return count
        
        # Default based on description length and complexity keywords
        base_count = 1
        if len(description) > 500:
            base_count = 3
        elif len(description) > 200:
            base_count = 2
        
        # Adjust for complexity keywords
        if self._matches_patterns(description, "architecture"):
            base_count = max(base_count, 10)
        elif self._matches_patterns(description, "database"):
            base_count = max(base_count, 5)
        
        return base_count
    
    def _estimate_line_count(self, description: str, file_count: int) -> int:
        """Estimate lines of code to be changed."""
        # Simple heuristic based on file count and description
        base_lines = file_count * 30  # Average 30 lines per file
        
        # Adjust based on keywords
        if self._matches_patterns(description, "simple"):
            return max(5, base_lines // 3)
        elif self._matches_patterns(description, "architecture"):
            return base_lines * 3
        
        return base_lines
    
    def _calculate_scope_score(self, factors: ComplexityFactors) -> float:
        """Calculate scope-based complexity score (0-1)."""
        score = 0.0
        
        # File count contribution
        if factors.estimated_files <= 1:
            score += 0.1
        elif factors.estimated_files <= 3:
            score += 0.3
        elif factors.estimated_files <= 10:
            score += 0.6
        else:
            score += 1.0
        
        # Line count contribution
        if factors.estimated_lines <= 20:
            score += 0.1
        elif factors.estimated_lines <= 100:
            score += 0.3
        elif factors.estimated_lines <= 500:
            score += 0.6
        else:
            score += 1.0
        
        return min(1.0, score / 2)
    
    def _calculate_technical_score(self, factors: ComplexityFactors) -> float:
        """Calculate technical complexity score (0-1)."""
        score = 0.0
        
        if factors.requires_architecture_change:
            score += 0.4
        if factors.requires_database_change:
            score += 0.3
        if factors.requires_api_change:
            score += 0.2
        if factors.requires_security_review:
            score += 0.3
        if factors.requires_testing:
            score += 0.1
        
        return min(1.0, score)
    
    def _calculate_domain_score(self, factors: ComplexityFactors) -> float:
        """Calculate domain complexity score (0-1)."""
        score = 0.0
        
        if factors.involves_concurrency:
            score += 0.4
        if factors.involves_state_management:
            score += 0.2
        if factors.involves_external_apis:
            score += 0.2
        if factors.involves_authentication:
            score += 0.3
        if factors.involves_performance_optimization:
            score += 0.3
        
        # Reduce score if good context available
        if factors.documentation_available:
            score *= 0.9
        if factors.existing_tests:
            score *= 0.9
        if factors.codebase_familiarity > 0.7:
            score *= 0.8
        
        return min(1.0, score)
    
    def _calculate_risk_score(self, factors: ComplexityFactors) -> float:
        """Calculate risk-based complexity score (0-1)."""
        score = 0.0
        
        if factors.touches_critical_path:
            score += 0.5
        if factors.backward_compatibility_required:
            score += 0.3
        if factors.requires_security_review:
            score += 0.2
        
        return min(1.0, score)
    
    def _score_to_complexity(self, score: float) -> TaskComplexity:
        """Map total score to complexity level."""
        if score < 0.15:
            return TaskComplexity.TRIVIAL
        elif score < 0.35:
            return TaskComplexity.SIMPLE
        elif score < 0.55:
            return TaskComplexity.MODERATE
        elif score < 0.75:
            return TaskComplexity.COMPLEX
        else:
            return TaskComplexity.EXPERT
    
    def _calculate_confidence(
        self,
        description: str,
        factors: ComplexityFactors,
    ) -> float:
        """Calculate confidence in the complexity estimate."""
        confidence = 0.7  # Base confidence
        
        # More description = more confidence
        if len(description) > 200:
            confidence += 0.1
        if len(description) > 500:
            confidence += 0.1
        
        # Clear indicators increase confidence
        if self._matches_patterns(description.lower(), "simple"):
            confidence += 0.1
        if self._matches_patterns(description.lower(), "architecture"):
            confidence += 0.1
        
        # Reduce confidence for ambiguous cases
        if factors.estimated_files == 1 and factors.requires_architecture_change:
            confidence -= 0.1
        
        return min(0.95, max(0.3, confidence))
    
    def _generate_reasoning(
        self,
        complexity: TaskComplexity,
        factors: ComplexityFactors,
        score: float,
    ) -> str:
        """Generate human-readable reasoning for the complexity estimate."""
        reasons = []
        
        # Scope reasoning
        if factors.estimated_files > 5:
            reasons.append(f"affects ~{factors.estimated_files} files")
        elif factors.estimated_files > 1:
            reasons.append(f"touches {factors.estimated_files} files")
        
        # Technical reasoning
        if factors.requires_architecture_change:
            reasons.append("involves architecture changes")
        if factors.requires_database_change:
            reasons.append("requires database modifications")
        if factors.requires_security_review:
            reasons.append("needs security review")
        
        # Domain reasoning
        if factors.involves_concurrency:
            reasons.append("involves concurrent operations")
        if factors.involves_authentication:
            reasons.append("touches authentication")
        
        # Risk reasoning
        if factors.touches_critical_path:
            reasons.append("affects critical code paths")
        
        if not reasons:
            reasons.append("standard task with typical scope")
        
        return f"Estimated as {complexity.value} because: {', '.join(reasons)}."
    
    def _generate_warnings(
        self,
        complexity: TaskComplexity,
        factors: ComplexityFactors,
    ) -> List[str]:
        """Generate warnings based on complexity analysis."""
        warnings = []
        
        if complexity in [TaskComplexity.COMPLEX, TaskComplexity.EXPERT]:
            if not factors.existing_tests:
                warnings.append("Consider adding tests for this complex change")
            if factors.touches_critical_path:
                warnings.append("This change affects critical code - extra review recommended")
        
        if factors.requires_security_review:
            warnings.append("Security-sensitive change - ensure proper review")
        
        if factors.involves_concurrency:
            warnings.append("Concurrent code requires careful testing for race conditions")
        
        return warnings
    
    def _generate_suggestions(
        self,
        complexity: TaskComplexity,
        factors: ComplexityFactors,
    ) -> List[str]:
        """Generate suggestions based on complexity analysis."""
        suggestions = []
        
        if complexity == TaskComplexity.EXPERT:
            suggestions.append("Consider breaking this into smaller tasks")
            suggestions.append("Use Claude for best results on complex tasks")
        
        if complexity == TaskComplexity.COMPLEX and not factors.documentation_available:
            suggestions.append("Add documentation for the changes")
        
        if factors.estimated_files > 10:
            suggestions.append("Consider a phased implementation approach")
        
        if complexity in [TaskComplexity.TRIVIAL, TaskComplexity.SIMPLE]:
            suggestions.append("Good candidate for local Ollama execution")
        
        return suggestions


# Global instance
_analyzer: Optional[TaskComplexityAnalyzer] = None


def get_complexity_analyzer() -> TaskComplexityAnalyzer:
    """Get or create the global complexity analyzer."""
    global _analyzer
    if _analyzer is None:
        _analyzer = TaskComplexityAnalyzer()
    return _analyzer


def analyze_task_complexity(
    description: str,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Analyze task complexity (convenience function)."""
    analyzer = get_complexity_analyzer()
    result = analyzer.analyze(description, context)
    return result.to_dict()
