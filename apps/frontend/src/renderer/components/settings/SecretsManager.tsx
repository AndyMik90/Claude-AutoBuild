import { useState, useEffect } from 'react';
import { Plus, Key, Eye, EyeOff, Copy, Trash2, Pencil, ChevronDown, ChevronRight, AlertTriangle, Folder, Star } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type { SecretGroup } from '../../../shared/types';
import { AddSecretGroupDialog } from './AddSecretGroupDialog';
import { AddSecretAccountDialog } from './AddSecretAccountDialog';

interface SecretsManagerProps {
  // No props needed for embedded view
}

export function SecretsManager({}: SecretsManagerProps) {
  const [groups, setGroups] = useState<SecretGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddGroupDialogOpen, setIsAddGroupDialogOpen] = useState(false);
  const [isAddAccountDialogOpen, setIsAddAccountDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<SecretGroup | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<SecretGroup | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [revealedAccounts, setRevealedAccounts] = useState<Set<string>>(new Set());
  const [decryptedValues, setDecryptedValues] = useState<Record<string, Record<string, string>>>({});
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [defaultAccounts, setDefaultAccounts] = useState<Record<string, string>>({});

  const loadGroups = async () => {
    setIsLoading(true);
    try {
      // Check encryption availability
      const encryptionResult = await window.electronAPI.checkSecretsEncryption();
      if (encryptionResult.success && encryptionResult.data !== undefined) {
        setEncryptionAvailable(encryptionResult.data);
      }

      const result = await window.electronAPI.getSecretGroups();
      if (result.success && result.data) {
        setGroups(result.data);
      }

      // Load default accounts from settings
      const settingsResult = await window.electronAPI.getSettings();
      if (settingsResult.success && settingsResult.data?.defaultSecretAccounts) {
        setDefaultAccounts(settingsResult.data.defaultSecretAccounts);
      }
    } catch (error) {
      console.error('Failed to load secret groups:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const handleSetDefaultAccount = async (groupTitle: string, accountId: string) => {
    const newDefaults = { ...defaultAccounts, [groupTitle]: accountId };
    setDefaultAccounts(newDefaults);

    try {
      const settingsResult = await window.electronAPI.getSettings();
      if (settingsResult.success && settingsResult.data) {
        await window.electronAPI.saveSettings({
          ...settingsResult.data,
          defaultSecretAccounts: newDefaults
        });
      }
    } catch (error) {
      console.error('Failed to save default account:', error);
    }
  };

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const handleRevealAccount = async (groupId: string, accountId: string) => {
    if (revealedAccounts.has(accountId)) {
      // Hide the account
      const newRevealed = new Set(revealedAccounts);
      newRevealed.delete(accountId);
      setRevealedAccounts(newRevealed);

      // Remove decrypted values
      const newDecrypted = { ...decryptedValues };
      delete newDecrypted[accountId];
      setDecryptedValues(newDecrypted);
    } else {
      // Decrypt and reveal the account
      try {
        const result = await window.electronAPI.decryptSecretAccount(groupId, accountId);
        if (result.success && result.data) {
          const newRevealed = new Set(revealedAccounts);
          newRevealed.add(accountId);
          setRevealedAccounts(newRevealed);

          setDecryptedValues(prev => ({ ...prev, [accountId]: result.data! }));
        }
      } catch (error) {
        console.error('Failed to decrypt account:', error);
      }
    }
  };

  const handleCopyKey = async (groupId: string, accountId: string, keyId: string) => {
    try {
      const result = await window.electronAPI.decryptSecretAccountKey(groupId, accountId, keyId);
      if (result.success && result.data) {
        await navigator.clipboard.writeText(result.data);
      }
    } catch (error) {
      console.error('Failed to copy key:', error);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Are you sure you want to delete this secret group and all its accounts? This action cannot be undone.')) {
      return;
    }

    try {
      const result = await window.electronAPI.deleteSecretGroup(groupId);
      if (result.success) {
        await loadGroups();
      }
    } catch (error) {
      console.error('Failed to delete group:', error);
    }
  };

  const handleDeleteAccount = async (groupId: string, accountId: string) => {
    if (!confirm('Are you sure you want to delete this account?')) {
      return;
    }

    try {
      const result = await window.electronAPI.deleteSecretAccount(groupId, accountId);
      if (result.success) {
        await loadGroups();
      }
    } catch (error) {
      console.error('Failed to delete account:', error);
    }
  };

  const handleEditGroup = (group: SecretGroup) => {
    setEditingGroup(group);
    setIsAddGroupDialogOpen(true);
  };

  const handleAddAccount = (group: SecretGroup) => {
    setSelectedGroup(group);
    setIsAddAccountDialogOpen(true);
  };

  const handleGroupSaved = () => {
    loadGroups();
    setIsAddGroupDialogOpen(false);
    setEditingGroup(null);
  };

  const handleAccountSaved = () => {
    loadGroups();
    setIsAddAccountDialogOpen(false);
    setSelectedGroup(null);
  };

  if (!encryptionAvailable) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <h3 className="text-lg font-semibold mb-2">Encryption Not Available</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Secure encryption is not available on your system. Please ensure your operating system supports secure storage.
        </p>
      </div>
    );
  }

  // Get groups with multiple accounts for default selection
  const groupsWithMultipleAccounts = groups.filter(g => g.accounts.length > 1);

  return (
    <>
      <div className="space-y-6">
        {/* Description */}
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <h3 className="font-medium text-sm mb-2">About Secrets</h3>
          <p className="text-sm text-muted-foreground">
            Secrets are securely encrypted credentials that auto-populate into your generated projects.
            Create secret groups with multiple accounts, then reference them in your template files using
            secret parameters. When creating projects, select which account to use and the values are
            automatically injected.
          </p>
        </div>

        {/* Add Group Button */}
        <div>
          <Button onClick={() => setIsAddGroupDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Secret Group
          </Button>
        </div>

        {/* Default Accounts Section */}
        {!isLoading && groupsWithMultipleAccounts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-4 w-4" />
                Default Accounts for Templates
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Select which account to use by default when creating projects from templates
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {groupsWithMultipleAccounts.map((group) => (
                <div key={group.id} className="space-y-2">
                  <Label htmlFor={`default-${group.id}`}>{group.title}</Label>
                  <Select
                    value={defaultAccounts[group.title] || ''}
                    onValueChange={(value) => handleSetDefaultAccount(group.title, value)}
                  >
                    <SelectTrigger id={`default-${group.id}`}>
                      <SelectValue placeholder="Select default account" />
                    </SelectTrigger>
                    <SelectContent>
                      {group.accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {group.accounts.length} accounts available
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Secret Groups List */}
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading secrets...</div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Key className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No secret groups yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first secret group template to securely store credentials
            </p>
            <Button onClick={() => setIsAddGroupDialogOpen(true)} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Create Secret Group
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <Card key={group.id} className="overflow-hidden">
                <CardHeader
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleGroup(group.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {expandedGroups.has(group.id) ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                      {group.imagePath ? (
                        <img
                          src={`file://${group.imagePath}`}
                          alt={group.title}
                          className="h-8 w-8 rounded object-cover"
                        />
                      ) : (
                        <Folder className="h-8 w-8 text-muted-foreground" />
                      )}
                      <div>
                        <CardTitle className="text-base">{group.title}</CardTitle>
                        {group.description && (
                          <p className="text-sm text-muted-foreground mt-1">{group.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1">
                          <p className="text-xs text-muted-foreground">
                            {group.accounts.length} {group.accounts.length === 1 ? 'account' : 'accounts'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Keys: {group.keyIds.join(', ')}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAddAccount(group)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Account
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditGroup(group)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteGroup(group.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {expandedGroups.has(group.id) && (
                  <CardContent className="pt-0">
                    {group.accounts.length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-4">
                        No accounts yet. Click "Add Account" to create one.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {group.accounts.map((account) => (
                          <div
                            key={account.id}
                            className="p-4 rounded-md bg-muted/30 border border-border"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-medium text-sm">{account.title}</h4>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRevealAccount(group.id, account.id)}
                                >
                                  {revealedAccounts.has(account.id) ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteAccount(group.id, account.id)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {group.keyIds.map((keyId) => (
                                <div
                                  key={keyId}
                                  className="flex items-center justify-between p-2 rounded bg-background/50"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-muted-foreground mb-1">{keyId}</div>
                                    <div className="text-xs font-mono">
                                      {revealedAccounts.has(account.id) && decryptedValues[account.id]?.[keyId]
                                        ? decryptedValues[account.id][keyId]
                                        : '••••••••••••••••'}
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleCopyKey(group.id, account.id, keyId)}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Secret Group Dialog */}
      <AddSecretGroupDialog
        open={isAddGroupDialogOpen}
        onOpenChange={setIsAddGroupDialogOpen}
        group={editingGroup}
        onSaved={handleGroupSaved}
      />

      {/* Add Secret Account Dialog */}
      <AddSecretAccountDialog
        open={isAddAccountDialogOpen}
        onOpenChange={setIsAddAccountDialogOpen}
        group={selectedGroup}
        onSaved={handleAccountSaved}
      />
    </>
  );
}
