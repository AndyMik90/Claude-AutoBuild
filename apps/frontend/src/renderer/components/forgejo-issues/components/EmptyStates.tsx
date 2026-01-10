import { useTranslation } from 'react-i18next';
import { Settings2 } from 'lucide-react';
import { Button } from '../../ui/button';
import type { EmptyStateProps, NotConnectedStateProps } from '../types';

// Forgejo icon component
function ForgejoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M8 22 v-14 a6 6 0 0 1 6-6 h4" />
      <path d="M8 22 v-4 a6 6 0 0 1 6-6 h4" />
    </svg>
  );
}

export function EmptyState({ searchQuery, icon: Icon = ForgejoIcon, message }: EmptyStateProps) {
  const { t } = useTranslation('forgejo');

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">
        {searchQuery ? t('empty.noMatch') : message}
      </p>
    </div>
  );
}

export function NotConnectedState({ error, onOpenSettings }: NotConnectedStateProps) {
  const { t } = useTranslation('forgejo');

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
        <ForgejoIcon className="h-8 w-8 text-orange-500" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {t('notConnected.title')}
      </h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">
        {error || t('notConnected.description')}
      </p>
      {onOpenSettings && (
        <Button onClick={onOpenSettings} variant="outline">
          <Settings2 className="h-4 w-4 mr-2" />
          {t('notConnected.openSettings')}
        </Button>
      )}
    </div>
  );
}
