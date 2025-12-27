import { useState } from 'react';
import { Route, ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { Badge } from '../../ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '../../ui/collapsible';
import type { ServiceInfo } from '../../../../shared/types';

interface APIRoutesSectionProps {
  api: ServiceInfo['api'];
}

export function APIRoutesSection({ api }: APIRoutesSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (!api || api.total_routes === 0) {
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
          <Route className="h-3 w-3" />
          API Routes ({api.total_routes})
        </div>
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-1.5">
        {api.routes.slice(0, 10).map((route, idx) => (
          <div key={idx} className="flex items-start gap-2 text-xs">
            <div className="flex gap-1 shrink-0">
              {route.methods.map(method => (
                <Badge key={method} variant="secondary" className="text-xs">
                  {method}
                </Badge>
              ))}
            </div>
            <code className="flex-1 font-mono text-muted-foreground truncate">{route.path}</code>
            {route.requires_auth && <Lock className="h-3 w-3 text-orange-500 shrink-0" />}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
