# Status Lines

Terminal status displays for Auto-Claude progress tracking.

## Purpose

Status lines provide real-time progress information during autonomous builds:
- Current phase
- Subtask progress
- Token usage
- Estimated completion
- Error indicators

## Planned Status Lines

### Build Progress
```
[Auto-Claude] Planning (2/4 phases) | Tokens: 12.5K | Est: 15m remaining
```

### Subtask Progress
```
[Auto-Claude] Coding (3/8 subtasks) | Current: Implement auth middleware | 45% complete
```

### QA Progress
```
[Auto-Claude] QA (1/1 phases) | Validating acceptance criteria | 2/5 complete
```

### Error Status
```
[Auto-Claude] ⚠️  QA Rejected | Iteration 1/3 | Fixing: logout issue
```

## Integration

Status lines can be configured in `.claude/settings.json`:

```json
{
  "status_lines": {
    "enabled": true,
    "style": "progress",  // progress | minimal | verbose
    "update_frequency": 5  // seconds
  }
}
```

## Future Enhancements

- Real-time token usage tracking
- Cost estimates during build
- Phase duration predictions
- Success probability indicators
- Integration with terminal multiplexers (tmux, screen)
- Desktop notifications for phase completions
