import { useState } from 'react';
import { Database, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '../../ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '../../ui/collapsible';
import type { ServiceInfo } from '../../../../shared/types';

interface DatabaseSectionProps {
  database: ServiceInfo['database'];
}

export function DatabaseSection({ database }: DatabaseSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (!database || database.total_models === 0) {
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
          <Database className="h-3 w-3" />
          Database Models ({database.total_models})
        </div>
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-1.5">
        {database.model_names.slice(0, 10).map(modelName => {
          const model = database.models[modelName];
          return (
            <div key={modelName} className="flex items-start gap-2 text-xs">
              <Badge variant="outline" className="text-xs shrink-0">{model.orm}</Badge>
              <code className="flex-1 font-mono text-muted-foreground truncate">{modelName}</code>
              <span className="text-muted-foreground shrink-0 text-xs">
                {Object.keys(model.fields).length} fields
              </span>
            </div>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
