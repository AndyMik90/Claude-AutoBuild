import { Database, CheckCircle, FileCode, Globe, Code, Package } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { cn } from '../../lib/utils';
import type { ServiceInfo } from '../../../shared/types';
import { serviceTypeIcons, serviceTypeColors } from './constants';
import {
  EnvironmentSection,
  APIRoutesSection,
  DatabaseSection,
  ExternalServicesSection,
  MonitoringSection,
  DependenciesSection
} from './service-sections';

interface ServiceCardProps {
  name: string;
  service: ServiceInfo;
}

export function ServiceCard({ name, service }: ServiceCardProps) {
  const Icon = serviceTypeIcons[service.type || 'unknown'];
  const colorClass = serviceTypeColors[service.type || 'unknown'];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {name}
          </CardTitle>
          <Badge variant="outline" className={cn('capitalize text-xs', colorClass)}>
            {service.type || 'unknown'}
          </Badge>
        </div>
        {service.path && (
          <CardDescription className="font-mono text-xs truncate">
            {service.path}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Language & Framework */}
        <div className="flex flex-wrap gap-1.5">
          {service.language && (
            <Badge variant="secondary" className="text-xs">
              {service.language}
            </Badge>
          )}
          {service.framework && (
            <Badge variant="secondary" className="text-xs">
              {service.framework}
            </Badge>
          )}
          {service.package_manager && (
            <Badge variant="outline" className="text-xs">
              {service.package_manager}
            </Badge>
          )}
          {service.build_tool && (
            <Badge variant="outline" className="text-xs">
              {service.build_tool}
            </Badge>
          )}
        </div>

        {/* Additional Info */}
        <div className="grid gap-2 text-xs">
          {service.entry_point && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <FileCode className="h-3 w-3 shrink-0" />
              <span className="truncate font-mono">{service.entry_point}</span>
            </div>
          )}
          {service.testing && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle className="h-3 w-3 shrink-0" />
              <span>Testing: {service.testing}</span>
            </div>
          )}
          {service.orm && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Database className="h-3 w-3 shrink-0" />
              <span>ORM: {service.orm}</span>
            </div>
          )}
          {service.default_port && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Globe className="h-3 w-3 shrink-0" />
              <span>Port: {service.default_port}</span>
            </div>
          )}
          {service.styling && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Code className="h-3 w-3 shrink-0" />
              <span>Styling: {service.styling}</span>
            </div>
          )}
          {service.state_management && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Package className="h-3 w-3 shrink-0" />
              <span>State: {service.state_management}</span>
            </div>
          )}
        </div>

        {/* Apple Frameworks (iOS/Swift) */}
        {service.apple_frameworks && service.apple_frameworks.length > 0 && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground mb-1.5">Apple Frameworks</p>
            <div className="flex flex-wrap gap-1">
              {service.apple_frameworks.map((fw) => (
                <Badge key={fw} variant="secondary" className="text-xs">
                  {fw}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* SPM Dependencies (iOS/Swift) */}
        {service.spm_dependencies && service.spm_dependencies.length > 0 && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground mb-1.5">SPM Dependencies</p>
            <div className="flex flex-wrap gap-1">
              {service.spm_dependencies.map((dep) => (
                <Badge key={dep} variant="outline" className="text-xs font-mono">
                  {dep}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Collapsible Sections */}
        <EnvironmentSection environment={service.environment} />
        <APIRoutesSection api={service.api} />
        <DatabaseSection database={service.database} />
        <ExternalServicesSection services={service.services} />
        <MonitoringSection monitoring={service.monitoring} />
        {service.dependencies && <DependenciesSection dependencies={service.dependencies} />}

        {/* Key Directories */}
        {service.key_directories && Object.keys(service.key_directories).length > 0 && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground mb-1.5">Key Directories</p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(service.key_directories).slice(0, 6).map(([dir, info]) => (
                <Tooltip key={dir}>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-xs font-mono cursor-help">
                      {dir}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>{info.purpose}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
