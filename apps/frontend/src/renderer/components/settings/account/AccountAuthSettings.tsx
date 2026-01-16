import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Key, Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { useToast } from '../../../hooks/use-toast';
import type { AppSettings } from '../../../../shared/types';

interface AccountAuthSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: Partial<AppSettings>) => void;
}

export function AccountAuthSettings({ settings, onSettingsChange }: AccountAuthSettingsProps) {
  const { t } = useTranslation('settings');
  const { toast } = useToast();
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const convexAuth = settings.convexAuth || { enabled: false };

  const handleEnabledChange = (enabled: boolean) => {
    onSettingsChange({
      convexAuth: {
        ...convexAuth,
        enabled
      }
    });
  };

  const handleDeploymentUrlChange = (url: string) => {
    onSettingsChange({
      convexAuth: {
        ...convexAuth,
        deploymentUrl: url || undefined
      }
    });
  };

  const handleTestConnection = async () => {
    if (!convexAuth.deploymentUrl) {
      toast({
        title: 'Convex URL required',
        description: 'Please enter a Convex deployment URL first',
        variant: 'destructive'
      });
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus('idle');

    try {
      // Test connection by making a request to the Convex deployment
      const response = await fetch(`${convexAuth.deploymentUrl}/site/auth/session`, {
        method: 'GET',
        credentials: 'include'
      });

      if (response.ok || response.status === 401) {
        // 401 means auth is working but we're not authenticated
        setConnectionStatus('success');
        toast({
          title: 'Connection successful',
          description: 'Convex deployment is reachable'
        });
      } else {
        throw new Error('Connection failed');
      }
    } catch (error) {
      setConnectionStatus('error');
      toast({
        title: 'Connection failed',
        description: 'Could not reach Convex deployment',
        variant: 'destructive'
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Enable/Disable Auth */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="auth-enabled">Enable Authentication</Label>
          <p className="text-sm text-muted-foreground">
            Use Convex + Better Auth for user authentication (optional)
          </p>
        </div>
        <Switch
          id="auth-enabled"
          checked={convexAuth.enabled}
          onCheckedChange={handleEnabledChange}
        />
      </div>

      {/* Convex Deployment URL */}
      <div className="space-y-2">
        <Label htmlFor="deployment-url">Convex Deployment URL</Label>
        <div className="flex gap-2">
          <Input
            id="deployment-url"
            type="text"
            placeholder="https://adjective-animal-123.convex.site"
            value={convexAuth.deploymentUrl || ''}
            onChange={(e) => handleDeploymentUrlChange(e.target.value)}
            disabled={!convexAuth.enabled}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={handleTestConnection}
            disabled={!convexAuth.enabled || !convexAuth.deploymentUrl || isTestingConnection}
          >
            {isTestingConnection ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : connectionStatus === 'success' ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : connectionStatus === 'error' ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : (
              <Key className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          The Convex deployment URL (ends in .convex.site)
        </p>
      </div>

      {/* Info Section */}
      <div className="rounded-lg border border-border bg-muted/50 p-4">
        <h3 className="font-medium text-sm mb-2">About Convex Authentication</h3>
        <p className="text-sm text-muted-foreground">
          Convex + Better Auth provides secure authentication with support for:
        </p>
        <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
          <li>Email & password authentication</li>
          <li>OAuth providers (GitHub, Google, etc.)</li>
          <li>Session management</li>
          <li>User profile storage</li>
        </ul>
        <p className="text-sm text-muted-foreground mt-2">
          Authentication is completely optional - the app works normally without it.
        </p>
      </div>

      {/* Development Mode Notice */}
      {convexAuth.enabled && convexAuth.deploymentUrl?.includes('dev:') && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            <strong>Development Mode:</strong> Using a development Convex deployment.
            Make sure <code>npx convex dev</code> is running in the services/convex directory.
          </p>
        </div>
      )}
    </div>
  );
}
