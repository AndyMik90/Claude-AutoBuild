import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, Folder, FolderOpen, Github, Gitlab } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';
import type { RemoteConfig } from '../remote-setup/types';

interface CreateFormStepProps {
  projectName: string;
  setProjectName: (name: string) => void;
  projectLocation: string;
  setProjectLocation: (location: string) => void;
  remoteConfig: RemoteConfig;
  setRemoteConfig: (config: RemoteConfig) => void;
  onNext: () => void;
  onBrowse: () => void;
  isCreating?: boolean;
}

type RemoteService = 'github' | 'gitlab' | null;

/**
 * Second step of the project creation wizard
 * User enters project details and selects remote repository option
 */
export function CreateFormStep({
  projectName,
  setProjectName,
  projectLocation,
  setProjectLocation,
  remoteConfig,
  setRemoteConfig,
  onNext,
  onBrowse,
  isCreating = false
}: CreateFormStepProps) {
  const { t } = useTranslation('dialogs');

  const sanitizedProjectName = projectName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const willCreatePath = projectLocation
    ? `${projectLocation}/${sanitizedProjectName || 'project-name'}`
    : '';

  const remoteOptions: {
    value: RemoteService;
    icon: LucideIcon;
    label: string;
    description: string;
    color: string;
  }[] = [
    {
      value: null,
      icon: FolderOpen,
      label: t('addProject.remoteSkip'),
      description: t('addProject.remoteSkipDescription'),
      color: 'text-gray-500'
    },
    {
      value: 'github',
      icon: Github,
      label: t('addProject.remoteGitHub'),
      description: t('addProject.remoteGitHubDescription'),
      color: 'text-gray-700 dark:text-gray-300'
    },
    {
      value: 'gitlab',
      icon: Gitlab,
      label: t('addProject.remoteGitLab'),
      description: t('addProject.remoteGitLabDescription'),
      color: 'text-orange-500'
    }
  ];

  const handleSelectRemote = (service: RemoteService) => {
    setRemoteConfig({
      service,
      enabled: service !== null
    });
  };

  return (
    <div className="space-y-6 py-4">
      {/* Project Name */}
      <div className="space-y-2">
        <Label htmlFor="project-name">{t('addProject.projectName')}</Label>
        <Input
          id="project-name"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder={t('addProject.projectNamePlaceholder')}
          disabled={isCreating}
        />
        <p className="text-xs text-muted-foreground">{t('addProject.projectNameHelp')}</p>
      </div>

      {/* Location */}
      <div className="space-y-2">
        <Label htmlFor="project-location">{t('addProject.location')}</Label>
        <div className="flex gap-2">
          <Input
            id="project-location"
            value={projectLocation}
            onChange={(e) => setProjectLocation(e.target.value)}
            placeholder={t('addProject.locationPlaceholder')}
            disabled={isCreating}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={onBrowse}
            disabled={isCreating}
          >
            <Folder className="h-4 w-4 mr-2" />
            {t('addProject.browse')}
          </Button>
        </div>
      </div>

      {/* Will Create Display */}
      {sanitizedProjectName && projectLocation && (
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('addProject.willCreate')}</p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            <span className="font-mono truncate">{willCreatePath}</span>
          </div>
        </div>
      )}

      {/* Remote Repository Selection */}
      <div className="space-y-3">
        <Label className="text-base">{t('addProject.setupRemote')}</Label>
        <div className="grid gap-2">
          {remoteOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = remoteConfig.service === option.value;
            return (
              <button
                key={option.value || 'none'}
                onClick={() => handleSelectRemote(option.value)}
                className={cn(
                  'w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 text-left group',
                  'bg-card hover:bg-accent hover:border-accent',
                  isSelected && 'bg-accent border-accent'
                )}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted group-hover:bg-accent transition-colors">
                  <Icon className={cn('h-6 w-6', option.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground">{option.label}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {option.description}
                  </p>
                </div>
                {isSelected && (
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
