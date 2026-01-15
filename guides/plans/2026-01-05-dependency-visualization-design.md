# Dependency Visualization Design for Auto Claude Roadmap

**Date:** 2025-01-05
**Author:** Claude (Brainstorming Session)
**Status:** Design Approved
**Related Issues:** N/A

## Overview

This document describes the design for adding dependency visualization to the Auto Claude roadmap feature. Currently, dependencies are stored in the data model but not displayed in the UI. This feature will make dependencies visible, clickable, and manageable across all roadmap views.

## Problem Statement

Currently, the Auto Claude roadmap system has a dependency data model (`dependencies: string[]` in `RoadmapFeature`), but:

1. Dependencies are **not visible** in the UI
2. Users cannot see which features depend on the current feature (reverse dependencies)
3. No validation for missing or circular dependencies
4. Dependencies break silently after roadmap refresh
5. No way to navigate between related features

## Goals

1. **Display dependencies** in all roadmap views (Kanban, Phases, All Features, By Priority)
2. **Show bidirectional relationships** - both dependencies and reverse dependencies
3. **Enable navigation** - click dependencies to view details
4. **Validate dependencies** - detect and warn about missing, circular, and unmet dependencies
5. **Preserve dependencies** across roadmap refreshes

## Architecture

### Backend Changes

#### 1. Dependency Validator (`apps/backend/runners/roadmap/validators.py`)

```python
class DependencyValidator:
    """Validates and enriches feature dependencies."""

    def validate_all(self, features: List[RoadmapFeature]) -> ValidationResult:
        """
        Validates all dependencies in the roadmap.

        Returns:
            ValidationResult with:
            - has_missing: bool
            - has_circular: bool
            - missing_ids: List[str]
            - circular_paths: List[List[str]]
            - reverse_deps_map: Dict[str, List[str]]
        """
        pass

    def _find_missing_deps(self, features: List[RoadmapFeature]) -> List[str]:
        """Find dependencies that reference non-existent features."""
        pass

    def _detect_circular_deps(self, features: List[RoadmapFeature]) -> List[List[str]]:
        """Detect circular dependencies using DFS."""
        pass

    def _calculate_reverse_deps(self, features: List[RoadmapFeature]) -> Dict[str, List[str]]:
        """Calculate which features depend on each feature."""
        pass
```

#### 2. Dependency Preserver (`apps/backend/runners/roadmap/dependency_preserver.py`)

```python
class DependencyPreserver:
    """Preserves dependencies during roadmap refresh."""

    def preserve_dependencies(self, old_roadmap: Roadmap, new_roadmap: Roadmap) -> None:
        """
        Translate old dependency IDs to new feature IDs after refresh.

        Strategy:
        1. Match features by similarity (title + description)
        2. Build mapping from old IDs to new IDs
        3. Translate dependency arrays
        4. Mark unmapped dependencies as "legacy"
        """
        pass

    def _match_features(self, old_roadmap: Roadmap, new_roadmap: Roadmap) -> Dict[str, RoadmapFeature]:
        """Match features from old roadmap to new roadmap by similarity."""
        pass

    def _translate_id(self, old_id: str, mapping: Dict[str, RoadmapFeature]) -> Optional[str]:
        """Translate old feature ID to new feature ID."""
        pass
```

#### 3. Enhanced Data Model

Update `RoadmapFeature` type in `apps/frontend/src/shared/types/roadmap.ts`:

```typescript
export interface RoadmapFeature {
  // ... existing fields

  dependencies: string[];  // Existing: IDs this feature depends on

  // NEW: Reverse dependencies
  reverseDependencies?: string[];  // IDs of features that depend on this one

  // NEW: Validation metadata
  dependencyValidation?: {
    hasMissing: boolean;
    hasCircular: boolean;
    missingIds: string[];
    circularPaths: string[][];
  };
}
```

### Frontend Changes

#### 1. FeatureCard Component Enhancement

**File:** `apps/frontend/src/renderer/components/roadmap/FeatureCard.tsx`

Add a dedicated dependencies section:

