import { Folder, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

interface ChooseStepProps {
  onOpenExisting: () => void;
  onCreateNew: () => void;
}

/**
 * First step of the project creation wizard
 * User chooses between opening an existing project or creating a new one
 */
export function ChooseStep({ onOpenExisting, onCreateNew }: ChooseStepProps) {
  const { t } = useTranslation('dialogs');

  return (
    <div className="grid gap-3 py-4">
      {/* Open Existing Project Card */}
      <button
        onClick={onOpenExisting}
        className={cn(
          'w-full flex items-center gap-4 p-4 rounded-xl border',
          'transition-all duration-200 text-left group',
          'bg-card hover:bg-accent hover:border-accent'
        )}
        aria-label={t('wizard.steps.choose.openExistingAriaLabel')}
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors">
          <Folder className="h-6 w-6 text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-foreground">{t('wizard.steps.choose.openExisting')}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('wizard.steps.choose.openExistingDescription')}
          </p>
        </div>
      </button>

      {/* Create New Project Card */}
      <button
        onClick={onCreateNew}
        className={cn(
          'w-full flex items-center gap-4 p-4 rounded-xl border',
          'transition-all duration-200 text-left group',
          'bg-card hover:bg-accent hover:border-accent'
        )}
        aria-label={t('wizard.steps.choose.createNewAriaLabel')}
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-green-500/10 group-hover:bg-green-500/20 transition-colors">
          <Plus className="h-6 w-6 text-green-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-foreground">{t('wizard.steps.choose.createNew')}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('wizard.steps.choose.createNewDescription')}
          </p>
        </div>
      </button>
    </div>
  );
}
