import { useState } from 'react';
import { Key, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '../../ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '../../ui/collapsible';
import type { ServiceInfo } from '../../../../shared/types';

interface EnvironmentSectionProps {
  environment: ServiceInfo['environment'];
}

export function EnvironmentSection({ environment }: EnvironmentSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (!environment || environment.detected_count === 0) {
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
          <Key className="h-3 w-3" />
          Environment Variables ({environment.detected_count})
        </div>
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-1.5">
        {Object.entries(environment.variables).slice(0, 10).map(([key, envVar]) => (
          <div key={key} className="flex items-start gap-2 text-xs">
            <Badge variant={envVar.sensitive ? "destructive" : "outline"} className="text-xs shrink-0">
              {envVar.type}
            </Badge>
            <code className="flex-1 font-mono text-muted-foreground truncate">{key}</code>
            {envVar.required && <span className="text-orange-500 shrink-0">*</span>}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
