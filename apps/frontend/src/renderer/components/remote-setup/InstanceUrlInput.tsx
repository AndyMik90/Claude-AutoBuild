import { Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface InstanceUrlInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
}

/**
 * Instance URL input for GitLab self-hosted instances
 * Allows users to specify a custom GitLab instance URL
 */
export function InstanceUrlInput({ value, onChange, disabled = false, id }: InstanceUrlInputProps) {
  const { t } = useTranslation('dialogs');

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-muted-foreground" />
        <Label htmlFor={id} className="text-sm font-medium text-foreground">
          {t('remoteSetup.repoConfig.instanceUrl')}
        </Label>
      </div>
      <Input
        id={id}
        placeholder="https://gitlab.com"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      <p className="text-xs text-muted-foreground">
        {t('remoteSetup.repoConfig.instanceUrlHelp')}
      </p>
    </div>
  );
}
