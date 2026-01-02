import { useState } from 'react';
import { ArrowLeft, Terminal, Container, Rocket, Layers, Wrench, HelpCircle, Copy, Check } from 'lucide-react';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import type { Guide } from './types';

const iconMap = {
  terminal: Terminal,
  container: Container,
  rocket: Rocket,
  layers: Layers,
  wrench: Wrench,
  help: HelpCircle
} as const;

interface GuideViewerProps {
  guide: Guide;
  onBack: () => void;
}

export function GuideViewer({ guide, onBack }: GuideViewerProps) {
  const [copiedBlock, setCopiedBlock] = useState<number | null>(null);
  const Icon = iconMap[guide.icon as keyof typeof iconMap] || Terminal;

  const handleCopyCode = async (code: string, index: number) => {
    await navigator.clipboard.writeText(code);
    setCopiedBlock(index);
    setTimeout(() => setCopiedBlock(null), 2000);
  };

  // Parse and render markdown content
  const renderContent = () => {
    const lines = guide.content.split('\n');
    const elements: JSX.Element[] = [];
    let codeBlockIndex = 0;
    let inCodeBlock = false;
    let codeContent: string[] = [];
    let codeLanguage = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Handle code blocks
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLanguage = line.slice(3).trim();
          codeContent = [];
        } else {
          const currentIndex = codeBlockIndex;
          const code = codeContent.join('\n');
          elements.push(
            <div key={`code-${i}`} className="relative group my-4">
              <div className="flex items-center justify-between bg-muted/50 border border-border rounded-t-lg px-4 py-2">
                <span className="text-xs text-muted-foreground font-mono">
                  {codeLanguage || 'code'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => handleCopyCode(code, currentIndex)}
                >
                  {copiedBlock === currentIndex ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <pre className="bg-muted/30 border border-t-0 border-border rounded-b-lg p-4 overflow-x-auto">
                <code className="text-sm font-mono text-foreground">{code}</code>
              </pre>
            </div>
          );
          inCodeBlock = false;
          codeBlockIndex++;
        }
        continue;
      }

      if (inCodeBlock) {
        codeContent.push(line);
        continue;
      }

      // Headers
      if (line.startsWith('# ')) {
        // Skip the first H1 - we show it in the header
        if (elements.length === 0 && line.slice(2).trim() === guide.title) {
          continue;
        }
        elements.push(
          <h1 key={i} className="text-2xl font-bold text-foreground mt-8 mb-4 first:mt-0">
            {line.slice(2)}
          </h1>
        );
      } else if (line.startsWith('## ')) {
        elements.push(
          <h2 key={i} className="text-xl font-semibold text-foreground mt-6 mb-3 border-b border-border pb-2">
            {line.slice(3)}
          </h2>
        );
      } else if (line.startsWith('### ')) {
        elements.push(
          <h3 key={i} className="text-lg font-semibold text-foreground mt-5 mb-2">
            {line.slice(4)}
          </h3>
        );
      } else if (line.startsWith('#### ')) {
        elements.push(
          <h4 key={i} className="text-base font-semibold text-foreground mt-4 mb-2">
            {line.slice(5)}
          </h4>
        );
      }
      // Horizontal rule
      else if (line.trim() === '---') {
        elements.push(<hr key={i} className="my-6 border-border" />);
      }
      // Blockquotes
      else if (line.startsWith('> ')) {
        elements.push(
          <blockquote key={i} className="border-l-4 border-primary/50 pl-4 py-1 my-3 text-muted-foreground italic bg-muted/30 rounded-r-lg pr-4">
            {renderInlineMarkdown(line.slice(2))}
          </blockquote>
        );
      }
      // Tables
      else if (line.includes('|') && line.trim().startsWith('|')) {
        // Collect all table rows
        const tableRows: string[] = [line];
        while (i + 1 < lines.length && lines[i + 1].includes('|')) {
          i++;
          tableRows.push(lines[i]);
        }
        elements.push(renderTable(tableRows, i));
      }
      // Lists
      else if (line.match(/^[-*] /)) {
        elements.push(
          <li key={i} className="ml-4 text-foreground flex items-start gap-2 my-1">
            <span className="text-primary mt-1.5">&#8226;</span>
            <span>{renderInlineMarkdown(line.slice(2))}</span>
          </li>
        );
      } else if (line.match(/^\d+\. /)) {
        const num = line.match(/^(\d+)\./)?.[1];
        elements.push(
          <li key={i} className="ml-4 text-foreground flex items-start gap-2 my-1">
            <span className="text-primary font-medium min-w-[1.5rem]">{num}.</span>
            <span>{renderInlineMarkdown(line.replace(/^\d+\. /, ''))}</span>
          </li>
        );
      }
      // Empty lines
      else if (line.trim() === '') {
        elements.push(<div key={i} className="h-2" />);
      }
      // Regular paragraphs
      else {
        elements.push(
          <p key={i} className="text-foreground leading-relaxed my-2">
            {renderInlineMarkdown(line)}
          </p>
        );
      }
    }

    return elements;
  };

  const renderInlineMarkdown = (text: string) => {
    // Handle inline code
    const parts = text.split(/(`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-primary">
            {part.slice(1, -1)}
          </code>
        );
      }
      // Handle bold
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
      return boldParts.map((bp, j) => {
        if (bp.startsWith('**') && bp.endsWith('**')) {
          return <strong key={`${i}-${j}`} className="font-semibold">{bp.slice(2, -2)}</strong>;
        }
        // Handle links
        const linkMatch = bp.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (linkMatch) {
          const beforeLink = bp.slice(0, linkMatch.index);
          const afterLink = bp.slice((linkMatch.index ?? 0) + linkMatch[0].length);
          return (
            <span key={`${i}-${j}`}>
              {beforeLink}
              <a
                href={linkMatch[2]}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {linkMatch[1]}
              </a>
              {afterLink}
            </span>
          );
        }
        return bp;
      });
    });
  };

  const renderTable = (rows: string[], keyBase: number) => {
    const headers = rows[0].split('|').filter(Boolean).map(h => h.trim());
    const dataRows = rows.slice(2).map(row => row.split('|').filter(Boolean).map(c => c.trim()));

    return (
      <div key={`table-${keyBase}`} className="my-4 overflow-x-auto">
        <table className="w-full border-collapse border border-border rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-muted/50">
              {headers.map((header, i) => (
                <th key={i} className="border border-border px-4 py-2 text-left font-semibold text-foreground">
                  {renderInlineMarkdown(header)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, i) => (
              <tr key={i} className="hover:bg-muted/30">
                {row.map((cell, j) => (
                  <td key={j} className="border border-border px-4 py-2 text-foreground">
                    {renderInlineMarkdown(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-border px-6 py-4 bg-card/50">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-semibold text-foreground">{guide.title}</h1>
          <p className="text-sm text-muted-foreground">{guide.description}</p>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto px-6 py-8">
          {renderContent()}
        </div>
      </ScrollArea>
    </div>
  );
}
