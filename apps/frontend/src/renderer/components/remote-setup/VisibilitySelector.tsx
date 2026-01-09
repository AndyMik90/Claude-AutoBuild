import { Lock, Globe, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';

export type VisibilityType = 'github' | 'gitlab';
export type GitHubVisibility = 'private' | 'public';
export type GitLabVisibility = 'private' | 'internal' | 'public';
export type Visibility = GitHubVisibility | GitLabVisibility;

interface VisibilitySelectorProps<T extends VisibilityType> {
  type: T;
  value: T extends 'github' ? GitHubVisibility : GitLabVisibility;
  onChange: (visibility: T extends 'github' ? GitHubVisibility : GitLabVisibility) => void;
  disabled?: boolean;
  showHelp?: boolean;
}

/**
 * Visibility selector for GitHub and GitLab repositories
 * GitHub: Private, Public
 * GitLab: Private, Internal, Public
 */
export function VisibilitySelector<T extends VisibilityType>({
  type,
  value,
  onChange,
  disabled = false,
  showHelp = true
}: VisibilitySelectorProps<T>) {
  const { t } = useTranslation('dialogs');

  const visibilityOptions = {
    github: [
      { value: 'private' as const, icon: Lock, label: t('remoteSetup.repoConfig.private') },
      { value: 'public' as const, icon: Globe, label: t('remoteSetup.repoConfig.public') },
    ],
    gitlab: [
      { value: 'private' as const, icon: Lock, label: t('remoteSetup.repoConfig.private') },
      { value: 'internal' as const, icon: Users, label: t('remoteSetup.repoConfig.internal') },
      { value: 'public' as const, icon: Globe, label: t('remoteSetup.repoConfig.public') },
    ],
  };

  const options = visibilityOptions[type];

  return (
    <div className="space-y-2">
      <Label>{t('remoteSetup.repoConfig.visibility')}</Label>
      <div className="flex gap-2" role="radiogroup" aria-label={t('remoteSetup.repoConfig.visibility')}>
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              onClick={() => onChange(option.value as T extends 'github' ? GitHubVisibility : GitLabVisibility)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md border transition-colors',
                value === option.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-muted hover:border-primary/50'
              )}
              disabled={disabled}
              role="radio"
              aria-checked={value === option.value}
              aria-label={`${option.label} visibility`}
            >
              <Icon className="h-4 w-4" />
              <span className="text-sm">{option.label}</span>
            </button>
          );
        })}
      </div>
      {showHelp && (
        <p className="text-xs text-muted-foreground">
          {t('remoteSetup.repoConfig.visibilityHelp')}
        </p>
      )}
    </div>
  );
}
