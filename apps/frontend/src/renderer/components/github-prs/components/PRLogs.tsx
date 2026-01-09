import { useState } from 'react';
import {
  Terminal,
  Loader2,
  FolderOpen,
  BrainCircuit,
  FileCheck,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Info,
  Clock
} from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../../ui/collapsible';
import { cn } from '../../../lib/utils';
import type {
  PRLogs,
  PRLogPhase,
  PRPhaseLog,
  PRLogEntry
} from '../../../../preload/api/modules/github-api';

interface PRLogsProps {
  prNumber: number;
  logs: PRLogs | null;
  isLoading: boolean;
  isStreaming?: boolean;
}

const PHASE_LABELS: Record<PRLogPhase, string> = {
  context: 'Context Gathering',
  analysis: 'AI Analysis',
  synthesis: 'Synthesis'
};

const PHASE_ICONS: Record<PRLogPhase, typeof FolderOpen> = {
  context: FolderOpen,
  analysis: BrainCircuit,
  synthesis: FileCheck
};

const PHASE_COLORS: Record<PRLogPhase, string> = {
  context: 'text-blue-500 bg-blue-500/10 border-blue-500/30',
  analysis: 'text-purple-500 bg-purple-500/10 border-purple-500/30',
  synthesis: 'text-green-500 bg-green-500/10 border-green-500/30'
};

// Source colors for different log sources
const SOURCE_COLORS: Record<string, string> = {
  'Context': 'bg-blue-500/20 text-blue-400',
  'AI': 'bg-purple-500/20 text-purple-400',
  'Orchestrator': 'bg-orange-500/20 text-orange-400',
  'ParallelOrchestrator': 'bg-orange-500/20 text-orange-400',
  'Followup': 'bg-cyan-500/20 text-cyan-400',
  'ParallelFollowup': 'bg-cyan-500/20 text-cyan-400',
  'BotDetector': 'bg-amber-500/20 text-amber-400',
  'Progress': 'bg-green-500/20 text-green-400',
  'PR Review Engine': 'bg-indigo-500/20 text-indigo-400',
  'Summary': 'bg-emerald-500/20 text-emerald-400',
  // Specialist agents (from parallel orchestrator)
  'Agent:logic-reviewer': 'bg-blue-600/20 text-blue-400',
  'Agent:quality-reviewer': 'bg-indigo-600/20 text-indigo-400',
  'Agent:security-reviewer': 'bg-red-600/20 text-red-400',
  'Agent:ai-triage-reviewer': 'bg-slate-500/20 text-slate-400',
  // Specialist agents (from parallel followup reviewer)
  'Agent:resolution-verifier': 'bg-teal-600/20 text-teal-400',
  'Agent:new-code-reviewer': 'bg-cyan-600/20 text-cyan-400',
  'Agent:comment-analyzer': 'bg-gray-500/20 text-gray-400',
  'default': 'bg-muted text-muted-foreground'
};

