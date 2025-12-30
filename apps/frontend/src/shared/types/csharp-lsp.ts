/**
 * C# Language Service (LSP) types
 */

export type CSharpLspStatus = 'stopped' | 'starting' | 'ready' | 'error';

export interface CSharpLspStatusResponse {
  state: CSharpLspStatus;
  message?: string;
}

export interface CSharpLspPosition {
  line: number; // 0-based
  column: number; // 0-based
}

export interface CSharpLspRange {
  start: CSharpLspPosition;
  end: CSharpLspPosition;
}

export interface CSharpLspLocation {
  uri: string; // file:// URI
  range: CSharpLspRange;
}

export interface CSharpLspCompletionItem {
  label: string;
  kind?: number; // LSP CompletionItemKind
  detail?: string;
  documentation?: string;
  insertText?: string;
  insertTextFormat?: number; // 1 = PlainText, 2 = Snippet
  sortText?: string;
  filterText?: string;
  preselect?: boolean;
  commitCharacters?: string[];
  data?: unknown;
}

export interface CSharpLspCompletionList {
  isIncomplete: boolean;
  items: CSharpLspCompletionItem[];
}

export interface CSharpLspHoverContent {
  language?: string;
  value: string;
}

export interface CSharpLspHover {
  contents: CSharpLspHoverContent | CSharpLspHoverContent[] | string;
  range?: CSharpLspRange;
}

export type CSharpLspDiagnosticSeverity = 1 | 2 | 3 | 4; // Error, Warning, Info, Hint

export interface CSharpLspDiagnostic {
  range: CSharpLspRange;
  severity?: CSharpLspDiagnosticSeverity;
  code?: string | number;
  source?: string;
  message: string;
  relatedInformation?: Array<{
    location: CSharpLspLocation;
    message: string;
  }>;
}

export interface CSharpLspPublishDiagnosticsParams {
  relPath: string;
  diagnostics: CSharpLspDiagnostic[];
}

export interface CSharpLspTextEdit {
  range: CSharpLspRange;
  newText: string;
}

export interface CSharpLspLogMessage {
  level: 'error' | 'warn' | 'info' | 'log';
  message: string;
}

export interface CSharpLspProgressMessage {
  message: string;
  percent?: number;
}
