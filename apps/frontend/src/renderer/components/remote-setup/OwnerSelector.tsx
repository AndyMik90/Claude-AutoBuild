import { User, Building, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import type { Owner } from './types';

interface OwnerSelectorProps {
  type: 'github' | 'gitlab';
  personal?: Owner | null;
  organizations: Owner[];
  selected: string;
  onSelect: (selection: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

export function OwnerSelector({
  type,
  personal,
  organizations,
  selected,
  onSelect,
  isLoading = false,
  disabled = false,
  ariaLabel,
}: OwnerSelectorProps) {
  const { t } = useTranslation('dialogs');

  const orgLabel = type === 'github'
    ? t('remoteSetup.repoConfig.organizations')
    : t('remoteSetup.repoConfig.groups');

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        {t('remoteSetup.repoConfig.owner')}
      </label>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('remoteSetup.repoConfig.loading')}
        </div>
      ) : (
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label={ariaLabel || orgLabel}
        >
          {/* Personal account */}
          {personal && (
            <button
              onClick={() => onSelect(personal.path)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md border transition-colors',
                selected === personal.path
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-muted hover:border-primary/50',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
              disabled={disabled}
              role="radio"
              aria-checked={selected === personal.path}
              aria-label={`${t('remoteSetup.repoConfig.personal')} (${personal.name})`}
            >
              <User className="h-4 w-4" />
              <span className="text-sm">{personal.name}</span>
            </button>
          )}

          {/* Organizations/Groups */}
          {organizations.map((org) => (
            <button
              key={org.id}
              onClick={() => onSelect(org.path)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md border transition-colors',
                selected === org.path
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-muted hover:border-primary/50',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
              disabled={disabled}
              role="radio"
              aria-checked={selected === org.path}
              aria-label={`${orgLabel}: ${org.name}`}
            >
              <Building className="h-4 w-4" />
              <span className="text-sm">{org.name}</span>
            </button>
          ))}
        </div>
      )}

      {organizations.length > 0 && !isLoading && (
        <p className="text-xs text-muted-foreground">
          {type === 'github'
            ? t('remoteSetup.repoConfig.ownerSelectHelp')
            : t('remoteSetup.repoConfig.ownerSelectHelpGitLab')}
        </p>
      )}
    </div>
  );
}
