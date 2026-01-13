import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Loader2, Server, ExternalLink, Plus, Link, User, Building } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import type { Project } from '../../../shared/types';

interface GitLabProject {
  pathWithNamespace: string;
  description: string | null;
  visibility: string;
}

interface GitLabStepProps {
  project: Project | null;
  onComplete: (data: { token: string; project: string; branch: string }) => void;
  onSkip: () => void;
  onBack: () => void;
}

type SetupStep = 'auth' | 'project' | 'branch' | 'complete';

/**
 * GitLab integration step - NEW component for GitLab support
 */
export function GitLabStep({ project, onComplete, onSkip, onBack }: GitLabStepProps) {
  const { t } = useTranslation('project-wizard');
  const [step, setStep] = useState<SetupStep>('auth');
  const [gitlabToken, setGitlabToken] = useState<string | null>(null);
  const [oauthUsername, setOauthUsername] = useState<string | null>(null);
  const [gitlabProject, setGitlabProject] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [recommendedBranch, setRecommendedBranch] = useState<string | null>(null);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Project selection state
  const [projectAction, setProjectAction] = useState<'select' | 'create' | 'link' | null>(null);
  const [projects, setProjects] = useState<GitLabProject[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectVisibility, setProjectVisibility] = useState<'private' | 'public'>('private');
  const [existingProjectName, setExistingProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Namespace selection state
  const [namespaces, setNamespaces] = useState<Array<{ id: number; name: string; path: string }>>([]);
  const [selectedNamespace, setSelectedNamespace] = useState<number | null>(null);
  const [isLoadingNamespaces, setIsLoadingNamespaces] = useState(false);

  // GitLab CLI detection state
  const [glabInstalled, setGlabInstalled] = useState<boolean | null>(null);
  const [isCheckingGlab, setIsCheckingGlab] = useState(false);

  // Self-hosted GitLab instance state
  const [instanceUrl, setInstanceUrl] = useState<string>('');

  // Reset project name when project changes
  useEffect(() => {
    if (project) {
      setNewProjectName(project.name.replace(/[^A-Za-z0-9_.-]/g, '-'));
    }
  }, [project]);

  // Check for glab CLI on mount
  useEffect(() => {
    const checkGlab = async () => {
      setIsCheckingGlab(true);
      try {
        const result = await window.electronAPI.checkGitLabCli();
        if (result.success && result.data) {
          setGlabInstalled(result.data.installed);
        } else {
          setGlabInstalled(false);
        }
      } catch {
        setGlabInstalled(false);
      } finally {
        setIsCheckingGlab(false);
      }
    };
    checkGlab();
  }, []);

  // Load namespaces and projects after OAuth success
  useEffect(() => {
    if (step === 'project' && gitlabToken) {
      loadNamespaces();
      loadUserProjects();
    }
  }, [step, gitlabToken]);

  // Load branches when project is selected
  useEffect(() => {
    if (step === 'branch' && gitlabProject && project) {
      loadBranches();
    }
  }, [step, gitlabProject, project]);

  const loadNamespaces = async () => {
    setIsLoadingNamespaces(true);
    try {
      const result = await window.electronAPI.listGitLabGroups();
      if (result.success && result.data?.groups) {
        setNamespaces(result.data.groups);
        // Default to first namespace
        if (result.data.groups.length > 0) {
          setSelectedNamespace(result.data.groups[0].id);
        }
      }
    } catch {
      // Ignore errors
    } finally {
      setIsLoadingNamespaces(false);
    }
  };

  const loadUserProjects = async () => {
    setIsLoadingProjects(true);
    setError(null);

    try {
      const result = await window.electronAPI.listGitLabUserProjects();
      if (result.success && result.data?.projects) {
        setProjects(result.data.projects);
      } else {
        setError(result.error || 'Failed to load projects');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const loadBranches = async () => {
    if (!gitlabProject) return;

    setIsLoadingBranches(true);
    setError(null);

    try {
      // Use GitLab API to fetch remote branches, not local git
      const result = await window.electronAPI.getGitLabBranches(
        gitlabProject,
        instanceUrl.trim()
      );
      if (result.success && result.data) {
        setBranches(result.data);

        // Detect recommended branch
        const priorities = ['main', 'master', 'develop', 'dev'];
        let recommended: string | null = null;
        for (const priority of priorities) {
          if (result.data.includes(priority)) {
            recommended = priority;
            break;
          }
        }
        if (!recommended) {
          recommended = result.data[0] || null;
        }
        setRecommendedBranch(recommended);
        setSelectedBranch(recommended);
      } else {
        setError(result.error || 'Failed to load branches');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load branches');
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const handleOAuthAuth = async () => {
    setIsAuthenticating(true);
    setError(null);

    try {
      // Step 1: Start device authorization flow
      const authResult = await window.electronAPI.startGitLabAuth(
        instanceUrl.trim() || undefined
      );
      if (!authResult.success || !authResult.data) {
        setError(authResult.error || 'Failed to start GitLab authorization');
        return;
      }

      const authData = authResult.data as unknown as { deviceCode: string; verificationUrl: string; userCode: string };

      // Step 2: Poll for the actual access token after user authorizes
      // In production, this should poll with delays. For now, try once.
      const MAX_POLL_ATTEMPTS = 10;
      const POLL_DELAY = 2000; // 2 seconds

      for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        await new Promise(resolve => setTimeout(resolve, POLL_DELAY));

        const tokenResult = await window.electronAPI.getGitLabToken();
        if (tokenResult.success && tokenResult.data?.token) {
          setGitlabToken(tokenResult.data.token);

          // Get username
          const userResult = await window.electronAPI.getGitLabUser();
          if (userResult.success && userResult.data) {
            setOauthUsername((userResult.data as any).username || authData.userCode);
          }

          setStep('project');
          return;
        }
      }

      setError('Authorization timed out. Please try again or use manual token.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to authenticate with GitLab');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleManualToken = () => {
    // For manual token, user enters token in settings
    // For now, skip to completion and let user configure later
    onComplete({ token: 'manual', project: 'manual', branch: 'main' });
  };

  const handleSelectProject = (projectPath: string) => {
    setGitlabProject(projectPath);
    setStep('branch');
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !selectedNamespace || !project) {
      setError('Please enter a project name');
      return;
    }

    setIsCreatingProject(true);
    setError(null);

    try {
      const namespace = namespaces.find(n => n.id === selectedNamespace);
      if (!namespace) {
        setError('Please select a namespace');
        return;
      }

      const result = await window.electronAPI.createGitLabProject(
        newProjectName.trim(),
        {
          visibility: projectVisibility,
          projectPath: project.path,
          namespace: namespace.path
        } as any
      );

      if (result.success && result.data) {
        setGitlabProject(result.data.pathWithNamespace);
        setStep('branch');
      } else {
        setError(result.error || 'Failed to create project');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleLinkProject = async () => {
    if (!existingProjectName.trim() || !project) {
      setError('Please enter a project path');
      return;
    }

    setIsCreatingProject(true);
    setError(null);

    try {
      // Validate format: namespace/project
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(existingProjectName.trim())) {
        setError('Invalid format. Use namespace/project (e.g., username/my-project)');
        setIsCreatingProject(false);
        return;
      }

      const result = await window.electronAPI.addGitLabRemote(project.path, existingProjectName.trim());

      if (result.success) {
        setGitlabProject(existingProjectName.trim());
        setStep('branch');
      } else {
        setError(result.error || 'Failed to link project');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link project');
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleComplete = () => {
    if (gitlabToken && gitlabProject && selectedBranch) {
      onComplete({
        token: gitlabToken,
        project: gitlabProject,
        branch: selectedBranch
      });
    }
  };

  // Render step content
  const renderStepContent = () => {
    switch (step) {
      case 'auth':
        return (
          <>
            <div className="flex h-full flex-col items-center justify-center px-8 py-6">
              <div className="w-full max-w-lg text-center">
                <div className="flex justify-center mb-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                    <Server className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  {t('gitlab.connectTitle')}
                </h2>
                <p className="text-muted-foreground mb-8">
                  {t('gitlab.description')}
                </p>
                <p className="text-sm text-muted-foreground mb-8">
                  {t('gitlab.optionalLabel')}
                </p>

                {isCheckingGlab ? (
                  <div className="flex items-center justify-center gap-2 py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Checking GitLab CLI...</span>
                  </div>
                ) : !glabInstalled ? (
                  <div className="rounded-lg bg-warning/10 border border-warning/30 p-4 mb-6">
                    <p className="text-sm text-warning mb-2">
                      GitLab CLI (glab) is required for OAuth authentication
                    </p>
                    <a
                      href="https://gitlab.com/gitlab-org/cli"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center justify-center gap-1"
                    >
                      Install glab CLI
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ) : null}

                {error && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive mb-6" role="alert">
                    {error}
                  </div>
                )}

                {/* Self-hosted GitLab instance URL input */}
                {glabInstalled && (
                  <div className="mb-6 text-left">
                    <Label htmlFor="instance-url" className="text-sm text-foreground mb-2 block">
                      GitLab Instance URL (optional)
                    </Label>
                    <Input
                      id="instance-url"
                      type="url"
                      placeholder="https://gitlab.com"
                      value={instanceUrl}
                      onChange={(e) => setInstanceUrl(e.target.value)}
                      disabled={isAuthenticating}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Leave blank for gitlab.com. Enter your self-hosted GitLab instance URL (e.g., https://gitlab.example.com)
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  {glabInstalled && (
                    <Button
                      onClick={handleOAuthAuth}
                      disabled={isAuthenticating}
                      className="w-full"
                    >
                      {isAuthenticating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Authenticating...
                        </>
                      ) : (
                        <>Authenticate with GitLab</>
                      )}
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    onClick={handleManualToken}
                    className="w-full"
                  >
                    Use Manual Token (in Settings)
                  </Button>

                  <Button
                    variant="ghost"
                    onClick={onSkip}
                    className="w-full text-muted-foreground"
                  >
                    {t('gitlab.skip')}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex justify-start px-8 pb-6">
              <Button variant="outline" onClick={onBack}>
                {t('project.back')}
              </Button>
            </div>
          </>
        );

      case 'project':
        return (
          <>
            <div className="flex h-full flex-col items-center justify-center px-8 py-6">
              <div className="w-full max-w-2xl">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    {t('gitlab.selectProject')}
                  </h2>
                  <p className="text-muted-foreground">
                    {t('gitlab.repoDescription')}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Connected as: <span className="font-medium">{oauthUsername}</span>
                  </p>
                </div>

                {!projectAction ? (
                  <>
                    {isLoadingProjects ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : projects.length > 0 ? (
                      <div className="max-h-80 overflow-y-auto space-y-2 mb-6">
                        {projects.map((proj) => (
                          <button
                            key={proj.pathWithNamespace}
                            onClick={() => handleSelectProject(proj.pathWithNamespace)}
                            className="w-full flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent transition-colors text-left"
                          >
                            <div>
                              <p className="font-medium text-foreground">{proj.pathWithNamespace}</p>
                              {proj.description && (
                                <p className="text-sm text-muted-foreground mt-1">{proj.description}</p>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No projects found. Create a new one or link an existing project.
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setProjectAction('create')}
                        className="flex flex-col items-center gap-2 p-4 rounded-lg border border-dashed hover:border-primary hover:bg-primary/5 transition-colors"
                      >
                        <Plus className="h-8 w-8 text-muted-foreground" />
                        <span className="text-sm font-medium">{t('gitlab.createNewProject')}</span>
                      </button>
                      <button
                        onClick={() => setProjectAction('link')}
                        className="flex flex-col items-center gap-2 p-4 rounded-lg border border-dashed hover:border-primary hover:bg-primary/5 transition-colors"
                      >
                        <Link className="h-8 w-8 text-muted-foreground" />
                        <span className="text-sm font-medium">{t('gitlab.linkExistingProject')}</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <button
                      onClick={() => setProjectAction(null)}
                      className="text-sm text-primary hover:underline"
                    >
                      ← Back to project list
                    </button>

                    {projectAction === 'create' && (
                      <>
                        {/* Namespace selection */}
                        <div className="space-y-2">
                          <Label>Namespace</Label>
                          {isLoadingNamespaces ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading namespaces...
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {namespaces.map((ns) => (
                                <button
                                  key={ns.id}
                                  onClick={() => setSelectedNamespace(ns.id)}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-md border ${
                                    selectedNamespace === ns.id
                                      ? 'border-primary bg-primary/10 text-primary'
                                      : 'border-muted hover:border-primary/50'
                                  }`}
                                  disabled={isCreatingProject}
                                >
                                  <Building className="h-4 w-4" />
                                  <span className="text-sm">{ns.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label>Project Name</Label>
                          <Input
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            placeholder="my-project"
                            disabled={isCreatingProject}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Visibility</Label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setProjectVisibility('private')}
                              className={`flex-1 p-3 rounded-md border text-center ${
                                projectVisibility === 'private'
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-muted hover:border-primary/50'
                              }`}
                              disabled={isCreatingProject}
                            >
                              Private
                            </button>
                            <button
                              onClick={() => setProjectVisibility('public')}
                              className={`flex-1 p-3 rounded-md border text-center ${
                                projectVisibility === 'public'
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-muted hover:border-primary/50'
                              }`}
                              disabled={isCreatingProject}
                            >
                              Public
                            </button>
                          </div>
                        </div>

                        <Button
                          onClick={handleCreateProject}
                          disabled={isCreatingProject}
                          className="w-full"
                        >
                          {isCreatingProject ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            <>Create Project</>
                          )}
                        </Button>
                      </>
                    )}

                    {projectAction === 'link' && (
                      <>
                        <div className="space-y-2">
                          <Label>Project Path (namespace/project)</Label>
                          <Input
                            value={existingProjectName}
                            onChange={(e) => setExistingProjectName(e.target.value)}
                            placeholder="username/my-project"
                            disabled={isCreatingProject}
                          />
                          <p className="text-xs text-muted-foreground">
                            Format: namespace/project (e.g., gitlab-org/gitlab)
                          </p>
                        </div>

                        <Button
                          onClick={handleLinkProject}
                          disabled={isCreatingProject}
                          className="w-full"
                        >
                          {isCreatingProject ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Linking...
                            </>
                          ) : (
                            <>Link Project</>
                          )}
                        </Button>
                      </>
                    )}

                    {error && (
                      <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                        {error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between px-8 pb-6">
              <Button variant="outline" onClick={onBack} disabled={isCreatingProject}>
                {t('project.back')}
              </Button>
              {projectAction === null && projects.length > 0 && (
                <Button variant="outline" onClick={onSkip}>
                  {t('gitlab.skip')}
                </Button>
              )}
            </div>
          </>
        );

      case 'branch':
        return (
          <>
            <div className="flex h-full flex-col items-center justify-center px-8 py-6">
              <div className="w-full max-w-lg">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    {t('gitlab.selectBranch')}
                  </h2>
                  <p className="text-muted-foreground">
                    {t('gitlab.branchDescription')}
                  </p>
                </div>

                {isLoadingBranches ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {branches.map((branch) => (
                      <button
                        key={branch}
                        onClick={() => setSelectedBranch(branch)}
                        className={`w-full flex items-center justify-between p-4 rounded-lg border transition-colors ${
                          selectedBranch === branch
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:bg-accent'
                        }`}
                      >
                        <span className="font-mono text-sm">{branch}</span>
                        {branch === recommendedBranch && (
                          <span className="text-xs text-muted-foreground">(recommended)</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {error && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive mt-6" role="alert">
                    {error}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between px-8 pb-6">
              <Button variant="outline" onClick={onBack}>
                {t('project.back')}
              </Button>
              <Button onClick={handleComplete} disabled={!selectedBranch}>
                {t('gitlab.continue')}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return <>{renderStepContent()}</>;
}
