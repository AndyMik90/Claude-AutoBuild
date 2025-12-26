import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Rocket, Server, Settings, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { useSettingsStore } from '../stores/settings-store';
import { DokployDeployModal } from './DokployDeployModal';

interface DeployProps {
  projectId: string;
  onOpenSettings: () => void;
}

export function Deploy({ projectId, onOpenSettings }: DeployProps) {
  const { t } = useTranslation('deploy');
  const settings = useSettingsStore((state) => state.settings);
  const [showDokployModal, setShowDokployModal] = useState(false);

  const dokployAccounts = settings.deploymentProviders?.dokploy || [];
  const hasDokploy = dokployAccounts.length > 0;
  const hasAnyProvider = hasDokploy;

  if (!hasAnyProvider) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Rocket className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">{t('noProviders.title')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('noProviders.description')}
          </p>
          <Button className="mt-4" onClick={onOpenSettings}>
            <Settings className="mr-2 h-4 w-4" />
            {t('noProviders.openSettings')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Rocket className="h-6 w-6" />
            {t('title')}
          </h1>
          <p className="mt-1 text-muted-foreground">{t('description')}</p>
        </div>

        <div className="space-y-4">
          {/* Dokploy */}
          {hasDokploy && (
            <button
              onClick={() => setShowDokployModal(true)}
              className="w-full flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Server className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">{t('providers.dokploy.title')}</h3>
                  <p className="text-sm text-muted-foreground">{t('providers.dokploy.description')}</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Dokploy Deploy Modal */}
      <DokployDeployModal
        open={showDokployModal}
        onOpenChange={setShowDokployModal}
        projectId={projectId}
      />
    </ScrollArea>
  );
}
