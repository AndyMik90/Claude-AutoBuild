# BMAD-METHOD Full Integration Plan for Auto-Claude

## Executive Summary

This document outlines the complete integration of BMAD-METHOD v6 into Auto-Claude's autonomous execution engine. The integration creates a hybrid system combining BMAD's structured agile methodology with Auto-Claude's multi-agent autonomous execution.

---

## Current State Analysis

### What's Currently Integrated (60%)

| Component | File | Status |
|-----------|------|--------|
| BMM Agent Loader | `agent_loader.py` | ✅ Complete |
| BMM Workflow Loader | `workflow_loader.py` | ✅ Complete |
| Blueprint Manager | `blueprint.py` | ✅ Complete |
| Blueprint Build Orchestrator | `blueprint_build.py` | ✅ Complete |
| Verification Gate | `verification.py` | ✅ Complete |
| Story Converter | `story_converter.py` | ✅ Complete |
| Reference Parser | `reference_parser.py` | ✅ Complete |

### What's Missing (40%)

| Component | Priority | Complexity |
|-----------|----------|------------|
| Core Module (bmad-master, brainstorming, party-mode) | HIGH | Medium |
| BMGD Module (6 game dev agents, workflows) | MEDIUM | Medium |
| CIS Module (6 creative agents, workflows) | MEDIUM | Medium |
| BMB Module (builder agent, creation workflows) | LOW | High |
| Teams Configuration Support | HIGH | Low |
| Resources/Templates System | MEDIUM | Medium |
| Tasks/Tools Integration | MEDIUM | Medium |
| Multi-Module Orchestration | HIGH | High |

---

## BMAD-METHOD Complete Inventory

### 1. Core Module (`src/core/`)

#### Agent
- `bmad-master.agent.yaml` - Master orchestrator, knowledge custodian

#### Workflows
- `brainstorming/` - Creative ideation workflow with multiple techniques
- `party-mode/` - Multi-agent collaborative discussion

#### Tasks
- `advanced-elicitation-methods.csv`
- `advanced-elicitation.xml`
- `index-docs.xml`
- `validate-workflow.xml`
- `workflow.xml`

#### Tools
- `shard-doc.xml` - Document sharding tool

#### Resources
- `excalidraw/` - Diagram generation helpers

---

### 2. BMM Module (`src/modules/bmm/`) - Main Agile Module

#### Agents (9 total)
| Agent | File | Role |
|-------|------|------|
| Product Manager | `pm.agent.yaml` | Requirements, product planning |
| Architect | `architect.agent.yaml` | System design, technical architecture |
| Developer | `dev.agent.yaml` | Implementation, coding |
| UX Designer | `ux-designer.agent.yaml` | User experience, interface design |
| Test Architect | `tea.agent.yaml` | QA, testing strategy |
| Analyst | `analyst.agent.yaml` | Business analysis, requirements |
| Scrum Master | `sm.agent.yaml` | Sprint management, story prep |
| Tech Writer | `tech-writer.agent.yaml` | Documentation, diagrams |
| Quick Flow Solo Dev | `quick-flow-solo-dev.agent.yaml` | Fast implementation |

#### Workflows (10 categories, 25+ workflows)
| Phase | Workflows |
|-------|-----------|
| 1-analysis | create-product-brief, research |
| 2-plan-workflows | create-ux-design, prd |
| 3-solutioning | check-implementation-readiness, create-architecture, create-epics-and-stories |
| 4-implementation | code-review, correct-course, create-story, dev-story, retrospective, sprint-planning, sprint-status |
| bmad-quick-flow | create-tech-spec, quick-dev |
| document-project | document-project |
| excalidraw-diagrams | create-dataflow, create-diagram, create-flowchart, create-wireframe |
| generate-project-context | generate-project-context |
| testarch | atdd, automate, ci, framework, nfr-assess, test-design, test-review, trace |
| workflow-status | init, status |

#### Teams
- `team-fullstack.yaml` - Full-stack development team configuration

#### Data/Templates
- `documentation-standards.md`
- `project-context-template.md`

---

### 3. BMGD Module (`src/modules/bmgd/`) - Game Development

#### Agents (6 total)
| Agent | File | Role |
|-------|------|------|
| Game Designer | `game-designer.agent.yaml` | Game mechanics, systems design |
| Game Architect | `game-architect.agent.yaml` | Technical architecture for games |
| Game Developer | `game-dev.agent.yaml` | Game implementation |
| Game Solo Dev | `game-solo-dev.agent.yaml` | Quick game prototyping |
| Game Scrum Master | `game-scrum-master.agent.yaml` | Game sprint management |
| Game QA | `game-qa.agent.yaml` | Game testing, quality |

#### Workflows (5 phases, 20+ workflows)
| Phase | Workflows |
|-------|-----------|
| 1-preproduction | brainstorm-game, game-brief |
| 2-design | gdd (Game Design Document), narrative |
| 3-technical | game-architecture, generate-project-context |
| 4-production | code-review, correct-course, create-story, dev-story, retrospective, sprint-planning, sprint-status |
| bmgd-quick-flow | create-tech-spec, quick-dev, quick-prototype |
| gametest | automate, performance, playtest-plan, test-design, test-framework, test-review |
| workflow-status | init, status |

