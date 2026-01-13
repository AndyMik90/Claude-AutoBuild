/**
 * App - Main Application Component
 *
 * Handles authentication state and renders the appropriate view:
 * - SetupPage: First-time setup (no users exist)
 * - LoginPage: User login
 * - RegisterPage: Registration with invite code
 * - Dashboard: Main application (authenticated)
 * - AdminPage: Admin settings (admin only)
 *
 * Uses the app's design system (Oscura Midnight theme).
 */

import { useState, useEffect } from 'react';
import { Loader2, LogOut, User, Settings, Shield, UserCog } from 'lucide-react';
import { TooltipProvider } from './components/ui/tooltip';
import { Button } from './components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu';
import { useAuthStore, checkAuthStatus, logout } from './stores/auth-store';
import { SetupPage } from './pages/SetupPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { Dashboard } from './pages/Dashboard';
import { AdminPage } from './pages/AdminPage';
import { UserSettingsPage } from './pages/UserSettingsPage';

type AuthView = 'login' | 'register';

// API helper for authenticated requests
const API_BASE = '/api';

async function authFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const stored = localStorage.getItem('auth-storage');
  let token: string | null = null;
  if (stored) {
    const parsed = JSON.parse(stored);
    token = parsed.state?.accessToken || null;
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
}

export function App() {
  const [authView, setAuthView] = useState<AuthView>('login');
  const [showAdminPage, setShowAdminPage] = useState(false);
  const [showUserSettings, setShowUserSettings] = useState(false);

  // Auth state from store
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const setupRequired = useAuthStore((state) => state.setupRequired);

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Apply dark theme by default
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  // Show loading screen while checking auth status
  if (isLoading || setupRequired === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Show setup page if no users exist
  if (setupRequired) {
    return <SetupPage />;
  }

  // Show login/register if not authenticated
  if (!isAuthenticated) {
    if (authView === 'register') {
      return <RegisterPage onBackToLogin={() => setAuthView('login')} />;
    }
    return <LoginPage onRegisterClick={() => setAuthView('register')} />;
  }

  // Authenticated - show dashboard with header
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <header className="h-14 border-b border-border bg-sidebar flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary/20 border border-primary/30 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">Auto Claude</h1>
          </div>

          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                  <div className="w-8 h-8 rounded-lg bg-secondary border border-border flex items-center justify-center">
                    <User className="w-4 h-4" />
                  </div>
                  <span className="hidden sm:inline text-sm font-medium">{user?.username || user?.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-popover border-border">
                <DropdownMenuLabel className="text-foreground">
                  <div className="flex flex-col">
                    <span className="font-medium">{user?.username}</span>
                    <span className="text-xs text-muted-foreground font-normal">{user?.email}</span>
                    <span className="text-xs text-primary capitalize mt-1">{user?.role}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem
                  className="text-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                  onSelect={() => setShowUserSettings(true)}
                >
                  <UserCog className="w-4 h-4 mr-2" />
                  My Settings
                </DropdownMenuItem>
                {user?.role === 'admin' && (
                  <DropdownMenuItem
                    className="text-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                    onSelect={() => setShowAdminPage(true)}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Admin Settings
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem
                  onSelect={() => logout()}
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {showAdminPage && user ? (
            <AdminPage
              onBack={() => setShowAdminPage(false)}
              currentUserId={user.id}
              authFetch={authFetch}
            />
          ) : showUserSettings && user ? (
            <UserSettingsPage
              onBack={() => setShowUserSettings(false)}
              user={user}
              authFetch={authFetch}
            />
          ) : (
            <Dashboard />
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}
