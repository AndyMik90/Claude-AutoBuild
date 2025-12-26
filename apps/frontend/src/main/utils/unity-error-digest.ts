/**
 * Unity Error Digest Builder
 * Extracts and formats errors from unity-editor.log files
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

export interface UnityErrorSummary {
  errorCount: number;
  firstErrorLine?: string;
}

interface ErrorBlock {
  lineNumber: number;
  startLineNumber: number;
  lines: string[];
}

/**
 * Build error digest from Unity editor log
 * Detects errors using practical patterns and provides context lines
 */
export function buildUnityErrorDigest(
  unityLogPath: string,
  outPath: string,
  options: {
    contextBefore?: number;
    contextAfter?: number;
    maxLines?: number;
    maxSizeKB?: number;
  } = {}
): UnityErrorSummary {
  const {
    contextBefore = 2,
    contextAfter = 6,
    maxLines = 2000,
    maxSizeKB = 200
  } = options;

  const summary: UnityErrorSummary = {
    errorCount: 0
  };

  if (!existsSync(unityLogPath)) {
    writeFileSync(outPath, 'No Unity log file found.\n', 'utf-8');
    return summary;
  }

  try {
    const logContent = readFileSync(unityLogPath, 'utf-8');
    const lines = logContent.split('\n');

    // Find all error lines
    const errorLineIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (isErrorLine(lines[i])) {
        errorLineIndices.push(i);
      }
    }

    summary.errorCount = errorLineIndices.length;

    if (errorLineIndices.length === 0) {
      writeFileSync(outPath, 'No errors detected in Unity log.\n', 'utf-8');
      return summary;
    }

    // Capture first error for summary
    if (errorLineIndices.length > 0) {
      summary.firstErrorLine = lines[errorLineIndices[0]].trim().substring(0, 150);
    }

    // Build error blocks with context
    const errorBlocks = buildErrorBlocks(lines, errorLineIndices, contextBefore, contextAfter);

    // Format digest output
    const digestLines: string[] = [];
    digestLines.push('='.repeat(80));
    digestLines.push(`Unity Error Digest - ${errorBlocks.length} error(s) detected`);
    digestLines.push('='.repeat(80));
    digestLines.push('');

    let totalLines = digestLines.length;

    for (let i = 0; i < errorBlocks.length; i++) {
      const block = errorBlocks[i];

      // Check limits
      if (totalLines + block.lines.length > maxLines) {
        digestLines.push('');
        digestLines.push(`[Digest truncated: max ${maxLines} lines reached]`);
        digestLines.push(`[${errorBlocks.length - i} more error(s) not shown]`);
        break;
      }

      digestLines.push(`--- Error ${i + 1} at line ${block.lineNumber + 1} ---`);
      digestLines.push(...block.lines);
      digestLines.push('');

      totalLines += block.lines.length + 2;
    }

    const digestContent = digestLines.join('\n');

    // Check size limit
    const sizeKB = Buffer.byteLength(digestContent, 'utf-8') / 1024;
    if (sizeKB > maxSizeKB) {
      // Truncate by taking first N KB
      const truncated = digestContent.substring(0, maxSizeKB * 1024);
      writeFileSync(
        outPath,
        truncated + `\n\n[Digest truncated: max ${maxSizeKB} KB reached]`,
        'utf-8'
      );
    } else {
      writeFileSync(outPath, digestContent, 'utf-8');
    }

  } catch (error) {
    console.error('Failed to build Unity error digest:', error);
    writeFileSync(
      outPath,
      `Error building digest: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'utf-8'
    );
  }

  return summary;
}

/**
 * Check if a line contains an error
 */
function isErrorLine(line: string): boolean {
  const trimmed = line.trim();

  // Skip empty lines
  if (!trimmed) return false;

  // Compilation errors (C# compiler)
  if (/error CS\d+/i.test(trimmed)) return true;
  if (/Compilation failed/i.test(trimmed)) return true;

  // Asset compilation errors (Unity-specific format)
  // Example: Assets/Scripts/MyScript.cs(12,5): error CS0103: ...
  if (/Assets\/.*\(\d+,\d+\):\s*error/i.test(trimmed)) return true;

  // Exceptions
  if (/Exception:/i.test(trimmed)) return true;
  if (/NullReferenceException/i.test(trimmed)) return true;
  if (/ArgumentException/i.test(trimmed)) return true;
  if (/ArgumentNullException/i.test(trimmed)) return true;
  if (/InvalidOperationException/i.test(trimmed)) return true;
  if (/IndexOutOfRangeException/i.test(trimmed)) return true;

  // Unity error messages
  if (/^\[Error\]/i.test(trimmed)) return true;
  if (/^Error:/i.test(trimmed)) return true;
  if (/^ERROR:/i.test(trimmed)) return true;

  // Unity-specific errors
  if (/UnityEngine.*Error/i.test(trimmed)) return true;
  if (/AssetDatabase.*error/i.test(trimmed)) return true;

  return false;
}

/**
 * Build error blocks with context lines
 * De-duplicates overlapping blocks
 */
function buildErrorBlocks(
  lines: string[],
  errorIndices: number[],
  contextBefore: number,
  contextAfter: number
): ErrorBlock[] {
  const blocks: ErrorBlock[] = [];

  for (const errorIdx of errorIndices) {
    const startIdx = Math.max(0, errorIdx - contextBefore);
    const endIdx = Math.min(lines.length - 1, errorIdx + contextAfter);

    const blockLines: string[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      blockLines.push(lines[i]);
    }

    blocks.push({
      lineNumber: errorIdx,
      startLineNumber: startIdx,
      lines: blockLines
    });
  }

  // De-duplicate overlapping blocks
  const mergedBlocks: ErrorBlock[] = [];
  let currentBlock: ErrorBlock | null = null;

  for (const block of blocks) {
    if (!currentBlock) {
      currentBlock = block;
      continue;
    }

    // Check if this block overlaps with current block
    const currentEndLine = currentBlock.startLineNumber + currentBlock.lines.length - 1;
    const blockStartLine = block.startLineNumber;

    if (blockStartLine <= currentEndLine + 1) {
      // Merge blocks
      // Calculate how many lines from block.lines are already in currentBlock
      const overlapSize = currentEndLine - block.startLineNumber + 1;
      const linesToAdd = overlapSize > 0 ? block.lines.slice(overlapSize) : block.lines;
      currentBlock.lines.push(...linesToAdd);
    } else {
      // No overlap, save current and start new
      mergedBlocks.push(currentBlock);
      currentBlock = block;
    }
  }

  if (currentBlock) {
    mergedBlocks.push(currentBlock);
  }

  return mergedBlocks;
}