#### Teams
- `team-gamedev.yaml` - Game development team

---

### 4. CIS Module (`src/modules/cis/`) - Creative & Innovation

#### Agents (6 total)
| Agent | File | Role |
|-------|------|------|
| Innovation Strategist | `innovation-strategist.agent.yaml` | Innovation planning |
| Creative Problem Solver | `creative-problem-solver.agent.yaml` | Creative solutions |
| Design Thinking Coach | `design-thinking-coach.agent.yaml` | Design thinking facilitation |
| Presentation Master | `presentation-master.agent.yaml` | Presentation creation |
| Brainstorming Coach | `brainstorming-coach.agent.yaml` | Ideation facilitation |
| Storyteller | `storyteller/storyteller.agent.yaml` | Narrative creation |

#### Workflows (4 workflows)
- `design-thinking/` - Design thinking process
- `innovation-strategy/` - Innovation planning
- `problem-solving/` - Creative problem solving
- `storytelling/` - Narrative development

#### Teams
- `creative-squad.yaml` - Creative team configuration

---

### 5. BMB Module (`src/modules/bmb/`) - BMAD Builder

#### Agents (1 main + examples)
- `bmad-builder.agent.yaml` - Creates custom agents, modules, workflows

#### Example Agents (reference)
- `security-engineer.agent.yaml`
- `trend-analyst.agent.yaml`
- `commit-poet.agent.yaml`
- `journal-keeper/journal-keeper.agent.yaml`

#### Workflows
- `create-agent/` - Create new BMAD agents
- `create-module/` - Create new BMAD modules
- `create-workflow/` - Create new workflows
- `edit-agent/` - Modify existing agents
- `edit-workflow/` - Modify existing workflows
- `workflow-compliance-check/` - Validate workflow compliance

---

## Integration Architecture

### New File Structure

```
auto-claude/integrations/bmad/
├── __init__.py                    # Updated exports
├── agent_loader.py                # Extended for all modules
├── workflow_loader.py             # Extended for all modules
├── blueprint.py                   # Existing
├── blueprint_build.py             # Existing
├── verification.py                # Existing
├── story_converter.py             # Existing
├── reference_parser.py            # Existing
├── workflow_loader.py             # Existing
│
├── core/                          # NEW: Core module integration
│   ├── __init__.py
│   ├── master_orchestrator.py     # bmad-master integration
│   ├── brainstorming.py           # Brainstorming workflow runner
│   └── party_mode.py              # Multi-agent discussion
│
├── modules/                       # NEW: Module loaders
│   ├── __init__.py
│   ├── bmm_loader.py              # BMM module (refactored)
│   ├── bmgd_loader.py             # BMGD game dev module
│   ├── cis_loader.py              # CIS creative module
│   └── bmb_loader.py              # BMB builder module
│
├── teams/                         # NEW: Team configurations
│   ├── __init__.py
│   └── team_loader.py             # Load team configurations
│
├── resources/                     # NEW: Resources integration
│   ├── __init__.py
│   ├── excalidraw.py              # Diagram generation
│   └── templates.py               # Template management
│
├── tasks/                         # NEW: Task integration
│   ├── __init__.py
│   └── task_runner.py             # Execute BMAD tasks
│
└── data/
    └── sample_blueprint.yaml      # Existing
```

---

## Implementation Phases

### Phase 1: Core Module Integration (Priority: HIGH)

**Goal**: Integrate bmad-master orchestrator and core workflows

**Components**:
1. `core/master_orchestrator.py` - Wrap bmad-master agent
2. `core/brainstorming.py` - Run brainstorming sessions
3. `core/party_mode.py` - Multi-agent discussions

**Deliverables**:
- [ ] Master orchestrator that can delegate to specialized agents
- [ ] Brainstorming workflow integration for ideation phase
- [ ] Party mode for collaborative problem-solving

---

### Phase 2: Multi-Module Agent Loader (Priority: HIGH)

**Goal**: Extend agent_loader.py to support all 4 modules

**Changes to `agent_loader.py`**:
1. Add module discovery (bmm, bmgd, cis, bmb)
2. Add module-specific agent mappings
3. Add agent metadata extraction for all formats

**New Agent Mappings**:
```python
MODULE_AGENTS = {
    "core": ["bmad-master"],
    "bmm": ["pm", "architect", "dev", "ux-designer", "tea", "analyst", "sm", "tech-writer", "quick-flow-solo-dev"],
    "bmgd": ["game-designer", "game-architect", "game-dev", "game-solo-dev", "game-scrum-master", "game-qa"],
    "cis": ["innovation-strategist", "creative-problem-solver", "design-thinking-coach", "presentation-master", "brainstorming-coach", "storyteller"],
    "bmb": ["bmad-builder"]
}
```

---

### Phase 3: Multi-Module Workflow Loader (Priority: HIGH)

**Goal**: Extend workflow_loader.py to support all module workflows

**Changes to `workflow_loader.py`**:
1. Add module-aware workflow discovery
2. Support both `.yaml` and `.md` workflow formats
3. Add workflow phase mapping per module

