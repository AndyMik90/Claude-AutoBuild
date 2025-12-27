import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

export interface TemplateParameter {
  key: string; // Unique key for this parameter (generated from position)
  title: string;
  type: 'text' | 'dropdown' | 'secret';
  options?: string[]; // For dropdown type
  default?: string;
  group?: string; // For secret type
  secretKey?: string; // For secret type (the key within the group)
  placeholder?: string; // Original placeholder text in file
  filePath: string; // File where this parameter was found
  position: number; // Position in file for replacement
}

export interface ParsedTemplate {
  parameters: TemplateParameter[];
  totalFiles: number;
  filesWithParameters: number;
}

/**
 * Parse a parameter string like: {{title="Hello",type=text,default="World"}}
 */
function parseParameterString(paramStr: string): Omit<TemplateParameter, 'key' | 'filePath' | 'position'> | null {
  try {
    console.log('[PARSER] Parsing parameter string:', paramStr);

    // Extract content between {{ and }}
    const match = paramStr.match(/\{\{(.+?)\}\}/);
    if (!match) {
      console.log('[PARSER] No match for {{}} pattern');
      return null;
    }

    const content = match[1];
    console.log('[PARSER] Extracted content:', content);

    // Parse key-value pairs (handle quoted values)
    const pairs: Record<string, string> = {};
    const regex = /(\w+)\s*=\s*(?:"([^"]*)"|([^,}\s]+))/g;
    let pairMatch;

    while ((pairMatch = regex.exec(content)) !== null) {
      const key = pairMatch[1];
      console.log('[PARSER] Regex groups:', {
        key: pairMatch[1],
        quotedValue: pairMatch[2],
        unquotedValue: pairMatch[3],
        fullMatch: pairMatch[0]
      });
      let value = pairMatch[2] !== undefined ? pairMatch[2] : pairMatch[3]; // Use quoted value or unquoted
      console.log('[PARSER] Initial value:', JSON.stringify(value));
      // Strip any remaining quotes from the value (both straight and smart quotes using Unicode)
      if (value) {
        // Remove straight quotes: ' "
        // Remove smart quotes: " " ' ' (Unicode \u201C \u201D \u2018 \u2019)
        value = value.replace(/['""\u201C\u201D''\u2018\u2019]/g, '');
      }
      console.log('[PARSER] After quote strip:', JSON.stringify(value));
      pairs[key] = value;
    }

    console.log('[PARSER] All pairs:', pairs);

    if (!pairs.title || !pairs.type) {
      console.log('[PARSER] Missing required fields. title:', pairs.title, 'type:', pairs.type);
      return null; // Required fields missing
    }

    const param: Omit<TemplateParameter, 'key' | 'filePath' | 'position'> = {
      title: pairs.title,
      type: pairs.type as 'text' | 'dropdown' | 'secret',
      placeholder: paramStr
    };

    // Optional fields based on type
    if (pairs.default) {
      param.default = pairs.default;
    }

    if (pairs.type === 'dropdown' && pairs.options) {
      param.options = pairs.options.split(',').map(o => o.trim().replace(/['""\u201C\u201D''\u2018\u2019]/g, ''));
    }

    if (pairs.type === 'secret') {
      if (pairs.group) param.group = pairs.group;
      if (pairs.key) param.secretKey = pairs.key;
    }

    console.log('[PARSER] Successfully parsed parameter:', param);
    return param;
  } catch (error) {
    console.error('[PARSER] Failed to parse parameter:', paramStr, error);
    return null;
  }
}

/**
 * Recursively scan a directory for files (excluding certain directories)
 */
function scanDirectory(dirPath: string, excludeDirs: string[] = ['.git', 'node_modules', '.next', 'dist', 'build']): string[] {
  const files: string[] = [];

  function scan(currentPath: string) {
    try {
      const items = readdirSync(currentPath);

      for (const item of items) {
        const fullPath = path.join(currentPath, item);
        const stats = statSync(fullPath);

        if (stats.isDirectory()) {
          // Skip excluded directories
          if (!excludeDirs.includes(item)) {
            scan(fullPath);
          }
        } else if (stats.isFile()) {
          // Only process text files (exclude binary files)
          const ext = path.extname(item).toLowerCase();
          const textExts = [
            '.txt', '.md', '.json', '.js', '.jsx', '.ts', '.tsx',
            '.html', '.css', '.scss', '.sass', '.less',
            '.py', '.java', '.c', '.cpp', '.h', '.hpp',
            '.go', '.rs', '.rb', '.php', '.sh', '.bash',
            '.yml', '.yaml', '.toml', '.xml', '.env',
            '.gitignore', '.dockerignore', '.editorconfig'
          ];
          const isBinaryExt = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.zip', '.tar', '.gz'].includes(ext);

          if (textExts.includes(ext) || (!isBinaryExt && !ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${currentPath}:`, error);
    }
  }

  scan(dirPath);
  return files;
}

/**
 * Parse a template directory and extract all dynamic parameters
 */
export function parseTemplateDirectory(templatePath: string): ParsedTemplate {
  console.log('[TEMPLATE_PARSER] Starting parse for:', templatePath);
  const parameters: TemplateParameter[] = [];
  const files = scanDirectory(templatePath);
  console.log('[TEMPLATE_PARSER] Found', files.length, 'files to scan');
  let filesWithParameters = 0;
  let paramCounter = 0;

  const paramRegex = /\{\{[^}]+\}\}/g;

  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const matches = content.matchAll(paramRegex);
      let fileHasParams = false;

      for (const match of matches) {
        console.log('[TEMPLATE_PARSER] Found parameter:', match[0], 'in', filePath);
        const parsed = parseParameterString(match[0]);
        if (parsed) {
          console.log('[TEMPLATE_PARSER] Parsed parameter:', parsed);
          parameters.push({
            ...parsed,
            key: `param_${paramCounter++}`,
            filePath: filePath,
            position: match.index || 0
          });
          fileHasParams = true;
        } else {
          console.log('[TEMPLATE_PARSER] Failed to parse parameter:', match[0]);
        }
      }

      if (fileHasParams) {
        filesWithParameters++;
      }
    } catch (error) {
      // Skip files that can't be read as text
      continue;
    }
  }

  console.log('[TEMPLATE_PARSER] Total parameters found:', parameters.length);
  return {
    parameters,
    totalFiles: files.length,
    filesWithParameters
  };
}

/**
 * Replace template parameters in files with provided values
 */
export function replaceTemplateParameters(
  filePath: string,
  replacements: Map<string, string>
): string {
  try {
    let content = readFileSync(filePath, 'utf-8');

    // Replace each placeholder with its value
    for (const [placeholder, value] of replacements.entries()) {
      content = content.replace(new RegExp(escapeRegex(placeholder), 'g'), value);
    }

    return content;
  } catch (error) {
    console.error(`Failed to replace parameters in ${filePath}:`, error);
    throw error;
  }
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
