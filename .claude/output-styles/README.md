# Output Styles

Custom response formatting styles for Claude Code when working with Auto-Claude.

## Purpose

Output styles define how Claude Code formats responses for different contexts:
- Code reviews
- Error explanations
- Progress updates
- Build summaries
- Spec presentations

## Available Styles

(To be implemented based on user preferences)

### Planned Styles

**technical-summary**: Concise technical summaries for developers
**verbose-explanation**: Detailed explanations for learning
**minimal**: Minimal output for CI/CD contexts
**user-friendly**: Non-technical language for stakeholders

## Usage

```json
// In .claude/settings.json
{
  "output_styles": {
    "default": "technical-summary",
    "spec_creation": "verbose-explanation",
    "build_summary": "technical-summary",
    "error_explanation": "verbose-explanation"
  }
}
```

## Creating Custom Styles

Create a new markdown file in this directory:

```markdown
---
name: custom-style
contexts: [build_summary, error_explanation]
---

# Custom Style Instructions

When using this style:
- Use bullet points for lists
- Include code examples
- Emphasize key findings
- Provide actionable next steps
```

## Future Enhancements

- Style templates for different agent types
- Context-aware style switching
- User preference learning
- Integration with status lines