```tsx
<div className="dependencies-section">
  {/* Dependencies */}
  <div className="subsection">
    <div className="subsection-header">
      <Package className="icon" />
      <span>Dependencies ({feature.dependencies.length})</span>
    </div>
    {feature.dependencies.length === 0 ? (
      <p className="empty-state">No dependencies</p>
    ) : (
      <div className="dependency-chips">
        {feature.dependencies.map(depId => {
          const depFeature = features.find(f => f.id === depId);
          const status = getDependencyStatus(depId, depFeature);

          return (
            <button
              key={depId}
              className={`dependency-chip status-${status}`}
              onClick={() => openDependencyDetail(depId)}
              disabled={!depFeature}
            >
              <StatusIcon status={status} />
              <span>{depFeature?.title || depId}</span>
              {!depFeature && <WarningIcon />}
            </button>
          );
        })}
      </div>
    )}
  </div>

  {/* Reverse Dependencies */}
  <div className="subsection">
    <div className="subsection-header">
      <Link className="icon" />
      <span>Required By ({feature.reverseDependencies?.length || 0})</span>
    </div>
    {(!feature.reverseDependencies || feature.reverseDependencies.length === 0) ? (
      <p className="empty-state">Not required by any features</p>
    ) : (
      <div className="dependency-chips">
        {feature.reverseDependencies.map(depId => {
          const depFeature = features.find(f => f.id === depId);
          return (
            <button
              key={depId}
              className="dependency-chip"
              onClick={() => openDependencyDetail(depId)}
            >
              <span>{depFeature?.title || depId}</span>
            </button>
          );
        })}
      </div>
    )}
  </div>

  {/* Validation Warnings */}
  {feature.dependencyValidation?.hasCircular && (
    <Alert variant="error" className="circular-warning">
      <RefreshCw className="icon" />
      <span>Circular dependency detected</span>
    </Alert>
  )}
</div>
```

**Dependency Status Indicators:**

| Status | Icon | Color | Description |
|--------|------|-------|-------------|
| `completed` | ✓ | Green | Dependency is done |
| `in-progress` | ⏱ | Yellow | Dependency is being worked on |
| `planned` | 📋 | Gray | Dependency is not started |
| `missing` | ⚠ | Red dashed | Dependency doesn't exist |
| `circular` | 🔄 | Purple | Part of circular dependency |

#### 2. DependencyDetailSidePanel Component

**New File:** `apps/frontend/src/renderer/components/roadmap/DependencyDetailSidePanel.tsx`

```typescript
interface DependencyDetailSidePanelProps {
  featureId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function DependencyDetailSidePanel({
  featureId,
  isOpen,
  onClose
}: DependencyDetailSidePanelProps) {
  const feature = useFeature(featureId);

  if (!feature) return null;

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} position="right">
      <SidePanelHeader>
        <h2>{feature.title}</h2>
        <CloseButton onClick={onClose} />
      </SidePanelHeader>

      <SidePanelContent>
        {/* Feature Info */}
        <Section>
          <Description text={feature.description} />
        </Section>

        {/* Metadata */}
        <Section>
          <MetadataGrid>
            <MetadataItem label="Priority" value={feature.priority} />
            <MetadataItem label="Complexity" value={feature.complexity} />
            <MetadataItem label="Impact" value={feature.impact} />
            <MetadataItem label="Status" value={feature.status} />
          </MetadataGrid>
        </Section>

        {/* Progress Bar */}
        {feature.linkedSpecId && (
          <Section>
            <ProgressBar progress={feature.progress} />
          </Section>
        )}

        {/* Actions */}
        <ActionButtons>
          {feature.linkedSpecId ? (
            <Button to={`/tasks/${feature.linkedSpecId}`}>
              Go to Task
            </Button>
          ) : (
            <Button onClick={() => convertToSpec(feature.id)}>
              Convert to Spec
            </Button>
          )}
          <Button variant="secondary" onClick={() => scrollToFeature(feature.id)}>
            View in Roadmap
          </Button>
        </ActionButtons>
      </SidePanelContent>
    </SidePanel>
  );
}
```

#### 3. Store Enhancements

**File:** `apps/frontend/src/renderer/stores/roadmap-store.ts`

Add new actions and selectors:

```typescript
interface RoadmapStore {
  // NEW: Open dependency detail panel
  openDependencyDetail: (featureId: string) => void;
  closeDependencyDetail: () => void;
  selectedDependencyId: string | null;

  // NEW: Navigate to feature
  scrollToFeature: (featureId: string) => void;

  // NEW: Get reverse dependencies
  getReverseDependencies: (featureId: string) => string[];

  // NEW: Validate all dependencies
  validateDependencies: () => Promise<ValidationResult>;
}

// Computed selectors
export const useReverseDependencies = (featureId: string) =>
  useRoadmapStore(state => {
    const features = state.features;
    return features
      .filter(f => f.dependencies.includes(featureId))
      .map(f => f.id);
  });

export const useDependencyStatus = (depId: string) =>
  useRoadmapStore(state => {
    const dep = state.features.find(f => f.id === depId);
    if (!dep) return 'missing';
    if (dep.status === 'done') return 'completed';
    if (dep.status === 'in_progress') return 'in-progress';
    return 'planned';
  });
```

