import {
  Zap,
  Palette,
  Lightbulb,
  BookOpen,
  Shield,
  Gauge,
  Code2
} from 'lucide-react';
import type { IdeationType } from '../../../shared/types';

interface TypeIconProps {
  type: IdeationType;
}

export function TypeIcon({ type }: TypeIconProps) {
  switch (type) {
    case 'code_improvements':
      return <Zap className="h-4 w-4" />;
    case 'ui_ux_improvements':
      return <Palette className="h-4 w-4" />;
    case 'documentation_gaps':
      return <BookOpen className="h-4 w-4" />;
    case 'security_hardening':
      return <Shield className="h-4 w-4" />;
    case 'performance_optimizations':
      return <Gauge className="h-4 w-4" />;
    case 'code_quality':
      return <Code2 className="h-4 w-4" />;
    default:
      return <Lightbulb className="h-4 w-4" />;
  }
}
