/**
 * Unity Test Results XML Parser
 * Parses Unity Test Framework test-results.xml files
 */

import { readFileSync, existsSync } from 'fs';
import { parseStringPromise } from 'xml2js';

export interface UnityTestSummary {
  passed: number;
  failed: number;
  skipped: number;
  durationSeconds?: number;
}

/**
 * Parse Unity test results XML file
 * Supports multiple XML formats from Unity Test Framework
 */
export async function parseUnityTestResults(xmlPath: string): Promise<UnityTestSummary> {
  const result: UnityTestSummary = {
    passed: 0,
    failed: 0,
    skipped: 0
  };

  if (!existsSync(xmlPath)) {
    return result;
  }

  try {
    const xmlContent = readFileSync(xmlPath, 'utf-8');
    const parsed = await parseStringPromise(xmlContent);

    // Try to extract from root test-run attributes (common format)
    if (parsed['test-run']) {
      const testRun = parsed['test-run'];
      if (testRun.$) {
        const attrs = testRun.$;

        // Extract test counts
        if (attrs.passed !== undefined) result.passed = parseInt(attrs.passed, 10) || 0;
        if (attrs.failed !== undefined) result.failed = parseInt(attrs.failed, 10) || 0;
        if (attrs.skipped !== undefined) result.skipped = parseInt(attrs.skipped, 10) || 0;

        // Also check for inconclusive tests (treat as skipped)
        if (attrs.inconclusive !== undefined) {
          result.skipped += parseInt(attrs.inconclusive, 10) || 0;
        }

        // Extract duration
        if (attrs.duration !== undefined) {
          result.durationSeconds = parseFloat(attrs.duration) || 0;
        }
      }

      // If root attributes didn't work, count test-case elements
      if (result.passed === 0 && result.failed === 0 && result.skipped === 0) {
        const testCases = findTestCases(testRun);
        countTestCases(testCases, result);
      }
    }

    // Try alternative formats (only if no values were extracted from test-run)
    if (parsed['test-results'] && result.passed === 0 && result.failed === 0 && result.skipped === 0) {
      const testResults = parsed['test-results'];
      if (testResults.$) {
        const attrs = testResults.$;
        if (attrs.total) {
          const total = parseInt(attrs.total, 10) || 0;
          const errors = parseInt(attrs.errors, 10) || 0;
          const failures = parseInt(attrs.failures, 10) || 0;
          const notRun = parseInt(attrs['not-run'], 10) || 0;

          result.failed = errors + failures;
          result.skipped = notRun;
          result.passed = Math.max(0, total - result.failed - result.skipped);
        }
      }
    }

  } catch (error) {
    console.error('Failed to parse Unity test results:', error);
  }

  return result;
}

/**
 * Recursively find all test-case elements in the XML tree
 */
function findTestCases(node: any): any[] {
  const testCases: any[] = [];

  if (!node) return testCases;

  // Check if this node has test-case children
  if (node['test-case']) {
    testCases.push(...(Array.isArray(node['test-case']) ? node['test-case'] : [node['test-case']]));
  }

  // Check for test-suite children and recurse
  if (node['test-suite']) {
    const suites = Array.isArray(node['test-suite']) ? node['test-suite'] : [node['test-suite']];
    for (const suite of suites) {
      testCases.push(...findTestCases(suite));
    }
  }

  return testCases;
}

/**
 * Count test cases by their result/outcome attributes
 */
function countTestCases(testCases: any[], result: UnityTestSummary): void {
  for (const testCase of testCases) {
    if (!testCase.$) continue;

    const attrs = testCase.$;
    const resultAttr = (attrs.result || '').toLowerCase();
    const outcomeAttr = (attrs.outcome || '').toLowerCase();

    // Check both 'result' and 'outcome' attributes
    if (resultAttr === 'passed' || outcomeAttr === 'passed') {
      result.passed++;
    } else if (resultAttr === 'failed' || outcomeAttr === 'failed' ||
               resultAttr === 'error' || outcomeAttr === 'error') {
      result.failed++;
    } else if (resultAttr === 'skipped' || outcomeAttr === 'skipped' ||
               resultAttr === 'ignored' || outcomeAttr === 'ignored' ||
               resultAttr === 'inconclusive' || outcomeAttr === 'inconclusive') {
      result.skipped++;
    }
  }
}

/**
 * Format test summary for display
 */
export function formatTestSummary(summary: UnityTestSummary): string {
  const parts: string[] = [];

  if (summary.passed > 0) {
    parts.push(`✅ ${summary.passed}`);
  }

  if (summary.failed > 0) {
    parts.push(`❌ ${summary.failed}`);
  }

  if (summary.skipped > 0) {
    parts.push(`⏭ ${summary.skipped}`);
  }

  if (parts.length === 0) {
    return 'No tests';
  }

  return parts.join(' / ');
}
