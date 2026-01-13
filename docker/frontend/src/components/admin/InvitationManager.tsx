/**
 * Invitation Manager Component
 *
 * Allows admins to create and manage user invitations.
 */

import { useState, useEffect } from 'react';
import {
  Plus,
  Copy,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle,
  Mail,
  Clock,
  UserCog,
  Send,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
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

interface Invitation {
  id: string;
  code: string;
  email: string | null;
  role: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  is_valid: boolean;
  note: string | null;
  email_sent?: boolean;
}

interface SMTPStatus {
  configured: boolean;
  enabled: boolean;
}

interface InvitationManagerProps {
  authFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
}

export function InvitationManager({ authFetch }: InvitationManagerProps) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // SMTP status
  const [smtpStatus, setSmtpStatus] = useState<SMTPStatus | null>(null);

  // Create dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [newExpiresHours, setNewExpiresHours] = useState('168');
  const [newNote, setNewNote] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invitationToDelete, setInvitationToDelete] = useState<Invitation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Include used invitations toggle
  const [includeUsed, setIncludeUsed] = useState(false);

  useEffect(() => {
    loadInvitations();
    loadSmtpStatus();
  }, [includeUsed]);

  const loadSmtpStatus = async () => {
    try {
      const response = await authFetch('/admin/settings/smtp/status');
      if (response.ok) {
        const data = await response.json();
        setSmtpStatus(data);
        // Auto-enable send email if SMTP is configured
        if (data.configured && data.enabled) {
          setSendEmail(true);
        }
      }
    } catch (err) {
      console.error('Failed to load SMTP status:', err);
    }
  };

  const loadInvitations = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authFetch(`/users/invitations?include_used=${includeUsed}`);
      if (response.ok) {
        const data = await response.json();
        setInvitations(data.invitations);
      } else {
        const err = await response.json();
        setError(err.detail || 'Failed to load invitations');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    setIsCreating(true);
    setCreateError(null);

    try {
      const response = await authFetch('/users/invitations', {
        method: 'POST',
        body: JSON.stringify({
          email: newEmail || null,
          role: newRole,
          expires_hours: parseInt(newExpiresHours),
          note: newNote || null,
          send_email: sendEmail && !!newEmail,
        }),
      });

      if (response.ok) {
        const invitation = await response.json();
        setInvitations((prev) => [invitation, ...prev]);
        setCreateDialogOpen(false);
        resetCreateForm();
      } else {
        const err = await response.json();
        setCreateError(err.detail || 'Failed to create invitation');
      }
    } catch (err) {
      setCreateError('Failed to connect to server');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!invitationToDelete) return;

    setIsDeleting(true);

    try {
      const response = await authFetch(`/users/invitations/${invitationToDelete.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setInvitations((prev) => prev.filter((inv) => inv.id !== invitationToDelete.id));
        setDeleteDialogOpen(false);
        setInvitationToDelete(null);
      } else {
        const err = await response.json();
        setError(err.detail || 'Failed to revoke invitation');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsDeleting(false);
    }
  };

  const copyToClipboard = async (code: string, id: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const resetCreateForm = () => {
    setNewEmail('');
    setNewRole('user');
    setNewExpiresHours('168');
    setNewNote('');
    setSendEmail(smtpStatus?.configured && smtpStatus?.enabled || false);
    setCreateError(null);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Invitations</h2>
          <p className="text-sm text-muted-foreground">
            Create invitation codes for new users
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={includeUsed}
              onChange={(e) => setIncludeUsed(e.target.checked)}
              className="rounded border-border"
            />
            Show used
          </label>

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-2" />
                Create Invitation
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Create Invitation</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Generate an invitation code for a new user.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {createError && (
                  <div className="flex items-center gap-2 p-3 bg-error-light border border-destructive/50 rounded-lg text-destructive">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm">{createError}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground">
                    Email (optional)
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="user@example.com"
                    disabled={isCreating}
                    className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground">
                    If specified, only this email can use the invitation.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role" className="text-foreground">
                    Role
                  </Label>
                  <Select value={newRole} onValueChange={setNewRole} disabled={isCreating}>
                    <SelectTrigger className="bg-secondary border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expires" className="text-foreground">
                    Expires In
                  </Label>
                  <Select value={newExpiresHours} onValueChange={setNewExpiresHours} disabled={isCreating}>
                    <SelectTrigger className="bg-secondary border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="24">24 hours</SelectItem>
                      <SelectItem value="72">3 days</SelectItem>
                      <SelectItem value="168">7 days</SelectItem>
                      <SelectItem value="336">14 days</SelectItem>
                      <SelectItem value="720">30 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="note" className="text-foreground">
                    Note (optional)
                  </Label>
                  <Input
                    id="note"
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Who is this invitation for?"
                    disabled={isCreating}
                    className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                {/* Send Email Option */}
                {smtpStatus?.configured && smtpStatus?.enabled && (
                  <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
                    <input
                      type="checkbox"
                      id="sendEmail"
                      checked={sendEmail && !!newEmail}
                      onChange={(e) => setSendEmail(e.target.checked)}
                      disabled={isCreating || !newEmail}
                      className="rounded border-border"
                    />
                    <div className="flex-1">
                      <Label htmlFor="sendEmail" className="text-foreground cursor-pointer flex items-center gap-2">
                        <Send className="w-4 h-4 text-primary" />
                        Send invitation email
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {newEmail
                          ? 'Email will be sent with the invitation code'
                          : 'Enter an email address to enable'}
                      </p>
                    </div>
                  </div>
                )}

                {smtpStatus && !smtpStatus.configured && (
                  <p className="text-xs text-muted-foreground">
                    <Mail className="w-3.5 h-3.5 inline mr-1" />
                    Configure SMTP in Email settings to enable automatic invitation emails.
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCreateDialogOpen(false);
                    resetCreateForm();
                  }}
                  disabled={isCreating}
                  className="border-border text-muted-foreground"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={isCreating}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Invitation'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-error-light border border-destructive/50 rounded-xl text-destructive">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadInvitations}
            className="ml-auto text-destructive hover:text-destructive/80"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && invitations.length === 0 && (
        <div className="text-center py-12 card-surface">
          <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center mx-auto mb-4">
            <Mail className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="text-foreground font-medium mb-2">No invitations</h3>
          <p className="text-muted-foreground text-sm">
            Create an invitation to add new users.
          </p>
        </div>
      )}

      {/* Invitations list */}
      {!isLoading && !error && invitations.length > 0 && (
        <div className="space-y-3">
          {invitations.map((invitation) => (
            <div
              key={invitation.id}
              className={`card-surface p-4 ${
                invitation.used_at ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="font-mono text-sm bg-secondary px-3 py-1.5 rounded-lg text-foreground">
                    {invitation.code}
                  </div>

                  {!invitation.used_at && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(invitation.code, invitation.id)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {copiedId === invitation.id ? (
                        <>
                          <CheckCircle className="w-4 h-4 mr-1 text-success" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  {/* Status badge */}
                  {invitation.used_at ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-success/20 text-success">
                      Used
                    </span>
                  ) : isExpired(invitation.expires_at) ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-destructive/20 text-destructive">
                      Expired
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full bg-info/20 text-info">
                      Active
                    </span>
                  )}

                  {/* Role badge */}
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      invitation.role === 'admin'
                        ? 'bg-primary/20 text-primary'
                        : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {invitation.role}
                  </span>

                  {/* Delete button */}
                  {!invitation.used_at && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setInvitationToDelete(invitation);
                        setDeleteDialogOpen(true);
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Details row */}
              <div className="flex items-center gap-6 mt-3 text-xs text-muted-foreground">
                {invitation.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    {invitation.email}
                    {invitation.email_sent && (
                      <span className="ml-1 text-success flex items-center gap-0.5">
                        <Send className="w-3 h-3" />
                        sent
                      </span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Expires {formatDate(invitation.expires_at)}
                </div>
                {invitation.note && (
                  <div className="flex items-center gap-1.5">
                    <UserCog className="w-3.5 h-3.5" />
                    {invitation.note}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Revoke Invitation</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to revoke this invitation? The code{' '}
              <strong className="text-foreground font-mono">
                {invitationToDelete?.code}
              </strong>{' '}
              will no longer be valid.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-border text-muted-foreground hover:text-foreground"
              disabled={isDeleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Revoking...
                </>
              ) : (
                'Revoke'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
