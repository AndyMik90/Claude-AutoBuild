"""
Continuous Roadmap Runner
=========================

Wraps the RoadmapOrchestrator to provide continuous autonomous research mode.
Cycles through research phases (SOTA LLM, competitor analysis, performance, UI/UX,
feature discovery), accumulating findings and maintaining a priority-ranked feature queue.

Usage:
    python continuous_roadmap_runner.py --project /path/to/project --duration 8
    python continuous_roadmap_runner.py --project /path/to/project --resume
"""

import asyncio
import json
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Load .env file with centralized error handling
from cli.utils import import_dotenv

load_dotenv = import_dotenv()

env_file = Path(__file__).parent.parent / ".env"
if env_file.exists():
    load_dotenv(env_file)

from client import create_client
from debug import debug, debug_error, debug_section, debug_success, debug_warning
from init import init_auto_claude_dir
from phase_config import get_thinking_budget
from ui import Icons, box, icon, muted, print_section, print_status

from roadmap import RoadmapOrchestrator
from roadmap.competitor_analyzer import CompetitorAnalyzer
from roadmap.continuous_state import (
    RESEARCH_PHASE_CYCLE,
    ContinuousResearchState,
    RebalanceTrigger,
    ResearchFeature,
    ResearchFinding,
    ResearchPhase,
)
from roadmap.executor import AgentExecutor, ScriptExecutor
from roadmap.models import RoadmapPhaseResult
from roadmap.priority_scorer import (
    calculate_priority,
    get_priority_level,
    recalculate_priorities,
    sort_by_priority,
)


