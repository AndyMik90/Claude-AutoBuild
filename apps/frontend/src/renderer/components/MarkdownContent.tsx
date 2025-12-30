import { useMemo } from 'react';
import { ExternalLink, FileCode } from 'lucide-react';
import { cn } from '../lib/utils';
import { getTextDirection } from '../lib/rtl-utils';
import { IPC_CHANNELS } from '../../shared/constants/ipc';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

interface ParsedBlock {
  type: 'text' | 'code' | 'file-link';
  content: string;
  language?: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
}

/**
 * Parses markdown-style content with code blocks and file references
 * Supports:
 * - ```language\ncode\n```
 * - [file.ts](file.ts)
 * - [file.ts:10-20](file.ts#L10-L20)
 */
function parseContent(content: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let currentIndex = 0;

  // Regex patterns
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const fileLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  // Find all code blocks and file links
  const matches: Array<{ start: number; end: number; block: ParsedBlock }> = [];

  // Find code blocks
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      block: {
        type: 'code',
        content: match[2].trim(),
        language: match[1] || 'text'
      }
    });
  }

  // Find file links
  fileLinkRegex.lastIndex = 0;
  while ((match = fileLinkRegex.exec(content)) !== null) {
    const displayText = match[1];
    const target = match[2];
    
    // Parse file path and line numbers
    const lineMatch = target.match(/^(.+?)#L(\d+)(?:-L(\d+))?$/);
    const filePath = lineMatch ? lineMatch[1] : target;
    const lineStart = lineMatch ? parseInt(lineMatch[2]) : undefined;
    const lineEnd = lineMatch && lineMatch[3] ? parseInt(lineMatch[3]) : lineStart;

    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      block: {
        type: 'file-link',
        content: displayText,
        filePath,
        lineStart,
        lineEnd
      }
    });
  }

  // Sort matches by position
  matches.sort((a, b) => a.start - b.start);

  // Build blocks array
  matches.forEach(({ start, end, block }) => {
    // Add text before this match
    if (start > currentIndex) {
      const textContent = content.substring(currentIndex, start).trim();
      if (textContent) {
        blocks.push({
          type: 'text',
          content: textContent
        });
      }
    }

    // Add the match
    blocks.push(block);
    currentIndex = end;
  });

  // Add remaining text
  if (currentIndex < content.length) {
    const textContent = content.substring(currentIndex).trim();
    if (textContent) {
      blocks.push({
        type: 'text',
        content: textContent
      });
    }
  }

  // If no blocks were created, return the original content as text
  if (blocks.length === 0) {
    blocks.push({
      type: 'text',
      content: content
    });
  }

  return blocks;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  const blocks = useMemo(() => parseContent(content), [content]);

  const handleFileClick = async (filePath: string, lineStart?: number, lineEnd?: number) => {
    // Open file in VS Code
    const params = {
      filePath,
      lineStart,
      lineEnd
    };
    
    try {
      await window.electron.ipcRenderer.invoke(IPC_CHANNELS.FILE_OPEN, params);
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'code':
            return (
              <div key={index} className="relative group">
                <div className="absolute right-2 top-2 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-1 rounded border border-border">
                  {block.language}
                </div>
                <pre className="overflow-x-auto rounded-lg bg-muted/50 border border-border p-4 text-sm font-mono">
                  <code className={`language-${block.language}`}>
                    {block.content}
                  </code>
                </pre>
              </div>
            );

          case 'file-link':
            return (
              <button
                key={index}
                type="button"
                onClick={() => handleFileClick(block.filePath!, block.lineStart, block.lineEnd)}
                className="inline-flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                <FileCode className="h-4 w-4" />
                <span>{block.content}</span>
                {block.lineStart && (
                  <span className="text-xs text-muted-foreground">
                    L{block.lineStart}{block.lineEnd !== block.lineStart ? `-${block.lineEnd}` : ''}
                  </span>
                )}
                <ExternalLink className="h-3 w-3" />
              </button>
            );

          case 'text':
          default:
            const textDir = getTextDirection(block.content);
            return (
              <p 
                key={index} 
                dir={textDir}
                className={cn(
                  'whitespace-pre-wrap text-sm leading-relaxed',
                  textDir === 'rtl' ? 'text-right' : 'text-left'
                )}
              >
                {block.content}
              </p>
            );
        }
      })}
    </div>
  );
}
