/**
 * OIDC/SSO Settings Component
 *
 * Admin interface for configuring OIDC/SSO authentication.
 */

import {
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Info,
  Key,
  Loader2,
  Lock,
  RefreshCw,
  Save,
  Server,
  Shield,
  Unlock,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';

interface OIDCConfig {
  enabled: boolean;
  provider_name: string;
  discovery_url: string | null;
  client_id: string | null;
  has_client_secret: boolean;
  scopes: string;
  auto_provision: boolean;
  default_role: string;
  disable_password_auth: boolean;
  email_claim: string;
  username_claim: string;
}

interface OIDCSettingsProps {
  authFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
}

type ToastType = 'success' | 'error' | 'info';

export function OIDCSettings({ authFetch }: OIDCSettingsProps) {
  const [config, setConfig] = useState<OIDCConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [providerName, setProviderName] = useState('SSO');
  const [discoveryUrl, setDiscoveryUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [scopes, setScopes] = useState('openid email profile');
  const [autoProvision, setAutoProvision] = useState(true);
  const [defaultRole, setDefaultRole] = useState('user');
  const [disablePasswordAuth, setDisablePasswordAuth] = useState(false);
  const [emailClaim, setEmailClaim] = useState('email');
  const [usernameClaim, setUsernameClaim] = useState('preferred_username');

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const response = await authFetch('/admin/settings/oidc');
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
        setEnabled(data.enabled);
        setProviderName(data.provider_name || 'SSO');
        setDiscoveryUrl(data.discovery_url || '');
        setClientId(data.client_id || '');
        setClientSecret(''); // Never populate secret field
        setScopes(data.scopes || 'openid email profile');
        setAutoProvision(data.auto_provision);
        setDefaultRole(data.default_role || 'user');
        setDisablePasswordAuth(data.disable_password_auth);
        setEmailClaim(data.email_claim || 'email');
        setUsernameClaim(data.username_claim || 'preferred_username');
      } else {
        showToast('Failed to load OIDC configuration', 'error');
      }
    } catch (error) {
      console.error('Failed to fetch OIDC config:', error);
      showToast('Failed to load OIDC configuration', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);

      const updateData: Record<string, unknown> = {
        enabled,
        provider_name: providerName || 'SSO',
        discovery_url: discoveryUrl || null,
        client_id: clientId || null,
        scopes: scopes || 'openid email profile',
        auto_provision: autoProvision,
        default_role: defaultRole,
        disable_password_auth: disablePasswordAuth,
        email_claim: emailClaim || 'email',
        username_claim: usernameClaim || 'preferred_username',
      };

      // Only include client_secret if it was changed
      if (clientSecret) {
        updateData.client_secret = clientSecret;
      }

      const response = await authFetch('/admin/settings/oidc', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        const data = await response.json();
        setConfig(data);
        setClientSecret(''); // Clear secret field after save
        showToast('OIDC configuration saved', 'success');
      } else {
        const error = await response.json();
        showToast(error.detail || 'Failed to save OIDC configuration', 'error');
      }
    } catch (error) {
      console.error('Failed to save OIDC config:', error);
      showToast('Failed to save OIDC configuration', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestDiscovery = async () => {
    try {
      setTesting(true);
      const response = await authFetch('/admin/settings/oidc/test', {
        method: 'POST',
      });

      const result = await response.json();
      if (result.success) {
        showToast(result.message, 'success');
      } else {
        showToast(result.error || result.message, 'error');
      }
    } catch (error) {
      console.error('OIDC test failed:', error);
      showToast('Failed to test OIDC discovery', 'error');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasChanges =
    config &&
    (enabled !== config.enabled ||
      providerName !== (config.provider_name || 'SSO') ||
      discoveryUrl !== (config.discovery_url || '') ||
      clientId !== (config.client_id || '') ||
      clientSecret !== '' ||
      scopes !== (config.scopes || 'openid email profile') ||
      autoProvision !== config.auto_provision ||
      defaultRole !== (config.default_role || 'user') ||
      disablePasswordAuth !== config.disable_password_auth ||
      emailClaim !== (config.email_claim || 'email') ||
      usernameClaim !== (config.username_claim || 'preferred_username'));

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-lg ${
            toast.type === 'success'
              ? 'bg-green-500/10 text-green-500 border border-green-500/20'
              : toast.type === 'error'
                ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="w-4 h-4" />
          ) : toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4" />
          ) : (
            <Info className="w-4 h-4" />
          )}
          <span className="text-sm">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">SSO / OIDC Settings</h2>
          <p className="text-sm text-muted-foreground">
            Configure enterprise single sign-on with OpenID Connect
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchConfig} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Info Box */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/5 border border-blue-500/10">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Enterprise Single Sign-On</p>
          <p>
            Configure OIDC to allow users to sign in with your identity provider (Okta, Azure AD,
            Google Workspace, Auth0, etc.). Users will be automatically created on first login.
          </p>
        </div>
      </div>

      {/* Enable/Disable Toggle */}
      <div className="p-4 rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {enabled ? (
              <Unlock className="w-5 h-5 text-green-500" />
            ) : (
              <Lock className="w-5 h-5 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium">Enable OIDC/SSO</p>
              <p className="text-sm text-muted-foreground">
                {enabled ? 'SSO authentication is enabled' : 'SSO authentication is disabled'}
              </p>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      {/* Provider Configuration */}
      <div className="p-4 rounded-lg border border-border bg-card space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium">Provider Configuration</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Provider Name</label>
            <input
              type="text"
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              placeholder="SSO"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground"
              disabled={!enabled}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Display name for the SSO button (e.g., "Company SSO", "Okta")
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="text-sm font-medium mb-1 block">Discovery URL</label>
            <input
              type="url"
              value={discoveryUrl}
              onChange={(e) => setDiscoveryUrl(e.target.value)}
              placeholder="https://your-idp.com/.well-known/openid-configuration"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground"
              disabled={!enabled}
            />
            <p className="text-xs text-muted-foreground mt-1">
              OpenID Connect discovery endpoint URL
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Client ID</label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="your-client-id"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground"
              disabled={!enabled}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">
              Client Secret
              {config?.has_client_secret && (
                <span className="ml-2 text-xs text-green-500">(configured)</span>
              )}
            </label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={config?.has_client_secret ? '••••••••' : 'Enter client secret'}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground"
              disabled={!enabled}
            />
            {config?.has_client_secret && (
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty to keep existing secret
              </p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="text-sm font-medium mb-1 block">Scopes</label>
            <input
              type="text"
              value={scopes}
              onChange={(e) => setScopes(e.target.value)}
              placeholder="openid email profile"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground"
              disabled={!enabled}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Space-separated list of OAuth scopes to request
            </p>
          </div>
        </div>

        {/* Test Button */}
        <div className="pt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={handleTestDiscovery}
            disabled={testing || !enabled || !discoveryUrl}
          >
            {testing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4 mr-2" />
            )}
            Test Discovery
          </Button>
        </div>
      </div>

      {/* User Provisioning */}
      <div className="p-4 rounded-lg border border-border bg-card space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium">User Provisioning</h3>
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <p className="font-medium text-sm">Auto-provision Users</p>
            <p className="text-xs text-muted-foreground">
              Automatically create user accounts on first SSO login
            </p>
          </div>
          <Switch
            checked={autoProvision}
            onCheckedChange={setAutoProvision}
            disabled={!enabled}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Default Role</label>
            <select
              value={defaultRole}
              onChange={(e) => setDefaultRole(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground"
              disabled={!enabled}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Role assigned to auto-provisioned users
            </p>
          </div>
        </div>
      </div>

      {/* Claim Mapping */}
      <div className="p-4 rounded-lg border border-border bg-card space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Key className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium">Claim Mapping</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Email Claim</label>
            <input
              type="text"
              value={emailClaim}
              onChange={(e) => setEmailClaim(e.target.value)}
              placeholder="email"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground"
              disabled={!enabled}
            />
            <p className="text-xs text-muted-foreground mt-1">
              OIDC claim containing user's email
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Username Claim</label>
            <input
              type="text"
              value={usernameClaim}
              onChange={(e) => setUsernameClaim(e.target.value)}
              placeholder="preferred_username"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground"
              disabled={!enabled}
            />
            <p className="text-xs text-muted-foreground mt-1">
              OIDC claim containing username
            </p>
          </div>
        </div>
      </div>

      {/* Security Options */}
      <div className="p-4 rounded-lg border border-border bg-card space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium">Security Options</h3>
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <p className="font-medium text-sm">Disable Password Authentication</p>
            <p className="text-xs text-muted-foreground">
              Force all users to authenticate via SSO (disables login form)
            </p>
          </div>
          <Switch
            checked={disablePasswordAuth}
            onCheckedChange={setDisablePasswordAuth}
            disabled={!enabled}
          />
        </div>

        {disablePasswordAuth && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
            <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              Warning: Enabling this will prevent all password-based logins. Make sure SSO is
              properly configured and tested before enabling.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
