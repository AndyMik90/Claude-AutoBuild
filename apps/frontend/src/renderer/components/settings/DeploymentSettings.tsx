import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Server,
  Globe
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';
import { SettingsSection } from './SettingsSection';
import type { AppSettings, DokployAccount } from '../../../shared/types';

interface DeploymentSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

const DEFAULT_DOKPLOY_URL = 'https://app.dokploy.com/api';

/**
 * Deployment provider settings for managing deployment accounts
 */
export function DeploymentSettings({ settings, onSettingsChange }: DeploymentSettingsProps) {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');

  // State for adding new account
  const [newAccountName, setNewAccountName] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('');
  const [showNewApiKey, setShowNewApiKey] = useState(false);
  const [isAddingAccount, setIsAddingAccount] = useState(false);

  // State for editing
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingApiKey, setEditingApiKey] = useState('');
  const [editingBaseUrl, setEditingBaseUrl] = useState('');
  const [showEditingApiKey, setShowEditingApiKey] = useState(false);

  // State for visibility of API keys in list
  const [visibleApiKeys, setVisibleApiKeys] = useState<Set<string>>(new Set());

  const dokployAccounts = settings.deploymentProviders?.dokploy || [];

  const updateDokployAccounts = (accounts: DokployAccount[]) => {
    onSettingsChange({
      ...settings,
      deploymentProviders: {
        ...settings.deploymentProviders,
        dokploy: accounts
      }
    });
  };

  const handleAddAccount = () => {
    if (!newAccountName.trim() || !newApiKey.trim()) return;

    const newAccount: DokployAccount = {
      id: `dokploy-${Date.now()}`,
      name: newAccountName.trim(),
      apiKey: newApiKey.trim(),
      baseUrl: newBaseUrl.trim() || DEFAULT_DOKPLOY_URL,
      createdAt: new Date()
    };

    updateDokployAccounts([...dokployAccounts, newAccount]);
    setNewAccountName('');
    setNewApiKey('');
    setNewBaseUrl('');
    setShowNewApiKey(false);
    setIsAddingAccount(false);
  };

  const handleDeleteAccount = (accountId: string) => {
    updateDokployAccounts(dokployAccounts.filter(a => a.id !== accountId));
  };

  const startEditingAccount = (account: DokployAccount) => {
    setEditingAccountId(account.id);
    setEditingName(account.name);
    setEditingApiKey(account.apiKey);
    setEditingBaseUrl(account.baseUrl === DEFAULT_DOKPLOY_URL ? '' : account.baseUrl);
    setShowEditingApiKey(false);
  };

  const cancelEditingAccount = () => {
    setEditingAccountId(null);
    setEditingName('');
    setEditingApiKey('');
    setEditingBaseUrl('');
    setShowEditingApiKey(false);
  };

  const handleSaveAccount = () => {
    if (!editingAccountId || !editingName.trim() || !editingApiKey.trim()) return;

    updateDokployAccounts(
      dokployAccounts.map(account =>
        account.id === editingAccountId
          ? {
              ...account,
              name: editingName.trim(),
              apiKey: editingApiKey.trim(),
              baseUrl: editingBaseUrl.trim() || DEFAULT_DOKPLOY_URL
            }
          : account
      )
    );
    cancelEditingAccount();
  };

  const toggleApiKeyVisibility = (accountId: string) => {
    setVisibleApiKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(accountId)) {
        newSet.delete(accountId);
      } else {
        newSet.add(accountId);
      }
      return newSet;
    });
  };

  const maskApiKey = (key: string) => {
    if (key.length <= 8) return '********';
    return key.slice(0, 4) + '****' + key.slice(-4);
  };

  return (
    <SettingsSection
      title={t('deployment.title')}
      description={t('deployment.description')}
    >
      <div className="space-y-6">
        {/* Dokploy Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold text-foreground">{t('deployment.dokploy.title')}</h4>
          </div>

          <div className="rounded-lg bg-muted/30 border border-border p-4">
            <p className="text-sm text-muted-foreground mb-4">
              {t('deployment.dokploy.description')}
            </p>

            {/* Accounts list */}
            {dokployAccounts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center mb-4">
                <p className="text-sm text-muted-foreground">{t('deployment.dokploy.noAccountsYet')}</p>
              </div>
            ) : (
              <div className="space-y-2 mb-4">
                {dokployAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="rounded-lg border border-border bg-background"
                  >
                    {editingAccountId === account.id ? (
                      /* Editing mode */
                      <div className="p-4 space-y-3">
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-muted-foreground">
                            {t('deployment.dokploy.accountName')}
                          </Label>
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            placeholder={t('deployment.dokploy.accountNamePlaceholder')}
                            className="h-8 text-sm"
                            autoFocus
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-muted-foreground">
                            {t('deployment.dokploy.apiKey')}
                          </Label>
                          <div className="relative">
                            <Input
                              type={showEditingApiKey ? 'text' : 'password'}
                              value={editingApiKey}
                              onChange={(e) => setEditingApiKey(e.target.value)}
                              placeholder={t('deployment.dokploy.apiKeyPlaceholder')}
                              className="pr-10 font-mono text-xs h-8"
                            />
                            <button
                              type="button"
                              onClick={() => setShowEditingApiKey(!showEditingApiKey)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showEditingApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            {t('deployment.dokploy.baseUrl')}
                            <span className="text-muted-foreground/60">({t('deployment.dokploy.optional')})</span>
                          </Label>
                          <Input
                            value={editingBaseUrl}
                            onChange={(e) => setEditingBaseUrl(e.target.value)}
                            placeholder={DEFAULT_DOKPLOY_URL}
                            className="font-mono text-xs h-8"
                          />
                          <p className="text-xs text-muted-foreground">
                            {t('deployment.dokploy.baseUrlDescription')}
                          </p>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelEditingAccount}
                            className="h-7 text-xs"
                          >
                            {tCommon('buttons.cancel')}
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSaveAccount}
                            disabled={!editingName.trim() || !editingApiKey.trim()}
                            className="h-7 text-xs gap-1"
                          >
                            <Check className="h-3 w-3" />
                            {tCommon('buttons.save')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* View mode */
                      <div className="flex items-center justify-between p-3 hover:bg-muted/50">
                        <div className="flex items-center gap-3">
                          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
                            {account.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">{account.name}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono">
                                {visibleApiKeys.has(account.id) ? account.apiKey : maskApiKey(account.apiKey)}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleApiKeyVisibility(account.id)}
                                className="hover:text-foreground"
                              >
                                {visibleApiKeys.has(account.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </button>
                            </div>
                            {account.baseUrl !== DEFAULT_DOKPLOY_URL && (
                              <div className="text-xs text-muted-foreground/60 font-mono truncate max-w-[200px]">
                                {account.baseUrl}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditingAccount(account)}
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title={t('deployment.dokploy.edit')}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteAccount(account.id)}
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title={t('deployment.dokploy.delete')}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add new account form */}
            {isAddingAccount ? (
              <div className="rounded-lg border border-border bg-background p-4 space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {t('deployment.dokploy.accountName')}
                  </Label>
                  <Input
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    placeholder={t('deployment.dokploy.accountNamePlaceholder')}
                    className="h-8 text-sm"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {t('deployment.dokploy.apiKey')}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showNewApiKey ? 'text' : 'password'}
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                      placeholder={t('deployment.dokploy.apiKeyPlaceholder')}
                      className="pr-10 font-mono text-xs h-8"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewApiKey(!showNewApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNewApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    {t('deployment.dokploy.baseUrl')}
                    <span className="text-muted-foreground/60">({t('deployment.dokploy.optional')})</span>
                  </Label>
                  <Input
                    value={newBaseUrl}
                    onChange={(e) => setNewBaseUrl(e.target.value)}
                    placeholder={DEFAULT_DOKPLOY_URL}
                    className="font-mono text-xs h-8"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('deployment.dokploy.baseUrlDescription')}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsAddingAccount(false);
                      setNewAccountName('');
                      setNewApiKey('');
                      setNewBaseUrl('');
                      setShowNewApiKey(false);
                    }}
                    className="h-7 text-xs"
                  >
                    {tCommon('buttons.cancel')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAddAccount}
                    disabled={!newAccountName.trim() || !newApiKey.trim()}
                    className="h-7 text-xs gap-1"
                  >
                    <Check className="h-3 w-3" />
                    {tCommon('buttons.add')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddingAccount(true)}
                className="gap-1"
              >
                <Plus className="h-3 w-3" />
                {t('deployment.dokploy.addAccount')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
