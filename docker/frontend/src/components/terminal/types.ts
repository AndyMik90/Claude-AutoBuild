import type { Task, ExecutionPhase } from '../../../shared/types';
import type { TerminalStatus } from '../../stores/terminal-store';
import { Circle, Search, Code2, Wrench, CheckCircle2, AlertCircle } from 'lucide-react';

export interface TerminalProps {
  id: string;
  cwd?: string;
  projectPath?: string;
  projectId?: string;  // Project UUID for backend validation
  isActive: boolean;
  onClose: () => void;
  onActivate: () => void;
  tasks?: Task[];
  onNewTaskClick?: () => void;
}

export const STATUS_COLORS: Record<TerminalStatus, string> = {
  idle: 'bg-warning',
  running: 'bg-success',
  'claude-active': 'bg-primary',
  exited: 'bg-destructive',
};

export const PHASE_CONFIG: Record<ExecutionPhase, { label: string; color: string; icon: React.ElementType }> = {
  idle: { label: 'Ready', color: 'bg-muted text-muted-foreground', icon: Circle },
  planning: { label: 'Planning', color: 'bg-info/20 text-info', icon: Search },
  coding: { label: 'Coding', color: 'bg-primary/20 text-primary', icon: Code2 },
  qa_review: { label: 'QA Review', color: 'bg-warning/20 text-warning', icon: Search },
  qa_fixing: { label: 'Fixing', color: 'bg-warning/20 text-warning', icon: Wrench },
  complete: { label: 'Complete', color: 'bg-success/20 text-success', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-destructive/20 text-destructive', icon: AlertCircle },
};
