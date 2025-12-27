import { readFileSync } from 'fs';
import type { ExistingChangelog } from '../../shared/types';

/**
 * Extract the overview section from a spec (typically the first meaningful section)
 */
export function extractSpecOverview(spec: string): string {
  // Split into lines and find the Overview section
  // Handle both Unix (\n) and Windows (\r\n) line endings
  const lines = spec.split(/\r?\n/);
  let inOverview = false;
  const overview: string[] = [];

  for (const line of lines) {
    // Start capturing at Overview heading
    if (/^##\s*Overview/i.test(line)) {
      inOverview = true;
      continue;
    }
    // Stop at next major heading
    if (inOverview && /^##\s/.test(line)) {
      break;
    }
    if (inOverview && line.trim()) {
      overview.push(line);
    }
  }

  // If no overview found, take first paragraph after title
  if (overview.length === 0) {
    const paragraphs = spec.split(/\n\n+/).filter(p => !p.startsWith('#') && p.trim().length > 20);
    if (paragraphs.length > 0) {
      return paragraphs[0].substring(0, 300);
    }
  }

  return overview.join(' ').substring(0, 400);
}

/**
 * Extract changelog content from Claude output
 * Removes AI preambles and finds the actual changelog content
 */
export function extractChangelog(output: string): string {
  // Claude output should be the changelog directly
  // Clean up any potential wrapper text
  let changelog = output.trim();

  // Find where the actual changelog starts (look for markdown heading)
  // This handles cases where AI includes preamble like "I'll analyze..." or "Here's the changelog:"
  const changelogStartPatterns = [
    /^(##\s*\[[\d.]+\])/m,           // Keep-a-changelog: ## [1.0.0]
    /^(##\s*What['']?s\s+New)/im,    // GitHub release: ## What's New
    /^(#\s*Release\s+v?[\d.]+)/im,   // Simple: # Release v1.0.0
    /^(#\s*Changelog)/im,             // # Changelog
    /^(##\s*v?[\d.]+)/m               // ## v1.0.0 or ## 1.0.0
  ];

  for (const pattern of changelogStartPatterns) {
    const match = changelog.match(pattern);
    if (match && match.index !== undefined) {
      // Found a changelog heading - extract from there
      changelog = changelog.substring(match.index);
      break;
    }
  }

  // Additional cleanup - remove common AI preambles if they somehow remain
  const prefixes = [
    /^I['']ll\s+analyze[^#]*(?=#)/is,
    /^I['']ll\s+generate[^#]*(?=#)/is,
    /^Here['']s the changelog[:\s]*/i,
    /^The changelog[:\s]*/i,
    /^Changelog[:\s]*/i,
    /^Based on[^#]*(?=#)/is,
    /^Let me[^#]*(?=#)/is
  ];

  for (const prefix of prefixes) {
    changelog = changelog.replace(prefix, '');
  }

  return changelog.trim();
}

/**
 * Parse existing changelog file and extract metadata
 */
export function parseExistingChangelog(filePath: string): ExistingChangelog {
  try {
    const content = readFileSync(filePath, 'utf-8');

    // Try to extract last version using common patterns
    const versionPatterns = [
      /##\s*\[(\d+\.\d+\.\d+)\]/,  // Keep-a-changelog format
      /v(\d+\.\d+\.\d+)/,           // v1.2.3 format
      /Version\s+(\d+\.\d+\.\d+)/i  // Version 1.2.3 format
    ];

    let lastVersion: string | undefined;
    for (const pattern of versionPatterns) {
      const match = content.match(pattern);
      if (match) {
        lastVersion = match[1];
        break;
      }
    }

    return {
      exists: true,
      content,
      lastVersion
    };
  } catch (error) {
    return {
      exists: true,
      error: error instanceof Error ? error.message : 'Failed to read changelog'
    };
  }
}

/**
 * Parse git log output into GitCommit objects
 */
export function parseGitLogOutput(output: string): Array<{
  hash: string;
  fullHash: string;
  subject: string;
  body?: string;
  author: string;
  authorEmail: string;
  date: string;
}> {
  const commits: Array<{
    hash: string;
    fullHash: string;
    subject: string;
    body?: string;
    author: string;
    authorEmail: string;
    date: string;
  }> = [];

  // Handle both Unix (\n) and Windows (\r\n) line endings
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split('|');
    if (parts.length < 6) continue;

    const [hash, fullHash, subject, author, authorEmail, date] = parts;

    commits.push({
      hash,
      fullHash,
      subject,
      body: undefined, // We don't fetch body for performance
      author,
      authorEmail,
      date
    });
  }

  return commits;
}
