/**
 * Severity configuration for GitLab MR review findings
 */

import {
  XCircle,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Shield,
  Code,
  FileText,
  TestTube,
  Zap,
} from 'lucide-react';

export type SeverityGroup = 'critical' | 'high' | 'medium' | 'low';

export const SEVERITY_ORDER: SeverityGroup[] = ['critical', 'high', 'medium', 'low'];

export const SEVERITY_CONFIG: Record<SeverityGroup, {
  labelKey: string;
  color: string;
  bgColor: string;
  icon: typeof XCircle;
  descriptionKey: string;
}> = {
  critical: {
    labelKey: 'mrReview.severity.critical',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10 border-red-500/30',
    icon: XCircle,
    descriptionKey: 'mrReview.severity.criticalDesc',
  },
  high: {
    labelKey: 'mrReview.severity.high',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10 border-orange-500/30',
    icon: AlertTriangle,
    descriptionKey: 'mrReview.severity.highDesc',
  },
  medium: {
    labelKey: 'mrReview.severity.medium',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10 border-yellow-500/30',
    icon: AlertCircle,
    descriptionKey: 'mrReview.severity.mediumDesc',
  },
  low: {
    labelKey: 'mrReview.severity.low',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10 border-blue-500/30',
    icon: CheckCircle,
    descriptionKey: 'mrReview.severity.lowDesc',
  },
};

export const CATEGORY_ICONS: Record<string, typeof Shield> = {
  security: Shield,
  quality: Code,
  docs: FileText,
  test: TestTube,
  performance: Zap,
  style: Code,
  pattern: Code,
  logic: AlertCircle,
};

export function getCategoryIcon(category: string) {
  return CATEGORY_ICONS[category] || Code;
}