## Data Flow

### 1. Initial Roadmap Load

```
Backend (roadmap_runner.py)
  ↓
Generate features with dependencies
  ↓
DependencyValidator.validate_all()
  ↓
Enrich with:
  - reverseDependencies
  - dependencyValidation metadata
  ↓
Save to roadmap.json
  ↓
Frontend loads roadmap.json
  ↓
Store processes and exposes data
  ↓
Components render with dependency info
```

### 2. User Clicks Dependency

```
User clicks dependency chip in FeatureCard
  ↓
Component calls store.openDependencyDetail(depId)
  ↓
Store sets selectedDependencyId = depId
  ↓
DependencyDetailSidePanel opens
  ↓
Panel fetches feature data via useFeature(depId)
  ↓
Panel displays feature details and actions
```

### 3. Roadmap Refresh with Dependency Preservation

```
User clicks "Refresh Roadmap"
  ↓
Backend regenerates features
  ↓
DependencyPreserver.preserve_dependencies(old, new)
  ↓
  1. Match features by similarity
  2. Build ID mapping
  3. Translate dependency arrays
  4. Mark stale dependencies
  ↓
DependencyValidator.validate_all(new_features)
  ↓
Return enhanced roadmap + migration info
  ↓
Frontend receives result
  ↓
If migration needed → show MigrationDialog
  ↓
User reviews/approves mappings
  ↓
Store updates with new roadmap
```

## Error Handling & Validation

### 1. Missing Dependencies

**Detection:**
- Dependency ID not found in features array
- Marked in `dependencyValidation.missingIds`

**UI Response:**
- Warning banner: "⚠️ 2 dependencies not found"
- Dependency chip with red dashed border
- Tooltip: "Feature '001-user-auth' does not exist in roadmap"
- Disabled click state

### 2. Circular Dependencies

**Detection:**
- DFS algorithm to detect cycles
- Store all circular paths in `dependencyValidation.circularPaths`

**UI Response:**
- Error banner: "🔄 Circular dependency detected"
- Tooltip shows path: "A → B → C → A"
- Purple chip color
- Disabled navigation

### 3. Unmet Dependencies

**Detection:**
- Feature status = `in_progress` BUT dependencies not all `done`
- Checked in real-time during drag operations

**UI Response:**
- Warning chip: "⚠️ Blocking: 2 dependencies incomplete"
- Prevent drag to `in_progress` phase in Kanban
- Show notification if started via other means

### 4. Dependency Migration After Refresh

**Detection:**
- Old dependency IDs not found in new roadmap
- Similarity score < 80% for potential matches

**UI Response:**
- Notification: "⚠️ 3 dependencies need review after refresh"
- MigrationDialog shows:
  - Unmatched dependencies
  - Suggested replacements (based on similarity)
  - Actions: Auto-fix, Manual review, Remove

## Testing Strategy

### Unit Tests

**Backend** (`tests/backend/test_dependency_validator.py`):

```python
def test_missing_dependency_detection():
    """Test detecting dependencies that don't exist."""
    features = [
        RoadmapFeature(id="1", dependencies=["2", "3"]),
        RoadmapFeature(id="2", dependencies=[]),
        # ID "3" doesn't exist
    ]
    validator = DependencyValidator()
    result = validator.validate_all(features)

    assert result.has_missing == True
    assert "3" in result.missing_ids

def test_circular_dependency_detection():
    """Test detecting circular dependencies."""
    features = [
        RoadmapFeature(id="1", dependencies=["2"]),
        RoadmapFeature(id="2", dependencies=["3"]),
        RoadmapFeature(id="3", dependencies=["1"]),  # Cycle!
    ]
    validator = DependencyValidator()
    result = validator.validate_all(features)

    assert result.has_circular == True
    assert ["1", "2", "3"] in result.circular_paths

def test_reverse_dependency_calculation():
    """Test calculating which features depend on each feature."""
    features = [
        RoadmapFeature(id="1", dependencies=["2"]),
        RoadmapFeature(id="3", dependencies=["2"]),
        RoadmapFeature(id="2", dependencies=[]),
    ]
    validator = DependencyValidator()
    result = validator.validate_all(features)

    assert result.reverse_deps_map["2"] == ["1", "3"]
```

**Frontend** (`apps/frontend/src/renderer/components/roadmap/FeatureCard.test.tsx`):

