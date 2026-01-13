/**
 * User Settings Page
 *
 * User interface for managing personal credentials and settings.
 * Accessible to all authenticated users.
 */

import { ArrowLeft, User, Key, Settings2, GitBranch } from 'lucide-react';
import { useState } from 'react';
import { UserCredentials } from '../components/settings/UserCredentials';
import { UserDefaults } from '../components/settings/UserDefaults';

interface UserSettingsPageProps {
  onBack: () => void;
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
  authFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
}

type SettingsView = 'credentials' | 'defaults' | 'account';

export function UserSettingsPage({ onBack, user, authFetch }: UserSettingsPageProps) {
  const [activeView, setActiveView] = useState<SettingsView>('credentials');

  const navItems = [
    { id: 'credentials' as const, label: 'My Credentials', icon: Key },
    { id: 'defaults' as const, label: 'Default Settings', icon: Settings2 },
    { id: 'account' as const, label: 'Account', icon: User },
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
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground">My Settings</h1>
              <p className="text-xs text-muted-foreground">{user.email}</p>
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
          {activeView === 'credentials' && (
            <UserCredentials authFetch={authFetch} />
          )}
          {activeView === 'defaults' && (
            <UserDefaults authFetch={authFetch} />
          )}
          {activeView === 'account' && (
            <AccountSettings user={user} />
          )}
        </div>
      </main>
    </div>
  );
}

// Simple account info component (read-only for now)
function AccountSettings({ user }: { user: { username: string; email: string; role: string } }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Account Information</h2>
        <p className="text-sm text-muted-foreground">
          View your account details
        </p>
      </div>

      <div className="card-surface p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-muted-foreground">Username</label>
            <p className="text-foreground font-medium">{user.username}</p>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Email</label>
            <p className="text-foreground font-medium">{user.email}</p>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Role</label>
            <p className="text-foreground font-medium capitalize">{user.role}</p>
          </div>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        <p>To change your password or other account details, please contact an administrator.</p>
      </div>
    </div>
  );
}
