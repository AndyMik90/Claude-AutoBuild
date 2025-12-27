import { CheckCircle, AlertTriangle, XCircle, AlertCircle } from 'lucide-react';

/**
 * Returns the appropriate icon component based on conflict severity level
 */
export function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'none':
    case 'low':
      return <CheckCircle className="h-4 w-4 text-success" />;
    case 'medium':
      return <AlertTriangle className="h-4 w-4 text-warning" />;
    case 'high':
    case 'critical':
      return <XCircle className="h-4 w-4 text-destructive" />;
    default:
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

/**
 * Returns the appropriate CSS classes for badge styling based on severity
 */
export function getSeverityVariant(severity: string): string {
  switch (severity) {
    case 'none':
    case 'low':
      return 'bg-success/10 text-success';
    case 'medium':
      return 'bg-warning/10 text-warning';
    case 'high':
    case 'critical':
      return 'bg-destructive/10 text-destructive';
    default:
      return 'bg-muted text-muted-foreground';
  }
}
