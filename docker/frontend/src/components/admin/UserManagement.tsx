/**
 * User Management Component
 *
 * Allows admins to view and manage users.
 */

import { useState, useEffect } from 'react';
import {
  User,
  Shield,
  UserX,
  UserCheck,
  Loader2,
  AlertCircle,
  RefreshCw,
  MoreVertical,
  Calendar,
  Clock,
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

interface UserItem {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

interface UserManagementProps {
  authFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
  currentUserId: string;
}

export function UserManagement({ authFetch, currentUserId }: UserManagementProps) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  // Action confirmation dialog
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    type: 'activate' | 'deactivate' | 'promote' | 'demote';
    user: UserItem | null;
  }>({
    open: false,
    type: 'deactivate',
    user: null,
  });
  const [isActioning, setIsActioning] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authFetch('/users?page=1&page_size=100');
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
        setTotal(data.total);
      } else {
        const err = await response.json();
        setError(err.detail || 'Failed to load users');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async () => {
    if (!actionDialog.user) return;

    setIsActioning(true);

    try {
      let body: Record<string, unknown> = {};

      switch (actionDialog.type) {
        case 'activate':
          body = { is_active: true };
          break;
        case 'deactivate':
          body = { is_active: false };
          break;
        case 'promote':
          body = { role: 'admin' };
          break;
        case 'demote':
          body = { role: 'user' };
          break;
      }

      const response = await authFetch(`/users/${actionDialog.user.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const updatedUser = await response.json();
        setUsers((prev) =>
          prev.map((u) => (u.id === updatedUser.id ? updatedUser : u))
        );
        setActionDialog({ open: false, type: 'deactivate', user: null });
      } else {
        const err = await response.json();
        setError(err.detail || 'Failed to update user');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsActioning(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getActionDialogContent = () => {
    const user = actionDialog.user;
    if (!user) return { title: '', description: '', action: '' };

    switch (actionDialog.type) {
      case 'activate':
        return {
          title: 'Activate User',
          description: `Are you sure you want to activate ${user.username}? They will be able to log in and use the system.`,
          action: 'Activate',
        };
      case 'deactivate':
        return {
          title: 'Deactivate User',
          description: `Are you sure you want to deactivate ${user.username}? They will no longer be able to log in.`,
          action: 'Deactivate',
        };
      case 'promote':
        return {
          title: 'Promote to Admin',
          description: `Are you sure you want to make ${user.username} an admin? They will have full access to manage users and settings.`,
          action: 'Promote',
        };
      case 'demote':
        return {
          title: 'Remove Admin Rights',
          description: `Are you sure you want to remove admin rights from ${user.username}? They will become a regular user.`,
          action: 'Remove Admin',
        };
    }
  };

  const dialogContent = getActionDialogContent();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Users</h2>
          <p className="text-sm text-muted-foreground">
            {total} registered user{total !== 1 ? 's' : ''}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadUsers}
          disabled={isLoading}
          className="border-border text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-error-light border border-destructive/50 rounded-xl text-destructive">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setError(null)}
            className="ml-auto text-destructive hover:text-destructive/80"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {/* Users list */}
      {!isLoading && users.length > 0 && (
        <div className="space-y-3">
          {users.map((user) => {
            const isCurrentUser = user.id === currentUserId;

            return (
              <div
                key={user.id}
                className={`card-surface p-4 ${!user.is_active ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        user.role === 'admin'
                          ? 'bg-primary/20 border border-primary/30'
                          : 'bg-secondary border border-border'
                      }`}
                    >
                      {user.role === 'admin' ? (
                        <Shield className="w-5 h-5 text-primary" />
                      ) : (
                        <User className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>

                    {/* User info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {user.username}
                        </span>
                        {isCurrentUser && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-info/20 text-info">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">{user.email}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Role badge */}
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        user.role === 'admin'
                          ? 'bg-primary/20 text-primary'
                          : 'bg-secondary text-muted-foreground'
                      }`}
                    >
                      {user.role}
                    </span>

                    {/* Status badge */}
                    {user.is_active ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-success/20 text-success">
                        Active
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-destructive/20 text-destructive">
                        Inactive
                      </span>
                    )}

                    {/* Actions dropdown */}
                    {!isCurrentUser && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover border-border">
                          {user.is_active ? (
                            <DropdownMenuItem
                              className="text-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                              onClick={() =>
                                setActionDialog({
                                  open: true,
                                  type: 'deactivate',
                                  user,
                                })
                              }
                            >
                              <UserX className="w-4 h-4 mr-2" />
                              Deactivate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="text-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                              onClick={() =>
                                setActionDialog({
                                  open: true,
                                  type: 'activate',
                                  user,
                                })
                              }
                            >
                              <UserCheck className="w-4 h-4 mr-2" />
                              Activate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator className="bg-border" />
                          {user.role === 'user' ? (
                            <DropdownMenuItem
                              className="text-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                              onClick={() =>
                                setActionDialog({
                                  open: true,
                                  type: 'promote',
                                  user,
                                })
                              }
                            >
                              <Shield className="w-4 h-4 mr-2" />
                              Promote to Admin
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                              onClick={() =>
                                setActionDialog({
                                  open: true,
                                  type: 'demote',
                                  user,
                                })
                              }
                            >
                              <User className="w-4 h-4 mr-2" />
                              Remove Admin
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                {/* Details row */}
                <div className="flex items-center gap-6 mt-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Joined {formatDate(user.created_at)}
                  </div>
                  {user.last_login && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Last login {formatDateTime(user.last_login)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action confirmation dialog */}
      <AlertDialog
        open={actionDialog.open}
        onOpenChange={(open) =>
          setActionDialog((prev) => ({ ...prev, open }))
        }
      >
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              {dialogContent.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {dialogContent.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-border text-muted-foreground hover:text-foreground"
              disabled={isActioning}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAction}
              disabled={isActioning}
              className={
                actionDialog.type === 'deactivate' || actionDialog.type === 'demote'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }
            >
              {isActioning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                dialogContent.action
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
