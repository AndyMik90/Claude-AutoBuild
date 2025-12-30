import { useState } from 'react';
import { Activity, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '../../ui/collapsible';
import type { ServiceInfo } from '../../../../shared/types';

interface MonitoringSectionProps {
  monitoring: ServiceInfo['monitoring'];
}

export function MonitoringSection({ monitoring }: MonitoringSectionProps) {
  const { t } = useTranslation('context');
  const [expanded, setExpanded] = useState(false);

  if (!monitoring) {
    return null;
  }

  return (
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      className="border-t border-border pt-3"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between text-xs font-medium hover:text-foreground">
        <div className="flex items-center gap-2">
          <Activity className="h-3 w-3" />
          {t('projectIndex.sections.monitoring')}
        </div>
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2 text-xs text-muted-foreground">
        {monitoring.metrics_endpoint && (
          <div>{t('projectIndex.sections.metrics')}: <code className="text-xs">{monitoring.metrics_endpoint}</code> ({monitoring.metrics_type})</div>
        )}
        {monitoring.health_checks && monitoring.health_checks.length > 0 && (
          <div>{t('projectIndex.sections.health')}: {monitoring.health_checks.join(', ')}</div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