export function PRLogs({ prNumber, logs, isLoading, isStreaming = false }: PRLogsProps) {
  const [expandedPhases, setExpandedPhases] = useState<Set<PRLogPhase>>(new Set(['analysis']));

  const togglePhase = (phase: PRLogPhase) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phase)) {
        next.delete(phase);
      } else {
        next.add(phase);
      }
      return next;
    });
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
      <div className="p-4 space-y-2">
        {isLoading && !logs ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs ? (
          <>
            {/* Logs header */}
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                PR #{prNumber}
                {logs.is_followup && <Badge variant="outline" className="text-xs">Follow-up</Badge>}
                {isStreaming && (
                  <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/30 flex items-center gap-1">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    Live
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(logs.updated_at).toLocaleString()}
              </div>
            </div>

            {/* Phase-based collapsible logs */}
            {(['context', 'analysis', 'synthesis'] as PRLogPhase[]).map((phase) => (
              <PhaseLogSection
                key={phase}
                phase={phase}
                phaseLog={logs.phases[phase]}
                isExpanded={expandedPhases.has(phase)}
                onToggle={() => togglePhase(phase)}
                isStreaming={isStreaming}
              />
            ))}
          </>
        ) : isStreaming ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-blue-500" />
            <p>Waiting for logs...</p>
            <p className="text-xs mt-1">Review is starting</p>
          </div>
        ) : (
          <div className="text-center text-sm text-muted-foreground py-8">
            <Terminal className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p>No logs available</p>
            <p className="text-xs mt-1">Run a review to generate logs</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Phase Log Section Component
interface PhaseLogSectionProps {
  phase: PRLogPhase;
  phaseLog: PRPhaseLog | null;
  isExpanded: boolean;
  onToggle: () => void;
  isStreaming?: boolean;
}

function PhaseLogSection({ phase, phaseLog, isExpanded, onToggle, isStreaming = false }: PhaseLogSectionProps) {
  const Icon = PHASE_ICONS[phase];
  const status = phaseLog?.status || 'pending';
  const hasEntries = (phaseLog?.entries.length || 0) > 0;

  const getStatusBadge = () => {
    // Show streaming indicator for active phase during streaming
    if (status === 'active' || (isStreaming && status === 'pending')) {
      return (
        <Badge variant="outline" className="text-xs bg-info/10 text-info border-info/30 flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          {isStreaming ? 'Streaming' : 'Running'}
        </Badge>
      );
    }

    // Defensive check: During streaming, if a phase shows "completed" but has no entries,
    // treat it as pending (this catches edge cases where phases are marked complete incorrectly)
    if (isStreaming && status === 'completed' && !hasEntries) {
      return (
        <Badge variant="secondary" className="text-xs text-muted-foreground">
          Pending
        </Badge>
      );
    }

    switch (status) {
      case 'completed':
        return (
          <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/30 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Complete
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30 flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Failed
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-xs text-muted-foreground">
            Pending
          </Badge>
        );
    }
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            'w-full flex items-center justify-between p-3 rounded-lg border transition-colors',
            'hover:bg-secondary/50',
            status === 'active' && PHASE_COLORS[phase],
            status === 'completed' && 'border-success/30 bg-success/5',
            status === 'failed' && 'border-destructive/30 bg-destructive/5',
            status === 'pending' && 'border-border bg-secondary/30'
          )}
        >
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <Icon className={cn('h-4 w-4', status === 'active' ? PHASE_COLORS[phase].split(' ')[0] : 'text-muted-foreground')} />
            <span className="font-medium text-sm">{PHASE_LABELS[phase]}</span>
            {hasEntries && (
              <span className="text-xs text-muted-foreground">
                ({phaseLog?.entries.length} entries)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 ml-6 border-l-2 border-border pl-4 py-2 space-y-1">
          {!hasEntries ? (
            <p className="text-xs text-muted-foreground italic">No logs yet</p>
          ) : (
            phaseLog?.entries.map((entry, idx) => (
              <LogEntry key={`${entry.timestamp}-${idx}`} entry={entry} />
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Log Entry Component
interface LogEntryProps {
  entry: PRLogEntry;
}

function LogEntry({ entry }: LogEntryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasDetail = Boolean(entry.detail);

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  };

  const getSourceColor = (source: string | undefined) => {
    if (!source) return SOURCE_COLORS.default;
    return SOURCE_COLORS[source] || SOURCE_COLORS.default;
  };

  if (entry.type === 'error') {
    return (
      <div className="flex flex-col">
        <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-2 py-1">
          <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="break-words flex-1">{entry.content}</span>
          {hasDetail && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={cn(
                'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded shrink-0',
                'text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors',
                isExpanded && 'bg-secondary/50'
              )}
            >
              {isExpanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
            </button>
          )}
        </div>
        {hasDetail && isExpanded && (
          <div className="mt-1.5 ml-4 p-2 bg-destructive/5 rounded-md border border-destructive/20 overflow-x-auto">
            <pre className="text-[10px] text-destructive/80 whitespace-pre-wrap break-words font-mono max-h-[300px] overflow-y-auto">
              {entry.detail}
            </pre>
          </div>
        )}
      </div>
    );
  }

  if (entry.type === 'success') {
    return (
      <div className="flex items-start gap-2 text-xs text-success bg-success/10 rounded-md px-2 py-1">
        <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" />
        <span className="break-words flex-1">{entry.content}</span>
      </div>
    );
  }

  if (entry.type === 'info') {
    return (
      <div className="flex items-start gap-2 text-xs text-info bg-info/10 rounded-md px-2 py-1">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        <span className="break-words flex-1">{entry.content}</span>
      </div>
    );
  }

  // Default text entry with source badge
  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-2 text-xs text-muted-foreground py-0.5">
        <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
          {formatTime(entry.timestamp)}
        </span>
        {entry.source && (
          <Badge variant="outline" className={cn('text-[9px] px-1 py-0 shrink-0', getSourceColor(entry.source))}>
            {entry.source}
          </Badge>
        )}
        <span className="break-words whitespace-pre-wrap flex-1">{entry.content}</span>
        {hasDetail && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
              'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded shrink-0',
              'text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors',
              isExpanded && 'bg-secondary/50'
            )}
          >
            {isExpanded ? (
              <>
                <ChevronDown className="h-2.5 w-2.5" />
                <span>Less</span>
              </>
            ) : (
              <>
                <ChevronRight className="h-2.5 w-2.5" />
                <span>More</span>
              </>
            )}
          </button>
        )}
      </div>
      {hasDetail && isExpanded && (
        <div className="mt-1.5 ml-12 p-2 bg-secondary/30 rounded-md border border-border/50 overflow-x-auto">
          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words font-mono max-h-[300px] overflow-y-auto">
            {entry.detail}
          </pre>
        </div>
      )}
    </div>
  );
}
