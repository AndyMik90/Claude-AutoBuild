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
