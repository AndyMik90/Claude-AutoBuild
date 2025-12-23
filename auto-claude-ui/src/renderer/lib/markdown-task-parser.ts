/**
 * Markdown Task Parser
 *
 * Parses markdown planning documents to extract:
 * - Task title and description
 * - Subtasks (from headers, bullet points, numbered lists)
 * - Task dependencies (from special syntax like "Depends on:", "Requires:", etc.)
 * - Acceptance criteria
 * - Implementation notes
 */

export interface ParsedTask {
  title: string;
  description: string;
  subtasks: Subtask[];
  dependencies: string[];
  acceptanceCriteria: string[];
  implementationNotes: string[];
  rawContent: string;
}

export interface Subtask {
  title: string;
  description?: string;
  order: number;
  estimatedComplexity?: 'simple' | 'medium' | 'complex';
}

/**
 * Parse a markdown file to extract task information
 */
export function parseMarkdownTask(content: string, filename: string): ParsedTask {
  const lines = content.split('\n');

  const result: ParsedTask = {
    title: extractTitle(lines, filename),
    description: '',
    subtasks: [],
    dependencies: [],
    acceptanceCriteria: [],
    implementationNotes: [],
    rawContent: content
  };

  let currentSection: 'description' | 'subtasks' | 'dependencies' | 'criteria' | 'notes' | 'none' = 'description';
  let descriptionLines: string[] = [];
  let subtaskItems: Array<{ title: string; description: string; order: number }> = [];
  let currentSubtask: { title: string; lines: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines at the start
    if (!line && currentSection === 'description' && descriptionLines.length === 0) {
      continue;
    }

    // Skip the title line (first # heading)
    if (line.startsWith('# ') && descriptionLines.length === 0 && result.title === extractTitle(lines, filename)) {
      continue;
    }

    // Detect section headers
    const lowerLine = line.toLowerCase();

    if (lowerLine.match(/^#+\s*(subtasks?|tasks?|steps?|phases?|implementation steps?)/i)) {
      currentSection = 'subtasks';
      continue;
    }

    if (lowerLine.match(/^#+\s*(depends on|dependencies|requires|prerequisites)/i)) {
      // Save any pending subtask before changing sections
      if (currentSubtask) {
        subtaskItems.push({
          title: currentSubtask.title,
          description: currentSubtask.lines.join('\n').trim(),
          order: subtaskItems.length + 1
        });
        currentSubtask = null;
      }
      currentSection = 'dependencies';
      continue;
    }

    if (lowerLine.match(/^#+\s*(acceptance criteria|success criteria|done when)/i)) {
      // Save any pending subtask before changing sections
      if (currentSubtask) {
        subtaskItems.push({
          title: currentSubtask.title,
          description: currentSubtask.lines.join('\n').trim(),
          order: subtaskItems.length + 1
        });
        currentSubtask = null;
      }
      currentSection = 'criteria';
      continue;
    }

    if (lowerLine.match(/^#+\s*(implementation notes?|technical notes?|notes?|details?)/i)) {
      // Save any pending subtask before changing sections
      if (currentSubtask) {
        subtaskItems.push({
          title: currentSubtask.title,
          description: currentSubtask.lines.join('\n').trim(),
          order: subtaskItems.length + 1
        });
        currentSubtask = null;
      }
      currentSection = 'notes';
      continue;
    }

    // Parse content based on current section
    switch (currentSection) {
      case 'description':
        descriptionLines.push(line);
        break;

      case 'subtasks':
        // Check if this line starts a new subtask
        // IMPORTANT: Only H3/H4 headers are treated as new subtasks
        // Bullets and numbered lists under headers are part of the description
        const subtaskTitle = extractSubtaskTitleFromHeader(line);
        if (subtaskTitle) {
          // Save previous subtask if exists
          if (currentSubtask) {
            subtaskItems.push({
              title: currentSubtask.title,
              description: currentSubtask.lines.join('\n').trim(),
              order: subtaskItems.length + 1
            });
          }
          // Start new subtask
          currentSubtask = { title: subtaskTitle, lines: [] };
        } else if (currentSubtask && line) {
          // Accumulate description lines for current subtask
          currentSubtask.lines.push(line);
        }
        break;

      case 'dependencies':
        const dep = extractDependency(line);
        if (dep) result.dependencies.push(dep);
        break;

      case 'criteria':
        const criterion = extractListItem(line);
        if (criterion) result.acceptanceCriteria.push(criterion);
        break;

      case 'notes':
        result.implementationNotes.push(line);
        break;
    }
  }

  // Save last pending subtask if exists
  if (currentSubtask) {
    subtaskItems.push({
      title: currentSubtask.title,
      description: currentSubtask.lines.join('\n').trim(),
      order: subtaskItems.length + 1
    });
  }

  // Build description from collected lines
  result.description = descriptionLines
    .join('\n')
    .trim()
    .replace(/\n{3,}/g, '\n\n'); // Normalize multiple newlines

  // Assign parsed subtasks with descriptions
  result.subtasks = subtaskItems.map((item) => ({
    title: item.title,
    description: item.description || undefined,
    order: item.order,
    estimatedComplexity: estimateComplexity(item.title)
  }));

  return result;
}

/**
 * Extract title from markdown - tries first # heading, then filename
 */
function extractTitle(lines: string[], filename: string): string {
  // Look for first # heading
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/);
    if (match) {
      return match[1].trim();
    }
  }

  // Fallback to filename without extension
  return filename
    .replace(/\.md$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Extract subtask title from H3/H4 headers ONLY
 * In "Implementation Steps" sections, only headers represent new subtasks
 * Everything else (bullets, numbered lists) is part of the description
 */
function extractSubtaskTitleFromHeader(line: string): string | null {
  // H3 headers as subtasks (###)
  // Matches: ### 1. Create Plugin Manager Backend
  const h3Match = line.match(/^###\s+(.+)$/);
  if (h3Match) {
    return h3Match[1].trim();
  }

  // H4 headers as subtasks (####)
  const h4Match = line.match(/^####\s+(.+)$/);
  if (h4Match) {
    return h4Match[1].trim();
  }

  return null;
}

/**
 * Estimate complexity from subtask text
 */
function estimateComplexity(text: string): 'simple' | 'medium' | 'complex' | undefined {
  const lower = text.toLowerCase();

  // Simple indicators
  if (lower.match(/\b(update|fix|add|remove|delete|rename)\b/) && lower.length < 80) {
    return 'simple';
  }

  // Complex indicators
  if (lower.match(/\b(design|architect|implement|integrate|migrate|refactor|optimize)\b/)) {
    return 'complex';
  }

  // Medium by default if not obvious
  return 'medium';
}

/**
 * Extract dependency from line
 */
function extractDependency(line: string): string | null {
  // Remove bullet/number prefix
  const cleaned = line.replace(/^\s*[-*+\d.)]\s*/, '').trim();

  if (!cleaned) return null;

  // Extract task reference if present
  const taskMatch = cleaned.match(/task[:\s-]+(.+)/i);
  if (taskMatch) {
    return taskMatch[1].trim();
  }

  return cleaned;
}

/**
 * Extract list item (remove bullet/number prefix)
 */
function extractListItem(line: string): string | null {
  const cleaned = line.replace(/^\s*[-*+\d.)]\s*/, '').trim();
  return cleaned || null;
}

/**
 * Generate a rich task description from parsed content
 */
export function generateRichDescription(parsed: ParsedTask): string {
  const parts: string[] = [];

  // Add main description
  if (parsed.description) {
    parts.push(parsed.description);
  }

  // Add dependencies section
  if (parsed.dependencies.length > 0) {
    parts.push('\n## Dependencies');
    parts.push(parsed.dependencies.map(d => `- ${d}`).join('\n'));
  }

  // Add acceptance criteria
  if (parsed.acceptanceCriteria.length > 0) {
    parts.push('\n## Acceptance Criteria');
    parts.push(parsed.acceptanceCriteria.map(c => `- ${c}`).join('\n'));
  }

  // Add implementation notes
  if (parsed.implementationNotes.length > 0) {
    parts.push('\n## Implementation Notes');
    parts.push(parsed.implementationNotes.join('\n'));
  }

  return parts.join('\n\n').trim();
}
