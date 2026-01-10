# Dependency Visualization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add dependency visualization to the Auto Claude roadmap, displaying bidirectional dependencies (dependencies and reverse dependencies) with validation and navigation across all roadmap views.

**Architecture:** Backend validator enriches roadmap with reverse dependencies and validation metadata during generation. Frontend components display dependencies in dedicated sections with clickable chips that open a detail side panel. Dependencies are preserved across roadmap refreshes through intelligent ID mapping.

**Tech Stack:** Python 3.12 (backend), TypeScript/React (frontend), Zustand (state management), pytest (testing), Electron MCP (E2E testing)

---

## Task 1: Create Backend Dependency Validator

**Files:**
- Create: `apps/backend/runners/roadmap/validators.py`
- Test: `tests/test_dependency_validator.py`

**Step 1: Write the failing test for missing dependency detection**

Create file `tests/test_dependency_validator.py`:

```python
import pytest
from apps.backend.runners.roadmap.validators import DependencyValidator
from apps.backend.runners.roadmap.models import RoadmapFeature

def test_missing_dependency_detection():
    """Test detecting dependencies that reference non-existent features."""
    features = [
        RoadmapFeature(
            id="feat-1",
            title="Feature 1",
            description="Test feature 1",
            dependencies=["feat-2", "feat-3"],  # feat-3 doesn't exist
            status="planned"
        ),
        RoadmapFeature(
            id="feat-2",
            title="Feature 2",
            description="Test feature 2",
            dependencies=[],
            status="planned"
        )
    ]

    validator = DependencyValidator()
    result = validator.validate_all(features)

    assert result.has_missing == True
    assert "feat-3" in result.missing_ids
    assert len(result.missing_ids) == 1

def test_no_missing_dependencies():
    """Test when all dependencies exist."""
    features = [
        RoadmapFeature(
            id="feat-1",
            title="Feature 1",
            description="Test feature 1",
            dependencies=["feat-2"],
            status="planned"
        ),
        RoadmapFeature(
            id="feat-2",
            title="Feature 2",
            description="Test feature 2",
            dependencies=[],
            status="planned"
        )
    ]

    validator = DependencyValidator()
    result = validator.validate_all(features)

    assert result.has_missing == False
    assert len(result.missing_ids) == 0
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd apps/backend
.venv/bin/pytest ../../tests/test_dependency_validator.py::test_missing_dependency_detection -v
```

Expected: FAIL with "DependencyValidator not found" or import error

**Step 3: Write minimal implementation**

Create file `apps/backend/runners/roadmap/validators.py`:

```python
from dataclasses import dataclass
from typing import List, Dict, Set
from apps.backend.runners.roadmap.models import RoadmapFeature

@dataclass
class ValidationResult:
    """Result of dependency validation."""
    has_missing: bool
    has_circular: bool
    missing_ids: List[str]
    circular_paths: List[List[str]]
    reverse_deps_map: Dict[str, List[str]]

class DependencyValidator:
    """Validates and enriches feature dependencies."""

    def validate_all(self, features: List[RoadmapFeature]) -> ValidationResult:
        """
        Validates all dependencies in the roadmap.

        Args:
            features: List of features to validate

        Returns:
            ValidationResult with validation metadata
        """
        # Find missing dependencies
        missing_ids = self._find_missing_deps(features)

        # Detect circular dependencies
        circular_paths = self._detect_circular_deps(features)

        # Calculate reverse dependencies
        reverse_deps_map = self._calculate_reverse_deps(features)

        return ValidationResult(
            has_missing=len(missing_ids) > 0,
            has_circular=len(circular_paths) > 0,
            missing_ids=missing_ids,
            circular_paths=circular_paths,
            reverse_deps_map=reverse_deps_map
        )

    def _find_missing_deps(self, features: List[RoadmapFeature]) -> List[str]:
        """Find dependencies that reference non-existent features."""
        valid_ids = {f.id for f in features}
        missing = set()

        for feature in features:
            for dep_id in feature.dependencies:
                if dep_id not in valid_ids:
                    missing.add(dep_id)

        return sorted(list(missing))

    def _detect_circular_deps(self, features: List[RoadmapFeature]) -> List[List[str]]:
        """Detect circular dependencies using DFS."""
        # Build adjacency list
        graph = {f.id: f.dependencies for f in features}
        circular_paths = []

        def dfs(node: str, path: List[str], visited: Set[str]) -> bool:
            if node in path:
                # Found a cycle
                cycle_start = path.index(node)
                cycle = path[cycle_start:] + [node]
                circular_paths.append(cycle)
                return True

            if node in visited:
                return False

            visited.add(node)
            path.append(node)

            for neighbor in graph.get(node, []):
                if neighbor in graph:  # Only check existing nodes
                    dfs(neighbor, path.copy(), visited.copy())

            return False

        visited = set()
        for feature_id in graph:
            if feature_id not in visited:
                dfs(feature_id, [], set())

        return circular_paths

    def _calculate_reverse_deps(self, features: List[RoadmapFeature]) -> Dict[str, List[str]]:
        """Calculate which features depend on each feature."""
        reverse_deps = {}

        # Initialize all features with empty list
        for feature in features:
            reverse_deps[feature.id] = []

        # Build reverse dependency map
        for feature in features:
            for dep_id in feature.dependencies:
                if dep_id not in reverse_deps:
                    reverse_deps[dep_id] = []
                reverse_deps[dep_id].append(feature.id)

        return reverse_deps
```

