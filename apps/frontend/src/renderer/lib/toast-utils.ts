import type { TFunction } from 'i18next';
import type { useToast } from '../hooks/use-toast';

type ToastFn = ReturnType<typeof useToast>['toast'];

export const showGitPreferenceSaveError = (toast: ToastFn, t: TFunction) => {
  toast({
    title: t('common:labels.error'),
    description: t('dialogs:addProject.failedToSaveGitPreference'),
    variant: 'destructive'
  });
};
