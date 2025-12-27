# AI Analyzer Package

A modular, well-structured package for AI-powered code analysis using Claude Agent SDK.

## Architecture

The package follows a clean separation of concerns with the following modules:

### Core Components

```
ai_analyzer/
├── __init__.py           # Package exports
├── models.py             # Data models and type definitions
├── runner.py             # Main orchestrator
├── analyzers.py          # Individual analyzer implementations
├── claude_client.py      # Claude SDK client wrapper
├── cost_estimator.py     # API cost estimation
├── cache_manager.py      # Result caching
├── result_parser.py      # JSON parsing utilities
└── summary_printer.py    # Output formatting
```

### Module Responsibilities

#### `models.py`
- Data models: `AnalyzerType`, `CostEstimate`, `AnalysisResult`
- Type definitions for vulnerabilities, bottlenecks, and code smells
- Centralized type safety

#### `runner.py`
- `AIAnalyzerRunner`: Main orchestrator class
- Coordinates analysis workflow
- Manages analyzer execution and result aggregation
- Calculates overall scores

#### `analyzers.py`
- Individual analyzer implementations:
  - `CodeRelationshipsAnalyzer`
  - `BusinessLogicAnalyzer`
  - `ArchitectureAnalyzer`
  - `SecurityAnalyzer`
  - `PerformanceAnalyzer`
  - `CodeQualityAnalyzer`
- `AnalyzerFactory`: Creates analyzer instances
- Each analyzer generates prompts and default results

#### `claude_client.py`
- `ClaudeAnalysisClient`: Wrapper for Claude SDK
- Handles OAuth token validation
- Creates security settings
- Collects and returns responses

#### `cost_estimator.py`
- `CostEstimator`: Estimates API costs
- Counts tokens based on project size
- Provides cost breakdowns before analysis

#### `cache_manager.py`
- `CacheManager`: Handles result caching
- 24-hour cache validity
- Automatic cache invalidation

#### `result_parser.py`
- `ResultParser`: Parses JSON from Claude responses
- Multiple parsing strategies (direct, markdown blocks, extraction)
- Fallback to default values

#### `summary_printer.py`
- `SummaryPrinter`: Formats output
- Prints scores, vulnerabilities, bottlenecks
- Cost estimation display

## Usage

### From Python

```python
from pathlib import Path
import json
from ai_analyzer import AIAnalyzerRunner

# Load project index
project_dir = Path("/path/to/project")
project_index = json.loads((project_dir / "comprehensive_analysis.json").read_text())

# Create runner
runner = AIAnalyzerRunner(project_dir, project_index)

# Run analysis
insights = await runner.run_full_analysis()

# Print summary
runner.print_summary(insights)
```

### From CLI

```bash
# Run full analysis
python ai_analyzer_runner.py --project-dir /path/to/project

# Run specific analyzers
python ai_analyzer_runner.py --analyzers security performance

# Skip cache
python ai_analyzer_runner.py --skip-cache
```

## Design Principles

1. **Single Responsibility**: Each module has one clear purpose
2. **Dependency Injection**: Dependencies passed via constructors
3. **Factory Pattern**: `AnalyzerFactory` for creating analyzer instances
4. **Separation of Concerns**: UI, business logic, and data access separated
5. **Type Safety**: Comprehensive type hints throughout
6. **Error Handling**: Graceful degradation with defaults
7. **Testability**: Modular design enables easy unit testing

## Benefits of Refactoring

- **Reduced complexity**: Main entry point reduced from 650 to 86 lines
- **Improved maintainability**: Clear module boundaries
- **Better testability**: Each component can be tested independently
- **Enhanced readability**: Code organized by responsibility
- **Easier extension**: Adding new analyzers or features is straightforward
- **Type safety**: Comprehensive type hints aid development

## Adding New Analyzers

To add a new analyzer:

1. Create analyzer class in `analyzers.py` extending `BaseAnalyzer`
2. Implement `get_prompt()` and `get_default_result()` methods
3. Add to `AnalyzerFactory.ANALYZER_CLASSES`
4. Add to `AnalyzerType` enum in `models.py`
5. Update `SummaryPrinter.ANALYZER_NAMES` if needed

Example:

```python
class CustomAnalyzer(BaseAnalyzer):
    def get_prompt(self) -> str:
        return "Your analysis prompt here"

    def get_default_result(self) -> dict[str, Any]:
        return {"score": 0, "findings": []}
```