**Step 4: Run tests to verify they pass**

Run:
```bash
cd apps/backend
.venv/bin/pytest ../../tests/test_dependency_validator.py -v
```

Expected: PASS for both tests

**Step 5: Commit**

```bash
git add apps/backend/runners/roadmap/validators.py tests/test_dependency_validator.py
git commit -m "feat(backend): add dependency validator with missing and circular dep detection"
```

---

## Task 2: Enhance RoadmapFeature Type with Dependency Fields

**Files:**
- Modify: `apps/frontend/src/shared/types/roadmap.ts`
- Test: TypeScript compilation check

**Step 1: Read the current RoadmapFeature type**

Run:
```bash
cat apps/frontend/src/shared/types/roadmap.ts
```

Note the existing structure. The current interface should have a `dependencies: string[]` field.

**Step 2: Add new dependency fields to RoadmapFeature**

Edit `apps/frontend/src/shared/types/roadmap.ts`, add to the `RoadmapFeature` interface:

```typescript
export interface RoadmapFeature {
  // ... existing fields ...

  dependencies: string[];  // Existing: IDs this feature depends on

  // NEW: Reverse dependencies (which features depend on this one)
  reverseDependencies?: string[];

  // NEW: Validation metadata
  dependencyValidation?: {
    hasMissing: boolean;
    hasCircular: boolean;
    missingIds: string[];
    circularPaths: string[][];
  };
}
```

**Step 3: Verify TypeScript compilation**

Run:
```bash
cd apps/frontend
npm run typecheck
```

Expected: No type errors (reverseDependencies and dependencyValidation are optional)

**Step 4: Commit**

```bash
git add apps/frontend/src/shared/types/roadmap.ts
git commit -m "feat(frontend): add reverse dependencies and validation fields to RoadmapFeature type"
```

---

## Task 3: Add Dependencies Section to FeatureCard Component

**Files:**
- Modify: `apps/frontend/src/renderer/components/roadmap/FeatureCard.tsx`
- Test: Manual testing in development mode

**Step 1: Read the current FeatureCard component**

Run:
```bash
cat apps/frontend/src/renderer/components/roadmap/FeatureCard.tsx
```

Identify where to insert the dependencies section (typically after the description section).

**Step 2: Add dependencies section UI**

Edit `apps/frontend/src/renderer/components/roadmap/FeatureCard.tsx`, add after the description section:

