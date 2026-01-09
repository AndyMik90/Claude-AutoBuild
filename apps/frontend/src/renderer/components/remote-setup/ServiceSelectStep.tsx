import { Github } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import type { RemoteServiceOption } from './types';

interface ServiceSelectStepProps {
  onSelect: (service: RemoteServiceOption) => void;
}

// GitLab icon component (since it's not in lucide-react)
function GitLabIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .41.29l2.46 7.56a6.87 6.87 0 0 1 5.4 0L15.56 2.3a.43.43 0 0 1 .41-.29.42.42 0 0 1 .41.25l2.44 7.52 1.22 3.78a.84.84 0 0 1-.3.94l.31.24z" />
    </svg>
  );
}

export function ServiceSelectStep({ onSelect }: ServiceSelectStepProps) {
  const { t } = useTranslation('dialogs');

  const services = [
    {
      id: 'github' as const,
      name: t('remoteSetup.serviceSelect.github'),
      description: t('remoteSetup.serviceSelect.githubDescription'),
      icon: Github,
      iconColor: 'text-foreground',
      bgColor: 'bg-card',
      borderColor: 'border-border hover:border-primary/50',
      accentBg: 'bg-primary/10',
      accentColor: 'text-primary',
    },
    {
      id: 'gitlab' as const,
      name: t('remoteSetup.serviceSelect.gitlab'),
      description: t('remoteSetup.serviceSelect.gitlabDescription'),
      icon: GitLabIcon,
      iconColor: 'text-foreground',
      bgColor: 'bg-card',
      borderColor: 'border-border hover:border-orange-500/50',
      accentBg: 'bg-orange-500/10',
      accentColor: 'text-orange-500',
    },
    {
      id: null,
      name: t('remoteSetup.serviceSelect.none'),
      description: t('remoteSetup.serviceSelect.noneDescription'),
      icon: ({ className }: { className?: string }) => (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
      iconColor: 'text-muted-foreground',
      bgColor: 'bg-muted/30',
      borderColor: 'border-border hover:border-muted-foreground/30',
      accentBg: 'bg-muted',
      accentColor: 'text-muted-foreground',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold">{t('remoteSetup.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('remoteSetup.description')}</p>
      </div>

      <div className="grid gap-3">
        {services.map((service) => {
          const Icon = service.icon;
          return (
            <button
              key={service.id ?? 'none'}
              onClick={() => onSelect(service.id)}
              className={cn(
                'w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 text-left group',
                service.bgColor,
                service.borderColor
              )}
              aria-label={service.name}
            >
              <div className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg',
                service.accentBg
              )}>
                <Icon className={cn('h-6 w-6', service.iconColor, service.accentColor)} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground">{service.name}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {service.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
