/**
 * useFileParser - Hook for parsing JSON task files
 *
 * Handles:
 * - Reading files via FileReader API
 * - JSON parsing with error handling
 * - Schema validation
 * - Converting to ParsedTask format
 */

import { useState, useCallback } from 'react';
import type { TaskFileEntry, ParsedTask } from '../types';

interface UseFileParserOptions {
  onError?: (error: string) => void;
}

interface UseFileParserReturn {
  parsedTasks: ParsedTask[];
  isParsing: boolean;
  parseError: string | null;
  parseFiles: (files: FileList) => Promise<void>;
  clearParsedTasks: () => void;
}

/**
 * Read file content as text using FileReader API
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsText(file);
  });
}

/**
 * Validate a task entry against the expected schema
 */
function validateTaskEntry(task: unknown): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!task || typeof task !== 'object') {
    errors.push('Invalid JSON structure');
    return { isValid: false, errors };
  }

  const entry = task as Record<string, unknown>;

  // Required fields
  if (!entry.title || typeof entry.title !== 'string') {
    errors.push('Missing or invalid "title" field');
  }
  if (!entry.description || typeof entry.description !== 'string') {
    errors.push('Missing or invalid "description" field');
  }

  // Optional field validation
  const validWorkflowTypes = ['feature', 'refactor', 'investigation', 'migration', 'simple'];
  if (entry.workflow_type && !validWorkflowTypes.includes(entry.workflow_type as string)) {
    errors.push(`Invalid workflow_type: ${entry.workflow_type}`);
  }

  const validComplexities = ['simple', 'standard', 'complex'];
  if (entry.complexity && !validComplexities.includes(entry.complexity as string)) {
    errors.push(`Invalid complexity: ${entry.complexity}`);
  }

  const validPriorities = ['low', 'medium', 'high', 'critical'];
  if (entry.priority && !validPriorities.includes(entry.priority as string)) {
    errors.push(`Invalid priority: ${entry.priority}`);
  }

  if (entry.files && !Array.isArray(entry.files)) {
    errors.push('"files" must be an array');
  }

  if (entry.dependencies && !Array.isArray(entry.dependencies)) {
    errors.push('"dependencies" must be an array');
  }

  if (entry.phase !== undefined && typeof entry.phase !== 'number') {
    errors.push('"phase" must be a number');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Parse a single JSON file into a ParsedTask
 */
async function parseTaskFile(file: File): Promise<ParsedTask | null> {
  // Skip index files
  if (file.name.startsWith('_')) {
    return null;
  }

  // Only process .json files
  if (!file.name.endsWith('.json')) {
    return null;
  }

  try {
    const content = await readFileAsText(file);
    const parsed = JSON.parse(content) as TaskFileEntry;
    const validation = validateTaskEntry(parsed);

    return {
      ...parsed,
      parseId: crypto.randomUUID(),
      sourceFile: file.name,
      isValid: validation.isValid,
      validationErrors: validation.errors
    };
  } catch (error) {
    // Return invalid task with parse error
    return {
      title: file.name.replace('.json', ''),
      description: '',
      parseId: crypto.randomUUID(),
      sourceFile: file.name,
      isValid: false,
      validationErrors: [error instanceof Error ? error.message : 'Failed to parse JSON']
    };
  }
}

export function useFileParser(options: UseFileParserOptions = {}): UseFileParserReturn {
  const { onError } = options;

  const [parsedTasks, setParsedTasks] = useState<ParsedTask[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const parseFiles = useCallback(async (files: FileList) => {
    if (files.length === 0) return;

    setIsParsing(true);
    setParseError(null);

    try {
      const tasks: ParsedTask[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const parsed = await parseTaskFile(file);
        if (parsed) {
          tasks.push(parsed);
        }
      }

      if (tasks.length === 0) {
        const error = 'No valid JSON task files found';
        setParseError(error);
        onError?.(error);
        return;
      }

      // Sort by filename (to maintain order like 001, 002, etc.)
      tasks.sort((a, b) => a.sourceFile.localeCompare(b.sourceFile));

      setParsedTasks(tasks);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to parse files';
      setParseError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsParsing(false);
    }
  }, [onError]);

  const clearParsedTasks = useCallback(() => {
    setParsedTasks([]);
    setParseError(null);
  }, []);

  return {
    parsedTasks,
    isParsing,
    parseError,
    parseFiles,
    clearParsedTasks
  };
}