```typescript
describe('FeatureCard Dependencies', () => {
  it('renders dependencies section with chips', () => {
    const feature = {
      ...mockFeature,
      dependencies: ['feat-1', 'feat-2']
    };

    render(<FeatureCard feature={feature} />);

    expect(screen.getByText('Dependencies (2)')).toBeInTheDocument();
    expect(screen.getByText('feat-1')).toBeInTheDocument();
    expect(screen.getByText('feat-2')).toBeInTheDocument();
  });

  it('opens side panel when dependency clicked', () => {
    const feature = {
      ...mockFeature,
      dependencies: ['feat-1']
    };

    render(<FeatureCard feature={feature} />);

    fireEvent.click(screen.getByText('feat-1'));

    expect(mockOpenDependencyDetail).toHaveBeenCalledWith('feat-1');
  });

  it('shows warning for missing dependencies', () => {
    const feature = {
      ...mockFeature,
      dependencies: ['non-existent'],
      dependencyValidation: {
        hasMissing: true,
        missingIds: ['non-existent'],
        hasCircular: false,
        circularPaths: []
      }
    };

    render(<FeatureCard feature={feature} />);

    expect(screen.getByText(/does not exist/)).toBeInTheDocument();
  });
});
```

### Integration Tests

**Roadmap Refresh Flow**:

```python
def test_dependency_preservation_on_refresh():
    """Test that dependencies are preserved during roadmap refresh."""
    # Create initial roadmap
    old_roadmap = Roadmap(features=[
        RoadmapFeature(id="1", title="Auth", dependencies=[]),
        RoadmapFeature(id="2", title="Users", dependencies=["1"]),
    ])

    # Simulate refresh with renamed features
    new_roadmap = Roadmap(features=[
        RoadmapFeature(id="3", title="Authentication", dependencies=[]),
        RoadmapFeature(id="4", title="User Management", dependencies=[]),
    ])

    # Preserve dependencies
    preserver = DependencyPreserver()
    preserver.preserve_dependencies(old_roadmap, new_roadmap)

    # Feature "4" should now depend on "3" (mapped from "2" -> "1")
    assert new_roadmap.features[1].dependencies == ["3"]
```

### E2E Tests (Electron MCP)

```typescript
describe('Roadmap Dependencies E2E', () => {
  it('displays dependencies in all views', async () => {
    await navigateTo('/roadmap');

    // Test Kanban view
    await switchView('kanban');
    await expect(page.locator('.dependencies-section')).toBeVisible();

    // Test Phases view
    await switchView('phases');
    await expect(page.locator('.dependencies-section')).toBeVisible();

    // Test All Features view
    await switchView('all');
    await expect(page.locator('.dependencies-section')).toBeVisible();
  });

  it('opens dependency detail panel on click', async () => {
    await navigateTo('/roadmap');
    await page.click('.dependency-chip:first-child');

    await expect(page.locator('[data-testid="dependency-detail-panel"]')).toBeVisible();
    await expect(page.locator('.dependency-detail-panel h2')).toContainText(/feature title/i);
  });

  it('blocks drag with unmet dependencies', async () => {
    await navigateTo('/roadmap?view=kanban');

    const featureCard = page.locator('[data-feature-id="incomplete-dep"]');
    const inProgressColumn = page.locator('[data-phase="in_progress"]');

    // Attempt drag
    await featureCard.dragTo(inProgressColumn);

    // Should show error toast
    await expect(page.locator('.toast-error')).toContainText(/blocking dependencies/i);
  });
});
```

## Implementation Phases

### Phase 1 - Core Display (MVP) - 3-4 days

**Backend:**
- [ ] Create `DependencyValidator` class
- [ ] Implement missing dependency detection
- [ ] Implement reverse dependency calculation
- [ ] Add validator to roadmap generation pipeline

**Frontend:**
- [ ] Update `RoadmapFeature` type with new fields
- [ ] Add dependencies section to `FeatureCard`
- [ ] Create dependency status indicators
- [ ] Implement reverse dependencies display

**Success Criteria:**
- Dependencies visible in all views
- Reverse dependencies calculated correctly
- Missing dependencies show warnings

### Phase 2 - Navigation & Interaction - 5-6 days

**Frontend:**
- [ ] Create `DependencyDetailSidePanel` component
- [ ] Implement click handlers for dependency chips
- [ ] Add scroll & highlight animation
- [ ] Implement panel open/close animations

**Store:**
- [ ] Add `openDependencyDetail` action
- [ ] Add `scrollToFeature` action
- [ ] Create selectors for dependency status

**Success Criteria:**
- Clicking dependency opens side panel
- Panel displays correct feature info
- Smooth animations and transitions

### Phase 3 - Advanced Validation - 3-4 days

**Backend:**
- [ ] Implement circular dependency detection
- [ ] Create `DependencyPreserver` class
- [ ] Add migration logic for roadmap refresh

