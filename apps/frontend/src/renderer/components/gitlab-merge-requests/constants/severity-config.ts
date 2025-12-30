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
  label: string;
  color: string;
  bgColor: string;
  icon: typeof XCircle;
  description: string;
}> = {
  critical: {
    label: 'Critical',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10 border-red-500/30',
    icon: XCircle,
    description: 'Must fix before merge',
  },
  high: {
    label: 'High',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10 border-orange-500/30',
    icon: AlertTriangle,
    description: 'Should fix before merge',
  },
  medium: {
    label: 'Medium',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10 border-yellow-500/30',
    icon: AlertCircle,
    description: 'Consider fixing',
  },
  low: {
    label: 'Low',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10 border-blue-500/30',
    icon: CheckCircle,
    description: 'Nice to have',
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
