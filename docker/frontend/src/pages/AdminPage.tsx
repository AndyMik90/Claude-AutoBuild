/**
 * Admin Page
 *
 * Administrative interface for managing users and invitations.
 * Only accessible to admin users.
 */

import { ArrowLeft, Users, Mail, Settings, Key, Send, Shield, Sliders } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { UserManagement } from '../components/admin/UserManagement';
import { InvitationManager } from '../components/admin/InvitationManager';
import { GlobalCredentials } from '../components/admin/GlobalCredentials';
import { GlobalSettings } from '../components/admin/GlobalSettings';
import { SMTPSettings } from '../components/admin/SMTPSettings';
import { OIDCSettings } from '../components/admin/OIDCSettings';

interface AdminPageProps {
  onBack: () => void;
  currentUserId: string;
  authFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
}

type AdminView = 'users' | 'invitations' | 'credentials' | 'settings' | 'smtp' | 'oidc';

export function AdminPage({ onBack, currentUserId, authFetch }: AdminPageProps) {
  const [activeView, setActiveView] = useState<AdminView>('users');

  const navItems = [
    { id: 'users' as const, label: 'Users', icon: Users },
    { id: 'invitations' as const, label: 'Invitations', icon: Mail },
    { id: 'credentials' as const, label: 'Global Credentials', icon: Key },
    { id: 'settings' as const, label: 'System Settings', icon: Sliders },
    { id: 'smtp' as const, label: 'Email (SMTP)', icon: Send },
    { id: 'oidc' as const, label: 'SSO (OIDC)', icon: Shield },
  ];

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-sidebar flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to Dashboard</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/20 border border-primary/30 rounded-xl flex items-center justify-center">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground">Admin Settings</h1>
              <p className="text-xs text-muted-foreground">Manage users & access</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl">
          {activeView === 'users' && (
            <UserManagement authFetch={authFetch} currentUserId={currentUserId} />
          )}
          {activeView === 'invitations' && (
            <InvitationManager authFetch={authFetch} />
          )}
          {activeView === 'credentials' && (
            <GlobalCredentials authFetch={authFetch} />
          )}
          {activeView === 'settings' && (
            <GlobalSettings authFetch={authFetch} />
          )}
          {activeView === 'smtp' && (
            <SMTPSettings authFetch={authFetch} />
          )}
          {activeView === 'oidc' && (
            <OIDCSettings authFetch={authFetch} />
          )}
        </div>
      </main>
    </div>
  );
}
