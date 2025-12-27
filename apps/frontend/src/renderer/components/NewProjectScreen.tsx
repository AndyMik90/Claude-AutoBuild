import { useState, useEffect } from 'react';
import { FolderOpen, Clock, ChevronRight, Folder, Search, Plus, GitBranch, Settings2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import type { Project, Template, TemplateParameter, ParsedTemplate, SecretGroup } from '../../shared/types';

interface NewProjectScreenProps {
  open: boolean;
  projects: Project[];
  onImportFolder: () => void;
  onSelectRecentProject: (projectId: string) => void;
  onCreateFromTemplate: (template: Template) => void;
  onOpenChange: (open: boolean) => void;
}

export function NewProjectScreen({
  open,
  projects,
  onImportFolder,
  onSelectRecentProject,
  onCreateFromTemplate,
  onOpenChange
}: NewProjectScreenProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [cloneUrl, setCloneUrl] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string>('');
  const [showCreateFromTemplateDialog, setShowCreateFromTemplateDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [projectName, setProjectName] = useState('');
  const [isCreatingFromTemplate, setIsCreatingFromTemplate] = useState(false);
  const [createTemplateError, setCreateTemplateError] = useState<string>('');
  const [templateParameters, setTemplateParameters] = useState<ParsedTemplate | null>(null);
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({});
  const [secretGroups, setSecretGroups] = useState<SecretGroup[]>([]);
  const [selectedSecretAccounts, setSelectedSecretAccounts] = useState<Record<string, string>>({});

  // Load templates on mount
  useEffect(() => {
    const loadTemplates = async () => {
      setIsLoadingTemplates(true);
      try {
        const result = await window.electronAPI.getTemplates();
        if (result.success && result.data) {
          setTemplates(result.data);
        }
      } catch (error) {
        console.error('Failed to load templates:', error);
      } finally {
        setIsLoadingTemplates(false);
      }
    };
    loadTemplates();
  }, []);

  // Filter templates based on search query
  const filteredTemplates = templates.filter((template) =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort projects by updatedAt (most recent first) and take top 5
  const recentProjects = [...projects]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(date).toLocaleDateString();
  };

  const handleCloneRepo = async () => {
    if (!cloneUrl.trim()) {
      setCloneError('Please enter a repository URL');
      return;
    }

    setIsCloning(true);
    setCloneError('');

    try {
      // Get default projects location or ask user where to clone
      const destinationPath = await window.electronAPI.selectDirectory();
      if (!destinationPath) {
        setIsCloning(false);
        return;
      }

      // Clone the repository
      const result = await window.electronAPI.cloneRepository(cloneUrl.trim(), destinationPath);

      if (result.success && result.data) {
        // Add the cloned project
        const project = await window.electronAPI.addProject(result.data.path);
        if (project.success && project.data) {
          // Close both dialogs
          setShowCloneDialog(false);
          onOpenChange(false);
          setCloneUrl('');

          // Open the project (this will be handled by the parent component)
          onSelectRecentProject(project.data.id);
        }
      } else {
        setCloneError(result.error || 'Failed to clone repository');
      }
    } catch (error) {
      setCloneError(error instanceof Error ? error.message : 'Failed to clone repository');
    } finally {
      setIsCloning(false);
    }
  };

  const handleOpenCreateFromTemplate = async (template: Template) => {
    setSelectedTemplate(template);
    setProjectName('');
    setCreateTemplateError('');
    setTemplateParameters(null);
    setParameterValues({});
    setSelectedSecretAccounts({});

    // Load settings for default secret accounts
    let defaultSecretAccounts: Record<string, string> = {};
    try {
      const settingsResult = await window.electronAPI.getSettings();
      if (settingsResult.success && settingsResult.data?.defaultSecretAccounts) {
        defaultSecretAccounts = settingsResult.data.defaultSecretAccounts;
      }
    } catch (error) {
      console.warn('Failed to load settings:', error);
    }

    // Load secret groups for secret-type parameters
    let secretsResult;
    try {
      secretsResult = await window.electronAPI.getSecretGroups();
      if (secretsResult.success && secretsResult.data) {
        console.log('[TEMPLATE] Loaded secret groups:', secretsResult.data.map(g => ({
          title: g.title,
          accountCount: g.accounts.length,
          accounts: g.accounts.map(a => ({ id: a.id, title: a.title }))
        })));
        setSecretGroups(secretsResult.data);
      }
    } catch (error) {
      console.warn('Failed to load secret groups:', error);
    }

    // Parse template parameters immediately
    try {
      const parseResult = await window.electronAPI.parseTemplateParameters(template.id);

      if (parseResult.success && parseResult.data && parseResult.data.parameters.length > 0) {
        setTemplateParameters(parseResult.data);

        // Initialize parameter values with defaults
        const initialValues: Record<string, string> = {};
        const initialSecretAccounts: Record<string, string> = {};

        for (const param of parseResult.data.parameters) {
          if (param.type === 'secret' && param.group) {
            // For secret parameters, find the group
            console.log('[TEMPLATE] Looking for group:', param.group);
            const group = secretsResult?.data?.find(g => g.title === param.group);
            console.log('[TEMPLATE] Found group:', group ? { title: group.title, accounts: group.accounts.length } : 'NOT FOUND');

            if (group) {
              if (group.accounts.length === 1) {
                // Auto-select if only one account
                console.log('[TEMPLATE] Auto-selecting single account:', group.accounts[0].id);
                initialSecretAccounts[param.key] = group.accounts[0].id;
              } else if (group.accounts.length > 1 && defaultSecretAccounts[param.group]) {
                // Use default account from settings if configured
                const defaultAccountId = defaultSecretAccounts[param.group];
                if (group.accounts.some(acc => acc.id === defaultAccountId)) {
                  console.log('[TEMPLATE] Using default account:', defaultAccountId);
                  initialSecretAccounts[param.key] = defaultAccountId;
                }
              }
            }
          } else {
            initialValues[param.key] = param.default || '';
          }
        }

        setParameterValues(initialValues);
        setSelectedSecretAccounts(initialSecretAccounts);
      }
    } catch (error) {
      console.warn('Failed to parse template parameters:', error);
      // Continue without parameters
    }

    setShowCreateFromTemplateDialog(true);
  };

  const handleCreateFromTemplateSubmit = async () => {
    if (!projectName.trim()) {
      setCreateTemplateError('Please enter a project name');
      return;
    }

    if (!selectedTemplate) return;

    // Proceed with creation (parameters were already parsed when dialog opened)
    await createProjectFromTemplate();
  };

  const createProjectFromTemplate = async () => {
    if (!selectedTemplate || !projectName.trim()) return;

    setIsCreatingFromTemplate(true);
    setCreateTemplateError('');

    try {
      // Get the default projects location from settings
      const settingsResult = await window.electronAPI.getSettings();
      if (!settingsResult.success || !settingsResult.data) {
        setCreateTemplateError('Failed to load settings');
        setIsCreatingFromTemplate(false);
        return;
      }

      const defaultLocation = settingsResult.data.projectPath;
      if (!defaultLocation) {
        setCreateTemplateError('Default projects path not set. Please configure it in Settings > General.');
        setIsCreatingFromTemplate(false);
        return;
      }

      let result;
      // Copy template with or without parameter replacement
      if (templateParameters && templateParameters.parameters.length > 0) {
        // Collect all parameter values including decrypted secrets
        const allParameterValues: Record<string, string> = { ...parameterValues };

        // Decrypt secret parameters
        for (const param of templateParameters.parameters) {
          if (param.type === 'secret' && param.group && param.secretKey) {
            const accountId = selectedSecretAccounts[param.key];
            if (accountId) {
              // Find the group to get its ID
              const group = secretGroups.find(g => g.title === param.group);
              if (group) {
                const decryptResult = await window.electronAPI.decryptSecretAccountKey(
                  group.id,
                  accountId,
                  param.secretKey
                );
                if (decryptResult.success && decryptResult.data) {
                  allParameterValues[param.key] = decryptResult.data;
                }
              }
            }
          }
        }

        result = await window.electronAPI.copyTemplateWithParameters(
          selectedTemplate.id,
          defaultLocation,
          projectName.trim(),
          allParameterValues
        );
      } else {
        result = await window.electronAPI.copyTemplateWithName(
          selectedTemplate.id,
          defaultLocation,
          projectName.trim()
        );
      }

      if (!result.success || !result.data) {
        setCreateTemplateError(result.error || 'Failed to copy template');
        setIsCreatingFromTemplate(false);
        return;
      }

      const projectPath = result.data.path;

      // Add the project
      const project = await window.electronAPI.addProject(projectPath);
      if (!project.success || !project.data) {
        setCreateTemplateError('Project created but failed to add to list');
        setIsCreatingFromTemplate(false);
        return;
      }

      // Initialize git repository
      await window.electronAPI.initializeGit(projectPath);

      // Initialize Auto Claude
      await window.electronAPI.initializeProject(project.data.id);

      // Close all dialogs
      setShowCreateFromTemplateDialog(false);
      setSelectedTemplate(null);
      setProjectName('');
      setTemplateParameters(null);
      setParameterValues({});
      setSelectedSecretAccounts({});

      // Open the project (parent will reload projects and open the tab)
      await onSelectRecentProject(project.data.id);

      // Close the main new project dialog
      onOpenChange(false);
    } catch (error) {
      setCreateTemplateError(error instanceof Error ? error.message : 'Failed to create project from template');
    } finally {
      setIsCreatingFromTemplate(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>
            Import an existing folder, clone a repository, open a recent project, or create from a template
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="space-y-6">
          {/* Import & Recent Projects Section */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Get Started</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Import Folder / Clone Repository Card */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <FolderOpen className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground mb-1">Add Project</h3>
                      <p className="text-sm text-muted-foreground">
                        Import an existing folder or clone a repository
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={onImportFolder}
                    >
                      <FolderOpen className="h-4 w-4" />
                      Import Folder
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={() => setShowCloneDialog(true)}
                    >
                      <GitBranch className="h-4 w-4" />
                      Clone Repo
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Projects Card */}
              <Card className="overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-medium text-foreground">Recent Projects</h3>
                  </div>
                  {recentProjects.length > 0 ? (
                    <div className="space-y-1 max-h-[180px] overflow-y-auto">
                        {recentProjects.map((project) => (
                          <button
                            key={project.id}
                            onClick={() => onSelectRecentProject(project.id)}
                            className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/50 group"
                          >
                            <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{project.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatRelativeTime(project.updatedAt)}
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </button>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No recent projects</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Templates Section */}
          <section>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold">Create from Template</h2>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {isLoadingTemplates ? (
              <div className="text-center py-12 text-muted-foreground">
                Loading templates...
              </div>
            ) : filteredTemplates.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-12 text-center">
                  <Folder className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-medium text-foreground mb-2">
                    {searchQuery ? 'No templates found' : 'No templates yet'}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {searchQuery
                      ? 'Try a different search term'
                      : 'Create templates in Settings to get started quickly'}
                  </p>
                  {!searchQuery && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        // Trigger opening app settings to templates section
                        window.dispatchEvent(
                          new CustomEvent('open-app-settings', { detail: 'templates' })
                        );
                        onOpenChange(false);
                      }}
                    >
                      Go to Templates Settings
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTemplates.map((template) => (
                  <Card
                    key={template.id}
                    className="group overflow-hidden hover:border-accent transition-all"
                  >
                    <CardContent className="p-4">
                      {/* Template Image/Icon */}
                      <div className="aspect-video rounded-md bg-muted mb-3 flex items-center justify-center overflow-hidden">
                        {template.imagePath ? (
                          <img
                            src={`file://${template.imagePath}`}
                            alt={template.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Folder className="h-12 w-12 text-muted-foreground" />
                        )}
                      </div>

                      {/* Template Name */}
                      <h3 className="font-medium text-sm mb-1 truncate">{template.name}</h3>

                      {/* Template Path */}
                      <p className="text-xs text-muted-foreground truncate mb-3">
                        {template.folderPath}
                      </p>

                      {/* Create Button */}
                      <Button
                        size="sm"
                        className="w-full gap-1"
                        onClick={() => handleOpenCreateFromTemplate(template)}
                      >
                        <Plus className="h-3 w-3" />
                        Create
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Clone Repository Dialog */}
    <Dialog open={showCloneDialog} onOpenChange={setShowCloneDialog}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Clone Repository</DialogTitle>
          <DialogDescription>
            Enter the Git repository URL to clone
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="clone-url">Repository URL</Label>
            <Input
              id="clone-url"
              placeholder="https://github.com/username/repo.git"
              value={cloneUrl}
              onChange={(e) => {
                setCloneUrl(e.target.value);
                setCloneError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isCloning) {
                  handleCloneRepo();
                }
              }}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Supports HTTPS and SSH URLs
            </p>
          </div>

          {cloneError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {cloneError}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowCloneDialog(false);
              setCloneUrl('');
              setCloneError('');
            }}
            disabled={isCloning}
          >
            Cancel
          </Button>
          <Button onClick={handleCloneRepo} disabled={isCloning || !cloneUrl.trim()}>
            {isCloning ? 'Cloning...' : 'Clone'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Create from Template Dialog */}
    <Dialog open={showCreateFromTemplateDialog} onOpenChange={setShowCreateFromTemplateDialog}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Create Project from Template</DialogTitle>
          <DialogDescription>
            {selectedTemplate ? `Using template: ${selectedTemplate.name}` : 'Enter a name for your new project'}
            {templateParameters && templateParameters.parameters.length > 0 && (
              <> • {templateParameters.parameters.length} configurable parameter{templateParameters.parameters.length === 1 ? '' : 's'}</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-4 py-4">
            {/* Project Name */}
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                placeholder="my-awesome-project"
                value={projectName}
                onChange={(e) => {
                  setProjectName(e.target.value);
                  setCreateTemplateError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isCreatingFromTemplate && projectName.trim()) {
                    handleCreateFromTemplateSubmit();
                  }
                }}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Project will be created in your default projects folder
              </p>
            </div>

            {/* Template Parameters */}
            {templateParameters && templateParameters.parameters.length > 0 && (() => {
              // Group secret parameters by group name
              const secretParamsByGroup = new Map<string, typeof templateParameters.parameters>();
              const nonSecretParams = templateParameters.parameters.filter(p => p.type !== 'secret');

              templateParameters.parameters.forEach(param => {
                if (param.type === 'secret' && param.group) {
                  if (!secretParamsByGroup.has(param.group)) {
                    secretParamsByGroup.set(param.group, []);
                  }
                  secretParamsByGroup.get(param.group)!.push(param);
                }
              });

              return (
                <>
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Settings2 className="h-4 w-4" />
                      Template Configuration
                    </h3>
                    <div className="space-y-4">
                      {/* Non-secret parameters */}
                      {nonSecretParams.map((param) => (
                        <div key={param.key} className="space-y-2">
                          <Label htmlFor={param.key}>{param.title}</Label>

                          {param.type === 'text' && (
                            <Input
                              id={param.key}
                              value={parameterValues[param.key] || ''}
                              onChange={(e) =>
                                setParameterValues((prev) => ({
                                  ...prev,
                                  [param.key]: e.target.value
                                }))
                              }
                              placeholder={param.default || ''}
                            />
                          )}

                          {param.type === 'dropdown' && param.options && (
                            <Select
                              value={parameterValues[param.key] || param.default || ''}
                              onValueChange={(value) =>
                                setParameterValues((prev) => ({
                                  ...prev,
                                  [param.key]: value
                                }))
                              }
                            >
                              <SelectTrigger id={param.key}>
                                <SelectValue placeholder="Select an option" />
                              </SelectTrigger>
                              <SelectContent>
                                {param.options.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}

                          <p className="text-xs text-muted-foreground">
                            Used in: {param.filePath.split('/').pop()}
                          </p>
                        </div>
                      ))}

                      {/* Secret parameters - grouped by group */}
                      {Array.from(secretParamsByGroup.entries()).map(([groupName, params]) => {
                        const group = secretGroups.find(g => g.title === groupName);
                        const accounts = group?.accounts || [];
                        const firstParamKey = params[0]?.key || groupName;

                        return (
                          <div key={groupName} className="space-y-2">
                            <Label htmlFor={`secret-${groupName}`}>{groupName} Account</Label>
                            <Select
                              value={selectedSecretAccounts[firstParamKey] || ''}
                              onValueChange={(value) => {
                                // Set the same account for all parameters in this group
                                const updates: Record<string, string> = {};
                                params.forEach(p => {
                                  updates[p.key] = value;
                                });
                                setSelectedSecretAccounts((prev) => ({
                                  ...prev,
                                  ...updates
                                }));
                              }}
                            >
                              <SelectTrigger id={`secret-${groupName}`}>
                                <SelectValue placeholder={
                                  accounts.length === 0
                                    ? `No accounts in ${groupName} group`
                                    : 'Select an account'
                                } />
                              </SelectTrigger>
                              <SelectContent>
                                {accounts.map((account) => (
                                  <SelectItem key={account.id} value={account.id}>
                                    {account.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="text-xs text-muted-foreground space-y-1">
                              <p>Keys: {params.map(p => p.secretKey).join(', ')}</p>
                              <p>Used in: {[...new Set(params.map(p => p.filePath.split('/').pop()))].join(', ')}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              );
            })()}

            {createTemplateError && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                {createTemplateError}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button
            variant="outline"
            onClick={() => {
              setShowCreateFromTemplateDialog(false);
              setSelectedTemplate(null);
              setProjectName('');
              setTemplateParameters(null);
              setParameterValues({});
              setSelectedSecretAccounts({});
              setCreateTemplateError('');
            }}
            disabled={isCreatingFromTemplate}
          >
            Cancel
          </Button>
          <Button onClick={handleCreateFromTemplateSubmit} disabled={isCreatingFromTemplate || !projectName.trim()}>
            {isCreatingFromTemplate ? 'Creating...' : 'Create Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