```typescript
import { Package, Link, AlertTriangle, RefreshCw } from 'lucide-react';

// In the component, after description section:
{feature.dependencies && feature.dependencies.length > 0 && (
  <div className="dependencies-section mt-4 pt-4 border-t border-border">
    {/* Dependencies */}
    <div className="mb-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
        <Package className="w-4 h-4" />
        <span>Dependencies ({feature.dependencies.length})</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {feature.dependencies.map(depId => {
          const depFeature = features.find(f => f.id === depId);
          const isMissing = !depFeature;

          return (
            <button
              key={depId}
              className={`
                dependency-chip px-3 py-1 rounded-md text-sm font-medium
                flex items-center gap-1.5 transition-colors
                ${isMissing
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-300 dark:border-red-700'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }
              `}
              onClick={() => depFeature && onDependencyClick(depId)}
              disabled={isMissing}
              title={isMissing ? `Dependency '${depId}' not found in roadmap` : depFeature?.title}
            >
              {isMissing && <AlertTriangle className="w-3.5 h-3.5" />}
              <span>{depFeature?.title || depId}</span>
            </button>
          );
        })}
      </div>
    </div>

    {/* Reverse Dependencies */}
    {feature.reverseDependencies && feature.reverseDependencies.length > 0 && (
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
          <Link className="w-4 h-4" />
          <span>Required By ({feature.reverseDependencies.length})</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {feature.reverseDependencies.map(depId => {
            const depFeature = features.find(f => f.id === depId);
            return (
              <button
                key={depId}
                className="dependency-chip px-3 py-1 rounded-md text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                onClick={() => depFeature && onDependencyClick(depId)}
                title={depFeature?.title}
              >
                <span>{depFeature?.title || depId}</span>
              </button>
            );
          })}
        </div>
      </div>
    )}

    {/* Validation Warnings */}
    {feature.dependencyValidation?.hasCircular && (
      <div className="mt-3 p-2 bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700 rounded-md flex items-center gap-2 text-sm text-purple-700 dark:text-purple-400">
        <RefreshCw className="w-4 h-4" />
        <span>Circular dependency detected</span>
      </div>
    )}
  </div>
)}
```

**Step 3: Add onDependencyClick prop to component props**

Edit the props interface:

```typescript
interface FeatureCardProps {
  // ... existing props ...
  onDependencyClick?: (featureId: string) => void;
  features: RoadmapFeature[];  // Add this if not already present
}
```

**Step 4: Start development server to test**

Run:
```bash
cd apps/frontend
npm run dev
```

**Step 5: Manual verification**

1. Open the app
2. Navigate to Roadmap
3. View a feature card with dependencies
4. Verify dependencies section is visible
5. Verify chips are clickable (except missing deps)

**Step 6: Commit**

```bash
git add apps/frontend/src/renderer/components/roadmap/FeatureCard.tsx
git commit -m "feat(frontend): add dependencies section to FeatureCard component"
```

---

## Task 4: Create DependencyDetailSidePanel Component

**Files:**
- Create: `apps/frontend/src/renderer/components/roadmap/DependencyDetailSidePanel.tsx`
- Test: Manual testing in development mode

**Step 1: Create the side panel component**

Create file `apps/frontend/src/renderer/components/roadmap/DependencyDetailSidePanel.tsx`:

```typescript
import React from 'react';
import { X, ExternalLink } from 'lucide-react';
import { RoadmapFeature } from '../../../shared/types/roadmap';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';

interface DependencyDetailSidePanelProps {
  feature: RoadmapFeature | null;
  isOpen: boolean;
  onClose: () => void;
  onGoToFeature?: (featureId: string) => void;
  onConvertToSpec?: (featureId: string) => void;
}

export function DependencyDetailSidePanel({
  feature,
  isOpen,
  onClose,
  onGoToFeature,
  onConvertToSpec
}: DependencyDetailSidePanelProps) {
  if (!feature) return null;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`
          fixed top-0 right-0 h-full w-[400px] bg-background border-l z-50
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold line-clamp-2">{feature.title}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="shrink-0"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 p-6">
          {/* Description */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Description</h3>
            <p className="text-sm leading-relaxed">{feature.description}</p>
          </div>

          {/* Metadata */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-muted-foreground">Priority</span>
                <div className="mt-1">
                  <Badge variant={feature.priority === 'must' ? 'destructive' : 'secondary'}>
                    {feature.priority}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Complexity</span>
                <div className="mt-1">
                  <Badge variant="outline">{feature.complexity}</Badge>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Impact</span>
                <div className="mt-1">
                  <Badge variant="outline">{feature.impact}</Badge>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Status</span>
                <div className="mt-1">
                  <Badge variant="secondary">{feature.status}</Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Dependencies Info */}
          {feature.dependencies && feature.dependencies.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Dependencies ({feature.dependencies.length})
              </h3>
              <ul className="space-y-1">
                {feature.dependencies.map(depId => (
                  <li key={depId} className="text-sm flex items-center gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span className="font-mono text-xs">{depId}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reverse Dependencies Info */}
          {feature.reverseDependencies && feature.reverseDependencies.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Required By ({feature.reverseDependencies.length})
              </h3>
              <ul className="space-y-1">
                {feature.reverseDependencies.map(depId => (
                  <li key={depId} className="text-sm flex items-center gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span className="font-mono text-xs">{depId}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ScrollArea>

        {/* Footer Actions */}
        <div className="p-6 border-t space-y-2">
          {feature.linkedSpecId ? (
            <Button
              className="w-full justify-start"
              variant="default"
              onClick={() => onGoToFeature?.(feature.linkedSpecId!)}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Go to Task
            </Button>
          ) : (
            <Button
              className="w-full justify-start"
              variant="default"
              onClick={() => onConvertToSpec?.(feature.id)}
            >
              Convert to Spec
            </Button>
          )}
          <Button
            className="w-full justify-start"
            variant="outline"
            onClick={() => {
              onGoToFeature?.(feature.id);
              onClose();
            }}
          >
            View in Roadmap
          </Button>
        </div>
      </div>
    </>
  );
}
```

**Step 2: Export the component**

Edit `apps/frontend/src/renderer/components/roadmap/index.ts` (if it exists) or create it:

```typescript
export { DependencyDetailSidePanel } from './DependencyDetailSidePanel';
```

**Step 3: Verify TypeScript compilation**

Run:
```bash
cd apps/frontend
npm run typecheck
```

Expected: No type errors

**Step 4: Commit**

```bash
git add apps/frontend/src/renderer/components/roadmap/DependencyDetailSidePanel.tsx
git commit -m "feat(frontend): add DependencyDetailSidePanel component"
```

---

## Task 5: Integrate Side Panel with Roadmap Views

**Files:**
- Modify: `apps/frontend/src/renderer/components/roadmap/Roadmap.tsx` (or main roadmap component)
- Modify: `apps/frontend/src/renderer/stores/roadmap-store.ts`

**Step 1: Add side panel state to roadmap store**

Edit `apps/frontend/src/renderer/stores/roadmap-store.ts`:

```typescript
interface RoadmapStore {
  // ... existing state ...

  // NEW: Dependency detail panel state
  dependencyDetailFeatureId: string | null;
  openDependencyDetail: (featureId: string) => void;
  closeDependencyDetail: () => void;
}

// In the store implementation:
export const useRoadmapStore = create<RoadmapStore>((set, get) => ({
  // ... existing state ...

  // NEW: Dependency detail panel state
  dependencyDetailFeatureId: null,

  openDependencyDetail: (featureId: string) =>
    set({ dependencyDetailFeatureId: featureId }),

  closeDependencyDetail: () =>
    set({ dependencyDetailFeatureId: null }),
}));
```

**Step 2: Integrate side panel into main Roadmap component**

Edit the main roadmap component (find it with `find apps/frontend/src -name "*.tsx" -type f | grep -i roadmap | head -5`):

```typescript
import { DependencyDetailSidePanel } from './roadmap/DependencyDetailSidePanel';
import { useRoadmapStore } from '../stores/roadmap-store';

// In the component:
function Roadmap() {
  const dependencyDetailFeatureId = useRoadmapStore(s => s.dependencyDetailFeatureId);
  const closeDependencyDetail = useRoadmapStore(s => s.closeDependencyDetail);
  const features = useRoadmapStore(s => s.features);

  const selectedFeature = features.find(f => f.id === dependencyDetailFeatureId) || null;

  // ... existing JSX ...

  return (
    <div className="roadmap-container">
      {/* Existing roadmap content */}

      {/* NEW: Dependency detail side panel */}
      <DependencyDetailSidePanel
        feature={selectedFeature}
        isOpen={dependencyDetailFeatureId !== null}
        onClose={closeDependencyDetail}
        onGoToFeature={(featureId) => {
          // Navigate to feature
          closeDependencyDetail();
        }}
        onConvertToSpec={(featureId) => {
          // Convert to spec logic
          closeDependencyDetail();
        }}
      />
    </div>
  );
}
```

**Step 3: Update FeatureCard to use store action**

Edit `apps/frontend/src/renderer/components/roadmap/FeatureCard.tsx`:

```typescript
import { useRoadmapStore } from '../../stores/roadmap-store';

// In the component:
function FeatureCard({ feature, features }: FeatureCardProps) {
  const openDependencyDetail = useRoadmapStore(s => s.openDependencyDetail);

  // In the dependency chip onClick:
  onClick={() => openDependencyDetail(depId)}

  // ... rest of component
}
```

**Step 4: Verify TypeScript compilation**

Run:
```bash
cd apps/frontend
npm run typecheck
```

**Step 5: Manual testing**

Run development server and test:
1. Click a dependency chip in FeatureCard
2. Verify side panel opens
3. Verify correct feature info is displayed
4. Verify close button works
5. Verify backdrop click closes panel

**Step 6: Commit**

```bash
git add apps/frontend/src/renderer/stores/roadmap-store.ts apps/frontend/src/renderer/components/roadmap/
git commit -m "feat(frontend): integrate DependencyDetailSidePanel with roadmap views"
```

---

## Task 6: Integrate Backend Validator into Roadmap Generation

**Files:**
- Modify: `apps/backend/runners/roadmap/orchestrator.py`
- Modify: `apps/backend/runners/roadmap/models.py` (if needed)

**Step 1: Read the roadmap orchestrator**

Run:
```bash
cat apps/backend/runners/roadmap/orchestrator.py
```

Identify where features are generated and where to inject validation.

**Step 2: Import and integrate validator**

Edit `apps/backend/runners/roadmap/orchestrator.py`:

```python
from runners.roadmap.validators import DependencyValidator

# In the RoadmapOrchestrator class, after features are generated:
class RoadmapOrchestrator:
    # ... existing code ...

    def _enrich_features(self, features: List[RoadmapFeature]) -> List[RoadmapFeature]:
        """
        Enrich features with dependency validation and reverse dependencies.

        Args:
            features: List of features to enrich

        Returns:
            Enriched features with reverse dependencies and validation metadata
        """
        validator = DependencyValidator()
        validation_result = validator.validate_all(features)

        # Enrich each feature
        enriched_features = []
        for feature in features:
            # Add reverse dependencies
            feature.reverseDependencies = validation_result.reverse_deps_map.get(
                feature.id, []
            )

            # Add validation metadata if needed
            if (feature.id in [dep for f in features for dep in f.dependencies] or
                len(feature.dependencies) > 0):
                feature.dependencyValidation = {
                    'hasMissing': validation_result.has_missing,
                    'hasCircular': validation_result.has_circular,
                    'missingIds': [mid for mid in validation_result.missing_ids
                                   if mid in feature.dependencies],
                    'circularPaths': [cp for cp in validation_result.circular_paths
                                      if feature.id in cp]
                }

            enriched_features.append(feature)

        return enriched_features
```

**Step 3: Call enrichment in pipeline**

Find where roadmap is finalized and add the enrichment call:

```python
# In the orchestration flow, after features are generated:
enriched_features = self._enrich_features(generated_features)
```

**Step 4: Test with a real roadmap**

Run:
```bash
cd apps/backend
python -m roadmap_runner --project /path/to/test/project
```

Verify that the generated roadmap.json contains:
- `reverseDependencies` arrays
- `dependencyValidation` objects where applicable

**Step 5: Write integration test**

Create file `tests/test_roadmap_integration.py`:

```python
import pytest
from apps.backend.runners.roadmap.validators import DependencyValidator
from apps.backend.runners.roadmap.models import RoadmapFeature

def test_full_validation_workflow():
    """Test complete validation workflow with multiple features."""
    features = [
        RoadmapFeature(
            id="feat-1",
            title="Auth System",
            description="Authentication",
            dependencies=[],
            status="planned"
        ),
        RoadmapFeature(
            id="feat-2",
            title="User Management",
            description="User CRUD",
            dependencies=["feat-1"],
            status="planned"
        ),
        RoadmapFeature(
            id="feat-3",
            title="Admin Panel",
            description="Admin interface",
            dependencies=["feat-2"],
            status="planned"
        ),
    ]

    validator = DependencyValidator()
    result = validator.validate_all(features)

    # Should have no issues
    assert result.has_missing == False
    assert result.has_circular == False

    # Reverse dependencies should be correct
    assert result.reverse_deps_map["feat-1"] == ["feat-2"]
    assert result.reverse_deps_map["feat-2"] == ["feat-3"]
    assert result.reverse_deps_map["feat-3"] == []
```

**Step 6: Run integration test**

Run:
```bash
cd apps/backend
.venv/bin/pytest ../../tests/test_roadmap_integration.py -v
```

Expected: PASS

**Step 7: Commit**

```bash
git add apps/backend/runners/roadmap/orchestrator.py tests/test_roadmap_integration.py
git commit -m "feat(backend): integrate dependency validator into roadmap generation"
```

---

## Task 7: Add Circular Dependency Detection Tests

**Files:**
- Modify: `tests/test_dependency_validator.py`

**Step 1: Add circular dependency tests**

Edit `tests/test_dependency_validator.py`:

```python
def test_simple_circular_dependency():
    """Test detecting simple circular dependency (A -> B -> A)."""
    features = [
        RoadmapFeature(
            id="feat-1",
            title="Feature 1",
            description="Test",
            dependencies=["feat-2"],
            status="planned"
        ),
        RoadmapFeature(
            id="feat-2",
            title="Feature 2",
            description="Test",
            dependencies=["feat-1"],
            status="planned"
        )
    ]

    validator = DependencyValidator()
    result = validator.validate_all(features)

    assert result.has_circular == True
    assert len(result.circular_paths) > 0
    # Check that cycle is detected
    assert any("feat-1" in path and "feat-2" in path for path in result.circular_paths)

def test_complex_circular_dependency():
    """Test detecting complex circular dependency (A -> B -> C -> A)."""
    features = [
        RoadmapFeature(
            id="feat-1",
            title="Feature 1",
            description="Test",
            dependencies=["feat-2"],
            status="planned"
        ),
        RoadmapFeature(
            id="feat-2",
            title="Feature 2",
            description="Test",
            dependencies=["feat-3"],
            status="planned"
        ),
        RoadmapFeature(
            id="feat-3",
            title="Feature 3",
            description="Test",
            dependencies=["feat-1"],
            status="planned"
        )
    ]

    validator = DependencyValidator()
    result = validator.validate_all(features)

    assert result.has_circular == True
    assert len(result.circular_paths) > 0

def test_no_circular_dependencies():
    """Test when there are no circular dependencies."""
    features = [
        RoadmapFeature(
            id="feat-1",
            title="Feature 1",
            description="Test",
            dependencies=[],
            status="planned"
        ),
        RoadmapFeature(
            id="feat-2",
            title="Feature 2",
            description="Test",
            dependencies=["feat-1"],
            status="planned"
        ),
        RoadmapFeature(
            id="feat-3",
            title="Feature 3",
            description="Test",
            dependencies=["feat-1"],
            status="planned"
        )
    ]

    validator = DependencyValidator()
    result = validator.validate_all(features)

    assert result.has_circular == False
    assert len(result.circular_paths) == 0
```

**Step 2: Run tests**

Run:
```bash
cd apps/backend
.venv/bin/pytest ../../tests/test_dependency_validator.py -v
```

Expected: All PASS

**Step 3: Commit**

```bash
git add tests/test_dependency_validator.py
git commit -m "test(backend): add circular dependency detection tests"
```

---

## Task 8: Add Frontend Unit Tests for Dependencies Section

**Files:**
- Create: `apps/frontend/src/renderer/components/roadmap/FeatureCard.test.tsx`

**Step 1: Create test file**

Create file `apps/frontend/src/renderer/components/roadmap/FeatureCard.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { FeatureCard } from './FeatureCard';
import { RoadmapFeature } from '../../../shared/types/roadmap';

const mockFeatures: RoadmapFeature[] = [
  {
    id: 'feat-1',
    title: 'Feature 1',
    description: 'Test feature 1',
    priority: 'must',
    complexity: 'medium',
    impact: 'high',
    status: 'planned',
    phase: 1,
    dependencies: ['feat-2'],
    reverseDependencies: ['feat-3']
  },
  {
    id: 'feat-2',
    title: 'Feature 2',
    description: 'Test feature 2',
    priority: 'should',
    complexity: 'low',
    impact: 'medium',
    status: 'done',
    phase: 1,
    dependencies: [],
    reverseDependencies: ['feat-1']
  },
  {
    id: 'feat-3',
    title: 'Feature 3',
    description: 'Test feature 3',
    priority: 'could',
    complexity: 'high',
    impact: 'low',
    status: 'planned',
    phase: 2,
    dependencies: ['feat-1'],
    reverseDependencies: []
  }
];

describe('FeatureCard Dependencies', () => {
  it('renders dependencies section when feature has dependencies', () => {
    render(
      <FeatureCard
        feature={mockFeatures[0]}
        features={mockFeatures}
        onDependencyClick={jest.fn()}
      />
    );

    expect(screen.getByText(/dependencies \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText('Feature 2')).toBeInTheDocument();
  });

  it('renders reverse dependencies section when feature has reverse dependencies', () => {
    render(
      <FeatureCard
        feature={mockFeatures[0]}
        features={mockFeatures}
        onDependencyClick={jest.fn()}
      />
    );

    expect(screen.getByText(/required by \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText('Feature 3')).toBeInTheDocument();
  });

  it('does not render dependencies section when feature has no dependencies', () => {
    render(
      <FeatureCard
        feature={mockFeatures[1]}
        features={mockFeatures}
        onDependencyClick={jest.fn()}
      />
    );

    expect(screen.queryByText(/dependencies/i)).not.toBeInTheDocument();
  });

  it('calls onDependencyClick when dependency chip is clicked', () => {
    const mockClick = jest.fn();
    render(
      <FeatureCard
        feature={mockFeatures[0]}
        features={mockFeatures}
        onDependencyClick={mockClick}
      />
    );

    const depChip = screen.getByText('Feature 2');
    fireEvent.click(depChip);

    expect(mockClick).toHaveBeenCalledWith('feat-2');
  });

  it('displays warning for missing dependencies', () => {
    const featureWithMissingDep: RoadmapFeature = {
      ...mockFeatures[0],
      dependencies: ['non-existent'],
      dependencyValidation: {
        hasMissing: true,
        hasCircular: false,
        missingIds: ['non-existent'],
        circularPaths: []
      }
    };

    render(
      <FeatureCard
        feature={featureWithMissingDep}
        features={mockFeatures}
        onDependencyClick={jest.fn()}
      />
    );

    expect(screen.getByText('non-existent')).toBeInTheDocument();
    // Verify chip is disabled
    const chip = screen.getByText('non-existent').closest('button');
    expect(chip).toBeDisabled();
  });

  it('displays circular dependency warning when detected', () => {
    const featureWithCircularDep: RoadmapFeature = {
      ...mockFeatures[0],
      dependencyValidation: {
        hasMissing: false,
        hasCircular: true,
        missingIds: [],
        circularPaths: [['feat-1', 'feat-2', 'feat-1']]
      }
    };

    render(
      <FeatureCard
        feature={featureWithCircularDep}
        features={mockFeatures}
        onDependencyClick={jest.fn()}
      />
    );

    expect(screen.getByText(/circular dependency detected/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run tests**

Run:
```bash
cd apps/frontend
npm test FeatureCard.test.tsx
```

Expected: All tests pass (may need to adjust based on actual component structure)

**Step 3: Commit**

```bash
git add apps/frontend/src/renderer/components/roadmap/FeatureCard.test.tsx
git commit -m "test(frontend): add unit tests for FeatureCard dependencies section"
```

---

## Task 9: Manual Testing Checklist

**Files:**
- None (manual verification)

**Step 1: Start development servers**

Run:
```bash
# Terminal 1: Frontend
cd apps/frontend
npm run dev

# Terminal 2: Backend (if needed for testing)
cd apps/backend
# Run any necessary backend services
```

**Step 2: Complete manual testing checklist**

Create file `guides/plans/dependency-visualization-testing-checklist.md`:

```markdown
# Dependency Visualization - Testing Checklist

## Display Tests

- [ ] Dependencies visible in Kanban view
- [ ] Dependencies visible in Phases view
- [ ] Dependencies visible in All Features view
- [ ] Dependencies visible in By Priority view
- [ ] Dependencies section has proper styling and layout
- [ ] Dependency chips display correct feature titles
- [ ] Empty state shows when no dependencies

## Reverse Dependencies Tests

- [ ] Reverse dependencies visible in all views
- [ ] "Required By" section displays correctly
- [ ] Correct features listed in reverse dependencies
- [ ] Empty state shows when not required by any features

## Interaction Tests

- [ ] Clicking dependency chip opens side panel
- [ ] Side panel displays correct feature information
- [ ] Side panel close button works
- [ ] Clicking backdrop closes side panel
- [ ] ESC key closes side panel (if implemented)
- [ ] Panel animation is smooth

## Status Indicators Tests

- [ ] Completed dependencies show green checkmark
- [ ] In-progress dependencies show yellow clock
- [ ] Planned dependencies show neutral indicator
- [ ] Missing dependencies show warning icon
- [ ] Missing dependencies have red dashed border
- [ ] Missing dependencies are not clickable

## Validation Tests

- [ ] Circular dependencies show error banner
- [ ] Circular dependency warning displays correctly
- [ ] Missing dependencies show warning banner
- [ ] Missing dependency tooltip is informative

## Edge Cases Tests

- [ ] Feature with many dependencies (>5) handles layout well
- [ ] Long feature titles truncate appropriately
- [ ] Very long dependency arrays don't break layout
- [ ] Self-referencing dependency handled correctly

## Performance Tests

- [ ] Dependencies render quickly with 50+ features
- [ ] Reverse dependencies calculated without lag
- [ ] Side panel opens smoothly
- [ ] No console errors or warnings

## Accessibility Tests

- [ ] All interactive elements are keyboard accessible
- [ ] Tab order is logical
- [ ] ARIA labels present on dependency chips
- [ ] Screen reader announces dependency information
- [ ] Color contrast is sufficient
```

**Step 3: Execute checklist**

Go through each item and verify manually. Document any issues found.

**Step 4: Create issue tracking for any bugs found**

If bugs are found, create GitHub issues with:
- Clear title describing the bug
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable

**Step 5: Commit testing checklist**

```bash
git add guides/plans/dependency-visualization-testing-checklist.md
git commit -m "docs: add dependency visualization testing checklist"
```

---

## Task 10: Write Documentation and Release Notes

**Files:**
- Modify: `CHANGELOG.md` (if exists)
- Modify: `apps/frontend/src/renderer/components/roadmap/README.md`

**Step 1: Update roadmap component README**

Edit `apps/frontend/src/renderer/components/roadmap/README.md`, add section:

```markdown
## Dependencies Visualization

Features can specify dependencies on other features. The roadmap displays these dependencies bidirectionally:

### Dependencies Section

Shows which features must be completed before this feature can start:
- **Green checkmark** ✓ - Dependency is complete
- **Yellow clock** ⏱ - Dependency is in progress
- **Gray indicator** - Dependency is not started
- **Red warning** ⚠ - Dependency doesn't exist in roadmap

### Required By Section

Shows which features depend on this feature. This helps understand the impact of changing or delaying this feature.

### Validation Warnings

- **Circular dependencies** - Detected and displayed with purple indicator and error banner
- **Missing dependencies** - Shown with red dashed border and tooltip

### Interaction

Click any dependency chip to open the detail side panel with full feature information.
```

**Step 2: Create changelog entry**

If `CHANGELOG.md` exists, add entry:

```markdown
## [Unreleased]

### Added
- **Roadmap:** Dependency visualization in all roadmap views
- **Roadmap:** Bidirectional dependency display (dependencies and reverse dependencies)
- **Roadmap:** Dependency validation with circular and missing dependency detection
- **Roadmap:** Clickable dependency chips with detail side panel
- **Roadmap:** Dependency status indicators (completed, in-progress, planned, missing)
- **Roadmap:** Reverse dependency calculation and display

### Changed
- Enhanced roadmap data model with dependency metadata
- Improved roadmap refresh with dependency preservation (TODO in future phase)
```

**Step 3: Commit documentation**

```bash
git add apps/frontend/src/renderer/components/roadmap/README.md CHANGELOG.md
git commit -m "docs: update roadmap documentation with dependency visualization"
```

---

## Task 11: Final Integration and Polish

**Files:**
- Multiple (polish across components)

**Step 1: Add loading states**

Add skeleton loading for dependencies section while data is loading:

```typescript
// In FeatureCard.tsx
{isLoadingDependencies ? (
  <div className="dependencies-section mt-4 pt-4 border-t border-border">
    <Skeleton className="h-4 w-32 mb-2" />
    <Skeleton className="h-8 w-24" />
  </div>
) : (
  // existing dependencies section
)}
```

**Step 2: Add error boundaries**

Wrap dependencies section in error boundary:

```typescript
<ErrorBoundary fallback={<div>Unable to load dependencies</div>}>
  <DependenciesSection ... />
</ErrorBoundary>
```

**Step 3: Verify all tests pass**

Run:
```bash
# Backend tests
cd apps/backend
.venv/bin/pytest ../../tests/test_dependency_validator.py ../../tests/test_roadmap_integration.py -v

# Frontend tests
cd apps/frontend
npm test

# TypeScript check
npm run typecheck
```

Expected: All tests pass, no type errors

**Step 4: Run linters**

Run:
```bash
# Backend
cd apps/backend
ruff check runners/roadmap/

# Frontend
cd apps/frontend
npm run lint
```

Expected: No errors

**Step 5: Final commit**

```bash
git add -A
git commit -m "polish: add loading states and error handling for dependencies"
```

**Step 6: Push to remote**

```bash
git push origin feature/roadmap-dependency-visualization
```

**Step 7: Create Pull Request**

Run:
```bash
gh pr create --base develop --title "feat: add dependency visualization to roadmap" --body "See design doc in guides/plans/2026-01-05-dependency-visualization-design.md and implementation plan in guides/plans/2025-01-05-dependency-visualization-implementation.md"
```

---

## Summary

This implementation plan adds dependency visualization to the Auto Claude roadmap in 11 bite-sized tasks:

1. ✅ Backend dependency validator
2. ✅ Frontend type enhancements
3. ✅ UI components (FeatureCard + SidePanel)
4. ✅ Store integration
5. ✅ Backend orchestration
6. ✅ Testing (unit + integration + manual)
7. ✅ Documentation

**Total estimated time:** 3-5 days for MVP implementation (Phases 1-2 from design doc)

**Next phases** (deferred to future):
- Phase 3: Advanced validation (unmet dependency blocking, refresh preservation)
- Phase 4: Performance optimization and accessibility polish

**Testing approach:** TDD with pytest (backend) and Jest (frontend), plus manual E2E testing with Electron MCP.
