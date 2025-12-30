import { Bold, Italic, Code, List, ListOrdered, Quote, Link, Heading1, Heading2 } from 'lucide-react';
import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from './ui/tooltip';
import { cn } from '../lib/utils';

interface FormattingToolbarProps {
  onFormat: (format: FormatType) => void;
  className?: string;
}

export type FormatType = 
  | 'bold' 
  | 'italic' 
  | 'code' 
  | 'codeBlock'
  | 'heading1'
  | 'heading2'
  | 'list'
  | 'orderedList'
  | 'quote'
  | 'link';

const formatButtons: Array<{
  type: FormatType;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut: string;
}> = [
  { type: 'bold', icon: Bold, label: 'Bold', shortcut: 'Ctrl+B' },
  { type: 'italic', icon: Italic, label: 'Italic', shortcut: 'Ctrl+I' },
  { type: 'code', icon: Code, label: 'Inline Code', shortcut: 'Ctrl+E' },
  { type: 'codeBlock', icon: Code, label: 'Code Block', shortcut: 'Ctrl+Shift+E' },
  { type: 'heading1', icon: Heading1, label: 'Heading 1', shortcut: 'Ctrl+Shift+1' },
  { type: 'heading2', icon: Heading2, label: 'Heading 2', shortcut: 'Ctrl+Shift+2' },
  { type: 'list', icon: List, label: 'Bullet List', shortcut: 'Ctrl+Shift+L' },
  { type: 'orderedList', icon: ListOrdered, label: 'Numbered List', shortcut: 'Ctrl+Shift+O' },
  { type: 'quote', icon: Quote, label: 'Quote', shortcut: 'Ctrl+Shift+Q' },
  { type: 'link', icon: Link, label: 'Link', shortcut: 'Ctrl+K' },
];

export function FormattingToolbar({ onFormat, className }: FormattingToolbarProps) {
  return (
    <div className={cn('flex items-center gap-1 p-2 border-b border-border bg-muted/30', className)}>
      <span className="text-xs text-muted-foreground mr-2">Format:</span>
      {formatButtons.map((button) => (
        <Tooltip key={button.type}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onFormat(button.type)}
              type="button"
            >
              <button.icon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs">
              <div>{button.label}</div>
              <div className="text-muted-foreground">{button.shortcut}</div>
            </div>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/**
 * Apply formatting to text at cursor position or selection
 */
export function applyFormatting(
  textarea: HTMLTextAreaElement,
  formatType: FormatType
): void {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const selectedText = value.substring(start, end);
  
  let replacement = '';
  let cursorOffset = 0;

  switch (formatType) {
    case 'bold':
      replacement = `**${selectedText || 'bold text'}**`;
      cursorOffset = selectedText ? replacement.length : 2;
      break;
    
    case 'italic':
      replacement = `*${selectedText || 'italic text'}*`;
      cursorOffset = selectedText ? replacement.length : 1;
      break;
    
    case 'code':
      replacement = `\`${selectedText || 'code'}\``;
      cursorOffset = selectedText ? replacement.length : 1;
      break;
    
    case 'codeBlock':
      replacement = `\`\`\`\n${selectedText || 'code'}\n\`\`\``;
      cursorOffset = selectedText ? replacement.length - 4 : 4;
      break;
    
    case 'heading1':
      replacement = `# ${selectedText || 'Heading'}`;
      cursorOffset = replacement.length;
      break;
    
    case 'heading2':
      replacement = `## ${selectedText || 'Heading'}`;
      cursorOffset = replacement.length;
      break;
    
    case 'list':
      const listLines = selectedText.split('\n').map(line => `- ${line}`).join('\n');
      replacement = selectedText ? listLines : '- Item';
      cursorOffset = replacement.length;
      break;
    
    case 'orderedList':
      const orderedLines = selectedText.split('\n').map((line, i) => `${i + 1}. ${line}`).join('\n');
      replacement = selectedText ? orderedLines : '1. Item';
      cursorOffset = replacement.length;
      break;
    
    case 'quote':
      const quoteLines = selectedText.split('\n').map(line => `> ${line}`).join('\n');
      replacement = selectedText ? quoteLines : '> Quote';
      cursorOffset = replacement.length;
      break;
    
    case 'link':
      replacement = `[${selectedText || 'link text'}](url)`;
      cursorOffset = selectedText ? replacement.length - 4 : 1;
      break;
  }

  // Replace text
  const newValue = value.substring(0, start) + replacement + value.substring(end);
  textarea.value = newValue;
  
  // Set cursor position
  const newCursorPos = start + cursorOffset;
  textarea.setSelectionRange(newCursorPos, newCursorPos);
  
  // Trigger change event
  const event = new Event('input', { bubbles: true });
  textarea.dispatchEvent(event);
  
  // Focus textarea
  textarea.focus();
}

/**
 * Handle keyboard shortcuts for formatting
 */
export function handleFormattingShortcut(
  e: React.KeyboardEvent<HTMLTextAreaElement>
): FormatType | null {
  if (!e.ctrlKey && !e.metaKey) return null;

  // Ctrl+B - Bold
  if (e.key === 'b' || e.key === 'B') {
    e.preventDefault();
    return 'bold';
  }

  // Ctrl+I - Italic
  if (e.key === 'i' || e.key === 'I') {
    e.preventDefault();
    return 'italic';
  }

  // Ctrl+E - Inline code
  if (e.key === 'e' || e.key === 'E') {
    e.preventDefault();
    return e.shiftKey ? 'codeBlock' : 'code';
  }

  // Ctrl+K - Link
  if (e.key === 'k' || e.key === 'K') {
    e.preventDefault();
    return 'link';
  }

  // Ctrl+Shift+1 - Heading 1
  if (e.shiftKey && e.key === '!') {
    e.preventDefault();
    return 'heading1';
  }

  // Ctrl+Shift+2 - Heading 2
  if (e.shiftKey && e.key === '@') {
    e.preventDefault();
    return 'heading2';
  }

  // Ctrl+Shift+L - List
  if (e.shiftKey && (e.key === 'l' || e.key === 'L')) {
    e.preventDefault();
    return 'list';
  }

  // Ctrl+Shift+O - Ordered List
  if (e.shiftKey && (e.key === 'o' || e.key === 'O')) {
    e.preventDefault();
    return 'orderedList';
  }

  // Ctrl+Shift+Q - Quote
  if (e.shiftKey && (e.key === 'q' || e.key === 'Q')) {
    e.preventDefault();
    return 'quote';
  }

  return null;
}