**Frontend:**
- [ ] Add circular dependency UI indicators
- [ ] Implement unmet dependency blocking in Kanban
- [ ] Create `DependencyMigrationDialog` component
- [ ] Add migration workflow after refresh

**Success Criteria:**
- Circular dependencies detected and displayed
- Unmet dependencies prevent drag operations
- Dependencies preserved across roadmap refresh

### Phase 4 - Polish & Testing - 2-3 days

**Testing:**
- [ ] Write unit tests for validator
- [ ] Write integration tests for refresh flow
- [ ] Write E2E tests with Electron MCP
- [ ] Manual testing checklist completion

**Polish:**
- [ ] Add loading states
- [ ] Implement keyboard navigation (Tab, Enter, Escape)
- [ ] Add screen reader support (ARIA labels)
- [ ] Performance optimization (memoization, virtual scrolling)

**Success Criteria:**
- All tests passing
- Smooth performance with 100+ features
- Accessible via keyboard and screen reader

**Total Estimated Time:** 13-17 days

## Performance Considerations

### 1. Reverse Dependency Calculation

**Problem:** O(n²) complexity for n features

**Solution:**
```typescript
// Memoize calculation
const reverseDeps = useMemo(() => {
  const map = new Map<string, string[]>();
  features.forEach(feature => {
    feature.dependencies.forEach(depId => {
      if (!map.has(depId)) map.set(depId, []);
      map.get(depId)!.push(feature.id);
    });
  });
  return map;
}, [features]);
```

### 2. Large Roadmaps (100+ Features)

**Solutions:**
- **Virtual scrolling** for All Features view (react-window)
- **Lazy load** dependency details (only fetch when panel opens)
- **Debounce** validation during Kanban drag operations (300ms)

### 3. Circular Dependency Detection

**Problem:** Expensive for large graphs

**Solution:**
- Run in **background worker** (Web Worker)
- Show **loading indicator** during computation
- **Cache result** per roadmap session

## Accessibility

- **Keyboard Navigation:**
  - Tab to dependency chips
  - Enter/Space to open detail panel
  - Escape to close panel
  - Arrow keys for panel navigation

- **Screen Reader Support:**
  - ARIA labels for dependency status
  - `role="button"` for clickable chips
  - `aria-expanded` for panel state
  - `aria-describedby` for warnings

- **Colorblind-Friendly:**
  - Use **icons + colors**, not colors alone
  - Status icons: ✓, ⏱, ⚠, 🔄
  - Text labels for all indicators

## Migration Strategy

### For Existing Roadmaps

1. **Backfill reverse dependencies:**
   - Run validator on roadmap load
   - Calculate reverse deps for existing features
   - No user action required

2. **Validate existing dependencies:**
   - Check for missing deps
   - Show warnings if found
   - Offer to clean up

3. **Version migration:**
   - Add roadmap version to schema
   - Auto-migrate on load
   - Fallback for old formats

## Rollout Plan

1. **Feature Flag:** Initially hide behind localStorage flag (`enable_dependency_viz`)
2. **Beta Testing:** Enable for power users first
3. **Gradual Rollout:** Monitor performance, adjust as needed
4. **Full Release:** Remove feature flag once stable

## Success Metrics

- **User Engagement:** % of users clicking dependency chips
- **Error Reduction:** % decrease in circular/missing dependencies
- **Time Saved:** Average time to navigate related features
- **Performance:** <100ms to calculate reverse deps for 100 features
- **Accessibility:** WCAG 2.1 AA compliant

## Open Questions

1. Should dependencies be editable from the UI? (Deferred to future)
2. Should we support dependency groups? (e.g., "A OR B", not "A AND B") (Deferred)
3. Should we show dependency critical path? (Potential Phase 5)
4. Should dependencies support versions/ranges? (Likely not needed)

## Future Enhancements

1. **Dependency Graph Visualization:** D3.js graph showing all relationships
2. **Critical Path Analysis:** Identify which features block others
3. **Dependency Autocomplete:** Suggest dependencies when creating features
4. **Impact Analysis:** Show what breaks if a feature is deleted
5. **Bulk Dependency Updates:** Edit multiple feature dependencies at once

## References

- Current roadmap implementation: `apps/backend/runners/roadmap/`
- Frontend types: `apps/frontend/src/shared/types/roadmap.ts`
- FeatureCard component: `apps/frontend/src/renderer/components/roadmap/FeatureCard.tsx`
- Roadmap store: `apps/frontend/src/renderer/stores/roadmap-store.ts`
- Contributing guidelines: `CONTRIBUTING.md` (Git Flow, branch naming)