**New Workflow Phase Mapping**:
```python
MODULE_WORKFLOW_PHASES = {
    "bmm": {
        "analysis": "1-analysis",
        "planning": "2-plan-workflows",
        "solutioning": "3-solutioning",
        "implementation": "4-implementation",
        "quick_flow": "bmad-quick-flow",
        "documentation": "document-project",
        "diagrams": "excalidraw-diagrams",
        "testing": "testarch",
        "status": "workflow-status"
    },
    "bmgd": {
        "preproduction": "1-preproduction",
        "design": "2-design",
        "technical": "3-technical",
        "production": "4-production",
        "quick_flow": "bmgd-quick-flow",
        "testing": "gametest",
        "status": "workflow-status"
    },
    "cis": {
        "design_thinking": "design-thinking",
        "innovation": "innovation-strategy",
        "problem_solving": "problem-solving",
        "storytelling": "storytelling"
    }
}
```

---

### Phase 4: Teams Integration (Priority: HIGH)

**Goal**: Support BMAD team configurations

**New File**: `teams/team_loader.py`

**Features**:
1. Load team YAML configurations
2. Map teams to agent groups
3. Support team-based agent selection

**Team Structure**:
```python
TEAMS = {
    "fullstack": "bmm/teams/team-fullstack.yaml",
    "gamedev": "bmgd/teams/team-gamedev.yaml",
    "creative": "cis/teams/creative-squad.yaml"
}
```

---

### Phase 5: Resources & Templates (Priority: MEDIUM)

**Goal**: Integrate BMAD resources and templates

**New Files**:
- `resources/excalidraw.py` - Diagram generation from excalidraw helpers
- `resources/templates.py` - Template loading and rendering

**Features**:
1. Load excalidraw diagram templates
2. Generate project context from templates
3. Support documentation standards

---

### Phase 6: Tasks Integration (Priority: MEDIUM)

**Goal**: Execute BMAD tasks within Auto-Claude

**New File**: `tasks/task_runner.py`

**Features**:
1. Parse BMAD task XML files
2. Execute tasks as part of workflows
3. Support elicitation methods

---

### Phase 7: BMB Builder Integration (Priority: LOW)

**Goal**: Allow creating custom agents/workflows from Auto-Claude

**New File**: `modules/bmb_loader.py`

**Features**:
1. Load bmad-builder agent
2. Support agent creation workflows
3. Validate created content

---

## Auto-Claude to BMAD Phase Mapping

| Auto-Claude Phase | BMAD Module | BMAD Agents | BMAD Workflows |
|-------------------|-------------|-------------|----------------|
| spec_creation | BMM | pm, analyst | 1-analysis |
| discovery | BMM, CIS | analyst, brainstorming-coach | research, brainstorming |
| requirements | BMM | pm, analyst | create-product-brief |
| planning | BMM | pm, architect | 2-plan-workflows, prd |
| design | BMM, CIS | ux-designer, design-thinking-coach | create-ux-design, design-thinking |
| architecture | BMM | architect | 3-solutioning, create-architecture |
| implementation | BMM | dev, quick-flow-solo-dev | 4-implementation, bmad-quick-flow |
| testing | BMM | tea | testarch |
| documentation | BMM | tech-writer | document-project |
| diagrams | BMM | tech-writer | excalidraw-diagrams |
| game_design | BMGD | game-designer | 1-preproduction, 2-design |
| game_dev | BMGD | game-dev, game-architect | 3-technical, 4-production |
| creative | CIS | all CIS agents | all CIS workflows |

---

## Success Criteria

### Functional Requirements
- [ ] All 22 BMAD agents loadable from Auto-Claude
- [ ] All 50+ workflows executable
- [ ] Team configurations supported
- [ ] Resources/templates accessible
- [ ] Tasks executable

### Integration Requirements
- [ ] Blueprint builds can use any BMAD agent
- [ ] Workflows map correctly to Auto-Claude phases
- [ ] Agent prompts properly converted
- [ ] Module selection configurable

### Quality Requirements
- [ ] Unit tests for all new loaders
- [ ] Integration tests for cross-module operations
- [ ] Documentation for hybrid usage

---

## Implementation Order

1. **Week 1**: Phase 1 (Core) + Phase 2 (Agent Loader)
2. **Week 2**: Phase 3 (Workflow Loader) + Phase 4 (Teams)
3. **Week 3**: Phase 5 (Resources) + Phase 6 (Tasks)
4. **Week 4**: Phase 7 (BMB) + Testing + Documentation

---

## Dependencies

- BMAD-METHOD v6 installed at `~/Desktop/BMAD-METHOD`
- Python 3.10+
- PyYAML for YAML parsing
- Auto-Claude existing infrastructure

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| BMAD structure changes | HIGH | Version lock, adapter pattern |
| Performance with 664 files | MEDIUM | Lazy loading, caching |
| Agent prompt format changes | MEDIUM | Flexible parser, fallbacks |
| Workflow compatibility | MEDIUM | Validation layer |

---

*Generated using BMAD-METHOD planning methodology*
*Auto-Claude Integration v2.0*
