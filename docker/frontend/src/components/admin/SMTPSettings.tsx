/**
 * SMTP Settings Component
 *
 * Admin interface for configuring SMTP email delivery.
 */

import {
  AlertCircle,
  CheckCircle,
  Info,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  Save,
  Send,
  Server,
  Shield,
  Unlock,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';

interface SMTPConfig {
  enabled: boolean;
  host: string | null;
  port: number;
  username: string | null;
  has_password: boolean;
  use_tls: boolean;
  use_ssl: boolean;
  from_email: string | null;
  from_name: string;
}

interface SMTPSettingsProps {
  authFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
}

type ToastType = 'success' | 'error' | 'info';

export function SMTPSettings({ authFetch }: SMTPSettingsProps) {
  const [config, setConfig] = useState<SMTPConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState(587);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [useTls, setUseTls] = useState(true);
  const [useSsl, setUseSsl] = useState(false);
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('Auto-Claude');
  const [testEmail, setTestEmail] = useState('');

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const response = await authFetch('/admin/settings/smtp');
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
        setEnabled(data.enabled);
        setHost(data.host || '');
        setPort(data.port);
        setUsername(data.username || '');
        setPassword(''); // Never populate password field
        setUseTls(data.use_tls);
        setUseSsl(data.use_ssl);
        setFromEmail(data.from_email || '');
        setFromName(data.from_name || 'Auto-Claude');
      } else {
        showToast('Failed to load SMTP configuration', 'error');
      }
    } catch (error) {
      console.error('Failed to fetch SMTP config:', error);
      showToast('Failed to load SMTP configuration', 'error');
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
        host: host || null,
        port,
        username: username || null,
        use_tls: useTls,
        use_ssl: useSsl,
        from_email: fromEmail || null,
        from_name: fromName || 'Auto-Claude',
      };

      // Only include password if it was changed
      if (password) {
        updateData.password = password;
      }

      const response = await authFetch('/admin/settings/smtp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        const data = await response.json();
        setConfig(data);
        setPassword(''); // Clear password field after save
        showToast('SMTP configuration saved', 'success');
      } else {
        const error = await response.json();
        showToast(error.detail || 'Failed to save SMTP configuration', 'error');
      }
    } catch (error) {
      console.error('Failed to save SMTP config:', error);
      showToast('Failed to save SMTP configuration', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      const response = await authFetch('/admin/settings/smtp/test', {
        method: 'POST',
      });

      const result = await response.json();
      if (result.success) {
        showToast(result.message, 'success');
      } else {
        showToast(result.error || result.message, 'error');
      }
    } catch (error) {
      console.error('SMTP test failed:', error);
      showToast('Failed to test SMTP connection', 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmail) {
      showToast('Please enter an email address', 'error');
      return;
    }

    try {
      setSendingTest(true);
      const response = await authFetch('/admin/settings/smtp/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_email: testEmail }),
      });

      const result = await response.json();
      if (result.success) {
        showToast(result.message, 'success');
        setTestEmail('');
      } else {
        showToast(result.error || result.message, 'error');
      }
    } catch (error) {
      console.error('Failed to send test email:', error);
      showToast('Failed to send test email', 'error');
    } finally {
      setSendingTest(false);
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
      host !== (config.host || '') ||
      port !== config.port ||
      username !== (config.username || '') ||
      password !== '' ||
      useTls !== config.use_tls ||
      useSsl !== config.use_ssl ||
      fromEmail !== (config.from_email || '') ||
      fromName !== (config.from_name || 'Auto-Claude'));

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
          <h2 className="text-xl font-semibold">SMTP Settings</h2>
          <p className="text-sm text-muted-foreground">
            Configure email delivery for invitations and notifications
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
          <p className="font-medium text-foreground">Email Delivery</p>
          <p>
            Configure SMTP to automatically send invitation emails when creating new user
            invitations. Supports both STARTTLS (port 587) and SSL (port 465) connections.
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
              <p className="font-medium">Enable SMTP</p>
              <p className="text-sm text-muted-foreground">
                {enabled ? 'Email delivery is enabled' : 'Email delivery is disabled'}
              </p>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      {/* SMTP Server Configuration */}
      <div className="p-4 rounded-lg border border-border bg-card space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium">Server Configuration</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">SMTP Host</label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="smtp.example.com"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground"
              disabled={!enabled}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(parseInt(e.target.value) || 587)}
              placeholder="587"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground"
              disabled={!enabled}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground"
              disabled={!enabled}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">
              Password
              {config?.has_password && (
                <span className="ml-2 text-xs text-green-500">(configured)</span>
              )}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={config?.has_password ? '••••••••' : 'Enter password'}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground"
              disabled={!enabled}
            />
            {config?.has_password && (
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty to keep existing password
              </p>
            )}
          </div>
        </div>

        {/* TLS/SSL Options */}
        <div className="flex items-center gap-6 pt-4 border-t border-border">
          <div className="flex items-center gap-3">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <label className="text-sm font-medium">Use STARTTLS</label>
            <Switch checked={useTls} onCheckedChange={setUseTls} disabled={!enabled || useSsl} />
          </div>

          <div className="flex items-center gap-3">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <label className="text-sm font-medium">Use SSL</label>
            <Switch checked={useSsl} onCheckedChange={setUseSsl} disabled={!enabled || useTls} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          STARTTLS (port 587) upgrades the connection to TLS. SSL (port 465) uses implicit TLS from
          the start.
        </p>
      </div>

      {/* Sender Configuration */}
      <div className="p-4 rounded-lg border border-border bg-card space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium">Sender Configuration</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">From Email</label>
            <input
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="noreply@example.com"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground"
              disabled={!enabled}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">From Name</label>
            <input
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Auto-Claude"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground"
              disabled={!enabled}
            />
          </div>
        </div>
      </div>

      {/* Test Section */}
      <div className="p-4 rounded-lg border border-border bg-card space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Send className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium">Test Configuration</h3>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testing || !enabled || !host}
          >
            {testing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Server className="w-4 h-4 mr-2" />
            )}
            Test Connection
          </Button>

          <div className="flex flex-1 gap-2">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="test@example.com"
              className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-foreground"
              disabled={!enabled}
            />
            <Button
              variant="outline"
              onClick={handleSendTestEmail}
              disabled={sendingTest || !enabled || !testEmail}
            >
              {sendingTest ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send Test Email
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