class ContinuousRoadmapRunner:
    """
    Continuous autonomous research runner for roadmap generation.

    Cycles through research phases, accumulating features and findings
    across multiple iterations. Supports persistence for resume capability
    after interruptions.
    """

    def __init__(
        self,
        project_dir: Path,
        output_dir: Path | None = None,
        model: str = "sonnet",
        thinking_level: str = "medium",
        duration_hours: float = 8.0,
        on_progress: Callable[[dict[str, Any]], None] | None = None,
    ):
        """
        Initialize the continuous roadmap runner.

        Args:
            project_dir: Path to the project directory
            output_dir: Optional output directory (defaults to .auto-claude/roadmap)
            model: Model to use for agents (haiku, sonnet, opus)
            thinking_level: Thinking level for extended reasoning
            duration_hours: Target duration for research session
            on_progress: Optional callback for progress updates
        """
        self.project_dir = Path(project_dir)
        self.model = model
        self.thinking_level = thinking_level
        self.thinking_budget = get_thinking_budget(thinking_level)
        self.duration_hours = duration_hours
        self.on_progress = on_progress

        # Initialize output directory
        if output_dir:
            self.output_dir = Path(output_dir)
        else:
            init_auto_claude_dir(self.project_dir)
            self.output_dir = self.project_dir / ".auto-claude" / "roadmap"

        self.output_dir.mkdir(parents=True, exist_ok=True)

        # State directory for continuous research
        self.state_dir = self.output_dir

        # Initialize executors
        self.script_executor = ScriptExecutor(self.project_dir)
        self.agent_executor = AgentExecutor(
            self.project_dir,
            self.output_dir,
            self.model,
            create_client,
            self.thinking_budget,
        )

        # Initialize competitor analyzer for reuse
        self.competitor_analyzer = CompetitorAnalyzer(
            self.output_dir,
            refresh=True,  # Always refresh in continuous mode
            agent_executor=self.agent_executor,
        )

        # Stop flag for graceful shutdown
        self._stop_requested = False

        # Load or create state
        self.state = ContinuousResearchState.load(self.state_dir)

        debug_section("continuous_roadmap", "Continuous Roadmap Runner Initialized")
        debug(
            "continuous_roadmap",
            "Configuration",
            project_dir=str(self.project_dir),
            output_dir=str(self.output_dir),
            model=self.model,
            duration_hours=duration_hours,
        )

    async def run(self, resume: bool = False) -> bool:
        """
        Run the continuous research loop.

        Args:
            resume: If True, resume from saved state; otherwise start fresh

        Returns:
            True if completed successfully or stopped gracefully
        """
        debug_section("continuous_roadmap", "Starting Continuous Research")

        # Handle resume vs fresh start
        if resume and self.state.is_running:
            debug("continuous_roadmap", "Resuming from saved state")
            print_status(
                f"Resuming from iteration {self.state.iteration_count}, "
                f"phase: {self.state.current_phase}",
                "info",
            )
        else:
            # Start fresh
            self.state.start(self.duration_hours)
            self.state.save(self.state_dir)
            debug("continuous_roadmap", "Starting fresh research session")

        self._print_start_banner()
        self._emit_progress("started")

        try:
            # Run initial setup if first iteration
            if self.state.iteration_count <= 1:
                success = await self._run_initial_setup()
                if not success:
                    debug_error("continuous_roadmap", "Initial setup failed")
                    return False

            # Main research loop
            while self.state.should_continue() and not self._stop_requested:
                await self._run_research_iteration()

                # Check for scheduled rebalancing
                if self.state.needs_rebalance():
                    await self._rebalance_priorities(RebalanceTrigger.SCHEDULED)

                # Save state after each iteration
                self.state.save(self.state_dir)
                self._emit_progress("iteration_complete")

            # Graceful stop
            self.state.stop()
            self.state.save(self.state_dir)
            self._print_summary()
            self._emit_progress("completed")

            debug_success("continuous_roadmap", "Research session completed")
            return True

        except KeyboardInterrupt:
            debug_warning("continuous_roadmap", "Research interrupted by user")
            self.state.stop()
            self.state.save(self.state_dir)
            self._emit_progress("interrupted")
            return True

        except Exception as e:
            debug_error("continuous_roadmap", "Research failed", error=str(e))
            self.state.record_error(str(e))
            self.state.save(self.state_dir)
            self._emit_progress("error", {"error": str(e)})
            return False

    def stop(self) -> None:
        """Request graceful stop of the research loop."""
        debug("continuous_roadmap", "Stop requested")
        self._stop_requested = True

    async def _run_initial_setup(self) -> bool:
        """Run initial project analysis and discovery."""
        debug("continuous_roadmap", "Running initial setup")
        print_section("INITIAL SETUP", Icons.FOLDER)

        # Use the standard RoadmapOrchestrator for initial setup
        orchestrator = RoadmapOrchestrator(
            project_dir=self.project_dir,
            output_dir=self.output_dir,
            model=self.model,
            thinking_level=self.thinking_level,
            refresh=False,  # Use existing if available
            enable_competitor_analysis=True,
        )

        success = await orchestrator.run()

        if success:
            # Load existing features into state
            await self._load_existing_features()
            debug_success("continuous_roadmap", "Initial setup complete")

        return success

    async def _load_existing_features(self) -> None:
        """Load features from existing roadmap.json into state."""
        roadmap_file = self.output_dir / "roadmap.json"
        if not roadmap_file.exists():
            return

        try:
            with open(roadmap_file, "r", encoding="utf-8") as f:
                roadmap = json.load(f)

            features = roadmap.get("features", [])
            for feature in features:
                # Add priority scoring if not present
                if "priority_score" not in feature:
                    feature["priority_score"] = calculate_priority(
                        acceleration=feature.get("acceleration", 50.0),
                        impact=feature.get("impact", 50.0),
                        feasibility=feature.get("feasibility", 50.0),
                        strategic_alignment=feature.get("strategic_alignment", 50.0),
                        dependency=feature.get("dependency", 50.0),
                    )
                    feature["priority_level"] = get_priority_level(
                        feature["priority_score"]
                    ).value

                # Add to state
                self.state.add_feature(feature)

            debug(
                "continuous_roadmap",
                f"Loaded {len(features)} existing features",
            )

        except (json.JSONDecodeError, OSError) as e:
            debug_warning("continuous_roadmap", f"Could not load existing features: {e}")

    async def _run_research_iteration(self) -> None:
        """Run a single iteration through all research phases."""
        debug(
            "continuous_roadmap",
            f"Starting iteration {self.state.iteration_count}",
        )
        print_section(
            f"ITERATION {self.state.iteration_count}",
            Icons.SUBTASK,
        )

        for phase in RESEARCH_PHASE_CYCLE:
            if self._stop_requested:
                break

            self.state.current_phase = phase.value
            self.state.phase_started_at = datetime.utcnow().isoformat()
            self.state.save(self.state_dir)

            self._emit_progress("phase_started", {"phase": phase.value})

            result = await self._run_phase(phase)

            if result.success:
                debug_success(
                    "continuous_roadmap",
                    f"Phase {phase.value} complete",
                )
            else:
                debug_warning(
                    "continuous_roadmap",
                    f"Phase {phase.value} had issues",
                    errors=result.errors,
                )
                # Record errors but continue (graceful degradation)
                for err in result.errors:
                    self.state.record_error(f"{phase.value}: {err}")

            self._emit_progress("phase_complete", {"phase": phase.value})

        # Advance iteration counter
        self.state.advance_phase()

    async def _run_phase(self, phase: ResearchPhase) -> RoadmapPhaseResult:
        """
        Run a specific research phase.

        Args:
            phase: The research phase to run

        Returns:
            RoadmapPhaseResult with success status and any findings
        """
        debug("continuous_roadmap", f"Running phase: {phase.value}")
        print_status(f"Running {phase.value.replace('_', ' ').title()}...", "progress")

        if phase == ResearchPhase.SOTA_LLM:
            return await self._run_sota_llm_research()
        elif phase == ResearchPhase.COMPETITOR_ANALYSIS:
            return await self._run_competitor_analysis()
        elif phase == ResearchPhase.PERFORMANCE_IMPROVEMENTS:
            return await self._run_performance_research()
        elif phase == ResearchPhase.UI_UX_IMPROVEMENTS:
            return await self._run_uiux_research()
        elif phase == ResearchPhase.FEATURE_DISCOVERY:
            return await self._run_feature_discovery()
        else:
            return RoadmapPhaseResult(phase.value, True, [], [], 0)

    async def _run_sota_llm_research(self) -> RoadmapPhaseResult:
        """Research state-of-the-art LLM developments that could enhance the project."""
        context = f"""
**Research Task**: State-of-the-Art LLM Developments

Research the latest LLM developments, techniques, and libraries that could benefit this project.
Focus on:
1. New Claude/GPT/LLM features and capabilities
2. Emerging prompt engineering techniques
3. New agent frameworks and patterns
4. Performance optimizations for LLM applications
5. Cost reduction strategies

**Project Discovery**: {self.output_dir / "roadmap_discovery.json"}
**Project Index**: {self.output_dir / "project_index.json"}

Output findings as JSON to: {self.output_dir / "sota_llm_findings.json"}

Include for each finding:
- title: Brief title
- description: Detailed description
- applicability: How it applies to this project
- impact_estimate: low/medium/high
- source: Where you found this information
"""
        success, output = await self.agent_executor.run_agent(
            "roadmap_discovery.md",
            additional_context=context,
        )

        # Extract findings and convert to features
        if success:
            await self._extract_findings_to_features(
                "sota_llm_findings.json",
                ResearchPhase.SOTA_LLM.value,
            )

        return RoadmapPhaseResult(
            ResearchPhase.SOTA_LLM.value,
            success,
            [str(self.output_dir / "sota_llm_findings.json")],
            [] if success else [output],
            0,
        )

    async def _run_competitor_analysis(self) -> RoadmapPhaseResult:
        """Run competitor analysis phase."""
        # Reuse the existing competitor analyzer
        result = await self.competitor_analyzer.analyze(enabled=True)

        # Extract competitor insights as features
        if result.success:
            await self._extract_competitor_features()

        return result

    async def _run_performance_research(self) -> RoadmapPhaseResult:
        """Research performance improvement opportunities."""
        context = f"""
**Research Task**: Performance Improvement Analysis

Analyze the project for performance improvement opportunities.
Focus on:
1. Code profiling opportunities
2. Caching strategies
3. Database/query optimizations
4. Memory usage improvements
5. Async/parallel processing opportunities
6. Build and deployment optimizations

**Project Index**: {self.output_dir / "project_index.json"}

Output findings as JSON to: {self.output_dir / "performance_findings.json"}

Include for each finding:
- title: Brief title
- description: What to improve
- current_state: How it works now (if known)
- proposed_improvement: Specific improvement
- estimated_impact: Quantified impact if possible
- complexity: low/medium/high
"""
        success, output = await self.agent_executor.run_agent(
            "roadmap_features.md",
            additional_context=context,
        )

        if success:
            await self._extract_findings_to_features(
                "performance_findings.json",
                ResearchPhase.PERFORMANCE_IMPROVEMENTS.value,
            )

        return RoadmapPhaseResult(
            ResearchPhase.PERFORMANCE_IMPROVEMENTS.value,
            success,
            [str(self.output_dir / "performance_findings.json")],
            [] if success else [output],
            0,
        )

    async def _run_uiux_research(self) -> RoadmapPhaseResult:
        """Research UI/UX improvement opportunities."""
        context = f"""
**Research Task**: UI/UX Improvement Analysis

Analyze the project for UI/UX improvement opportunities.
Focus on:
1. User flow optimizations
2. Accessibility improvements
3. Responsive design enhancements
4. Loading state improvements
5. Error handling UX
6. Onboarding experience
7. Keyboard navigation and shortcuts

**Project Index**: {self.output_dir / "project_index.json"}
**Discovery File**: {self.output_dir / "roadmap_discovery.json"}

Output findings as JSON to: {self.output_dir / "uiux_findings.json"}

Include for each finding:
- title: Brief title
- description: What to improve
- user_impact: How it affects users
- implementation_complexity: low/medium/high
- priority_recommendation: critical/high/medium/low
"""
        success, output = await self.agent_executor.run_agent(
            "roadmap_features.md",
            additional_context=context,
        )

        if success:
            await self._extract_findings_to_features(
                "uiux_findings.json",
                ResearchPhase.UI_UX_IMPROVEMENTS.value,
            )

        return RoadmapPhaseResult(
            ResearchPhase.UI_UX_IMPROVEMENTS.value,
            success,
            [str(self.output_dir / "uiux_findings.json")],
            [] if success else [output],
            0,
        )

    async def _run_feature_discovery(self) -> RoadmapPhaseResult:
        """Run general feature discovery phase."""
        context = f"""
**Research Task**: Feature Discovery

Discover new feature opportunities for this project based on:
1. User needs and pain points from the discovery phase
2. Gaps identified in competitor analysis
3. Emerging trends in the project's domain
4. Integration opportunities with other tools/services
5. Automation opportunities

**Discovery File**: {self.output_dir / "roadmap_discovery.json"}
**Competitor Analysis**: {self.output_dir / "competitor_analysis.json"}
**Project Index**: {self.output_dir / "project_index.json"}

Output findings as JSON to: {self.output_dir / "feature_discovery.json"}

For each feature include:
- title: Brief title
- description: Detailed description
- user_value: Value to users
- strategic_alignment: How it aligns with project vision
- dependencies: What it depends on
- estimated_effort: days/weeks/months
"""
        success, output = await self.agent_executor.run_agent(
            "roadmap_features.md",
            additional_context=context,
        )

        if success:
            await self._extract_findings_to_features(
                "feature_discovery.json",
                ResearchPhase.FEATURE_DISCOVERY.value,
            )

        return RoadmapPhaseResult(
            ResearchPhase.FEATURE_DISCOVERY.value,
            success,
            [str(self.output_dir / "feature_discovery.json")],
            [] if success else [output],
            0,
        )

    async def _extract_findings_to_features(
        self,
        findings_file: str,
        phase: str,
    ) -> None:
        """
        Extract findings from a JSON file and convert to features.

        Args:
            findings_file: Name of the findings JSON file
            phase: Phase that generated these findings
        """
        findings_path = self.output_dir / findings_file
        if not findings_path.exists():
            return

        try:
            with open(findings_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            findings = data.get("findings", data.get("features", []))
            if isinstance(data, list):
                findings = data

            added_count = 0
            for finding in findings:
                if not isinstance(finding, dict):
                    continue

                # Create feature from finding
                feature = self._finding_to_feature(finding, phase)
                self.state.add_feature(feature)
                added_count += 1

                # Trigger rebalancing for new features
                if added_count > 0:
                    await self._rebalance_priorities(RebalanceTrigger.NEW_FEATURE)

            debug(
                "continuous_roadmap",
                f"Extracted {added_count} features from {findings_file}",
            )

            # Also add as findings for tracking
            for finding in findings:
                if isinstance(finding, dict):
                    finding_obj = ResearchFinding(
                        id=str(uuid.uuid4()),
                        phase=phase,
                        title=finding.get("title", "Unknown"),
                        description=finding.get("description", ""),
                        source=finding.get("source"),
                        iteration=self.state.iteration_count,
                        metadata=finding,
                    )
                    self.state.add_finding(finding_obj)

        except (json.JSONDecodeError, OSError) as e:
            debug_warning(
                "continuous_roadmap",
                f"Could not extract findings from {findings_file}: {e}",
            )

    async def _extract_competitor_features(self) -> None:
        """Extract features from competitor analysis."""
        analysis_file = self.output_dir / "competitor_analysis.json"
        if not analysis_file.exists():
            return

        try:
            with open(analysis_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            # Extract features from market gaps
            market_gaps = data.get("market_gaps", [])
            for gap in market_gaps:
                if not isinstance(gap, dict):
                    continue

                feature = {
                    "id": str(uuid.uuid4()),
                    "title": gap.get("gap", gap.get("title", "Unknown")),
                    "description": gap.get("description", gap.get("opportunity", "")),
                    "category": "market_gap",
                    "phase_discovered": ResearchPhase.COMPETITOR_ANALYSIS.value,
                    "iteration_discovered": self.state.iteration_count,
                    "acceleration": gap.get("acceleration", 60.0),
                    "impact": gap.get("impact", 70.0),
                    "feasibility": gap.get("feasibility", 50.0),
                    "strategic_alignment": gap.get("strategic_alignment", 75.0),
                    "dependency": gap.get("dependency", 50.0),
                    "evidence": [f"From competitor analysis: {gap}"],
                }

                # Calculate priority
                feature["priority_score"] = calculate_priority(
                    acceleration=feature["acceleration"],
                    impact=feature["impact"],
                    feasibility=feature["feasibility"],
                    strategic_alignment=feature["strategic_alignment"],
                    dependency=feature["dependency"],
                )
                feature["priority_level"] = get_priority_level(
                    feature["priority_score"]
                ).value

                self.state.add_feature(feature)

            # Extract features from competitor pain points
            competitors = data.get("competitors", [])
            for competitor in competitors:
                if not isinstance(competitor, dict):
                    continue

                pain_points = competitor.get("pain_points", [])
                for pain_point in pain_points:
                    feature = {
                        "id": str(uuid.uuid4()),
                        "title": f"Address: {pain_point}" if isinstance(pain_point, str) else pain_point.get("title", "Unknown"),
                        "description": pain_point if isinstance(pain_point, str) else pain_point.get("description", ""),
                        "category": "competitor_gap",
                        "phase_discovered": ResearchPhase.COMPETITOR_ANALYSIS.value,
                        "iteration_discovered": self.state.iteration_count,
                        "acceleration": 50.0,
                        "impact": 65.0,
                        "feasibility": 60.0,
                        "strategic_alignment": 70.0,
                        "dependency": 50.0,
                        "evidence": [f"Competitor pain point from {competitor.get('name', 'unknown')}"],
                    }

                    feature["priority_score"] = calculate_priority(
                        acceleration=feature["acceleration"],
                        impact=feature["impact"],
                        feasibility=feature["feasibility"],
                        strategic_alignment=feature["strategic_alignment"],
                        dependency=feature["dependency"],
                    )
                    feature["priority_level"] = get_priority_level(
                        feature["priority_score"]
                    ).value

                    self.state.add_feature(feature)

            await self._rebalance_priorities(RebalanceTrigger.NEW_FEATURE)

        except (json.JSONDecodeError, OSError) as e:
            debug_warning(
                "continuous_roadmap",
                f"Could not extract competitor features: {e}",
            )

    def _finding_to_feature(self, finding: dict[str, Any], phase: str) -> dict[str, Any]:
        """
        Convert a raw finding to a feature with priority scoring.

        Args:
            finding: Raw finding dictionary
            phase: Phase that generated this finding

        Returns:
            Feature dictionary with priority scoring
        """
        # Map complexity/impact strings to numeric scores
        impact_map = {"low": 30.0, "medium": 50.0, "high": 80.0}
        complexity_map = {"low": 80.0, "medium": 50.0, "high": 20.0}  # Inverted for feasibility

        impact_str = finding.get("impact_estimate", finding.get("impact", "medium"))
        if isinstance(impact_str, str):
            impact = impact_map.get(impact_str.lower(), 50.0)
        else:
            impact = float(impact_str) if impact_str else 50.0

        complexity_str = finding.get("complexity", finding.get("implementation_complexity", "medium"))
        if isinstance(complexity_str, str):
            feasibility = complexity_map.get(complexity_str.lower(), 50.0)
        else:
            feasibility = 100.0 - float(complexity_str) if complexity_str else 50.0

        feature = {
            "id": str(uuid.uuid4()),
            "title": finding.get("title", "Unknown Feature"),
            "description": finding.get("description", ""),
            "category": phase,
            "phase_discovered": phase,
            "iteration_discovered": self.state.iteration_count,
            "acceleration": finding.get("acceleration", 50.0),
            "impact": impact,
            "feasibility": feasibility,
            "strategic_alignment": finding.get("strategic_alignment", 50.0),
            "dependency": finding.get("dependency", 50.0),
            "evidence": [finding.get("source", "Continuous research")],
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "metadata": finding,
        }

        # Calculate priority score
        feature["priority_score"] = calculate_priority(
            acceleration=feature["acceleration"],
            impact=feature["impact"],
            feasibility=feature["feasibility"],
            strategic_alignment=feature["strategic_alignment"],
            dependency=feature["dependency"],
        )
        feature["priority_level"] = get_priority_level(feature["priority_score"]).value

        return feature

    async def _rebalance_priorities(self, trigger: RebalanceTrigger) -> None:
        """
        Recalculate and reorder all feature priorities.

        Args:
            trigger: What triggered this rebalancing
        """
        debug(
            "continuous_roadmap",
            f"Rebalancing priorities (trigger: {trigger.value})",
        )

        # Recalculate all priorities
        self.state.features = recalculate_priorities(self.state.features)

        # Sort by priority
        self.state.features = sort_by_priority(self.state.features)

        # Record rebalance
        self.state.record_rebalance(trigger)

        # Save updated state
        self.state.save(self.state_dir)

        self._emit_progress("rebalanced", {"trigger": trigger.value})

    def _emit_progress(self, event: str, data: dict[str, Any] | None = None) -> None:
        """Emit a progress update if callback is set."""
        if self.on_progress:
            progress = {
                "event": event,
                "timestamp": datetime.utcnow().isoformat(),
                "state": self.state.get_summary(),
            }
            if data:
                progress.update(data)
            self.on_progress(progress)

    def _print_start_banner(self) -> None:
        """Print the start banner."""
        print(
            box(
                f"Project: {self.project_dir}\n"
                f"Output: {self.output_dir}\n"
                f"Model: {self.model}\n"
                f"Duration: {self.duration_hours} hours\n"
                f"Mode: {'Resume' if self.state.iteration_count > 1 else 'Fresh Start'}",
                title="CONTINUOUS ROADMAP RESEARCH",
                style="heavy",
            )
        )

    def _print_summary(self) -> None:
        """Print the final summary."""
        summary = self.state.get_summary()

        # Count features by priority level
        priority_counts: dict[str, int] = {}
        for feature in self.state.features:
            level = feature.get("priority_level", "unknown")
            priority_counts[level] = priority_counts.get(level, 0) + 1

        print(
            box(
                f"Iterations completed: {summary['iteration_count']}\n"
                f"Elapsed time: {summary['elapsed_hours']:.1f} hours\n"
                f"Features discovered: {summary['feature_count']}\n"
                f"Research findings: {summary['finding_count']}\n"
                f"Priority rebalances: {summary['rebalance_count']}\n\n"
                f"Features by priority:\n"
                + "\n".join(
                    f"  {icon(Icons.ARROW_RIGHT)} {p.upper()}: {c}"
                    for p, c in priority_counts.items()
                )
                + f"\n\nState saved to: {self.state_dir}",
                title=f"{icon(Icons.SUCCESS)} RESEARCH COMPLETE",
                style="heavy",
            )
        )

    def get_state(self) -> ContinuousResearchState:
        """Get the current state."""
        return self.state

    def get_features(self, sorted_by_priority: bool = True) -> list[dict[str, Any]]:
        """
        Get all discovered features.

        Args:
            sorted_by_priority: If True, sort by priority score descending

        Returns:
            List of feature dictionaries
        """
        if sorted_by_priority:
            return sort_by_priority(self.state.features)
        return self.state.features

    def get_summary(self) -> dict[str, Any]:
        """Get a summary of the research session."""
        return self.state.get_summary()


def main():
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Continuous autonomous research for roadmap generation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--project",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Output directory for roadmap files",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="sonnet",
        help="Model to use (haiku, sonnet, opus)",
    )
    parser.add_argument(
        "--thinking-level",
        type=str,
        default="medium",
        choices=["none", "low", "medium", "high", "ultrathink"],
        help="Thinking level for extended reasoning",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=8.0,
        help="Duration in hours for research session (default: 8)",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume from saved state if available",
    )

    args = parser.parse_args()

    debug(
        "continuous_roadmap_runner",
        "CLI invoked",
        project=str(args.project),
        duration=args.duration,
        resume=args.resume,
    )

    # Validate project directory
    project_dir = args.project.resolve()
    if not project_dir.exists():
        debug_error(
            "continuous_roadmap_runner",
            "Project directory does not exist",
            project_dir=str(project_dir),
        )
        print(f"Error: Project directory does not exist: {project_dir}")
        sys.exit(1)

    runner = ContinuousRoadmapRunner(
        project_dir=project_dir,
        output_dir=args.output,
        model=args.model,
        thinking_level=args.thinking_level,
        duration_hours=args.duration,
    )

    try:
        success = asyncio.run(runner.run(resume=args.resume))
        debug("continuous_roadmap_runner", "Research finished", success=success)
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        debug_warning("continuous_roadmap_runner", "Research interrupted by user")
        print("\n\nResearch interrupted. State saved for resume.")
        sys.exit(0)


if __name__ == "__main__":
    main()
