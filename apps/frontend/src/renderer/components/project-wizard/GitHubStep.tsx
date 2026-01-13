import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Github, CheckCircle2, ChevronRight, Sparkles, Plus, Link, Loader2, User, Building, GitBranch } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { GitHubOAuthFlow } from '../project-settings/GitHubOAuthFlow';
import { ClaudeOAuthFlow } from '../project-settings/ClaudeOAuthFlow';
import type { Project } from '../../../shared/types';

interface GitHubStepProps {
  project: Project | null;
  onComplete: (data: { token: string; repo: string; branch: string }) => void;
  onSkip: () => void;
  onBack: () => void;
}

type SetupStep = 'github-auth' | 'claude-auth' | 'repo-confirm' | 'repo' | 'branch' | 'complete';

/**
 * GitHub integration step
 */
export function GitHubStep({ project, onComplete, onSkip, onBack }: GitHubStepProps) {
  const { t } = useTranslation('project-wizard');
  const [step, setStep] = useState<SetupStep>('github-auth');
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [githubRepo, setGithubRepo] = useState<string | null>(null);
  const [detectedRepo, setDetectedRepo] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [recommendedBranch, setRecommendedBranch] = useState<string | null>(null);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Repo setup state
  const [repoAction, setRepoAction] = useState<'create' | 'link' | null>(null);
  const [newRepoName, setNewRepoName] = useState('');
  const [isPrivateRepo, setIsPrivateRepo] = useState(true);
  const [existingRepoName, setExistingRepoName] = useState('');
  const [isCreatingRepo, setIsCreatingRepo] = useState(false);

  // Organization selection state
  const [githubUsername, setGithubUsername] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Array<{ login: string }>>([]);
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);

  // Reset state when step becomes active
  useEffect(() => {
    if (project) {
      setNewRepoName(project.name.replace(/[^A-Za-z0-9_.-]/g, '-'));
    }
  }, [project]);

  // Check existing auth and skip to appropriate step
  useEffect(() => {
    const checkExistingAuth = async () => {
      try {
        const ghTokenResult = await window.electronAPI.getGitHubToken();
        const hasGitHubAuth = ghTokenResult.success && ghTokenResult.data?.token;

        const profilesResult = await window.electronAPI.getClaudeProfiles();
        let hasClaudeAuth = false;
        if (profilesResult.success && profilesResult.data) {
          const activeProfile = profilesResult.data.profiles.find(
            (p) => p.id === profilesResult.data!.activeProfileId
          );
          hasClaudeAuth = !!(activeProfile?.oauthToken || (activeProfile?.isDefault && activeProfile?.configDir));
        }

        if (hasGitHubAuth && hasClaudeAuth) {
          setGithubToken(ghTokenResult.data!.token);
          await detectRepository();
        } else if (hasGitHubAuth) {
          setGithubToken(ghTokenResult.data!.token);
          setStep('claude-auth');
        }
      } catch {
        setStep('github-auth');
      }
    };

    checkExistingAuth();
  }, []);

  // Load user info and organizations
  const loadUserAndOrgs = async () => {
    setIsLoadingOrgs(true);
    try {
      const userResult = await window.electronAPI.getGitHubUser();
      if (userResult.success && userResult.data) {
        setGithubUsername(userResult.data.username);
        setSelectedOwner(userResult.data.username);
      }

      const orgsResult = await window.electronAPI.listGitHubOrgs();
      if (orgsResult.success && orgsResult.data) {
        setOrganizations(orgsResult.data.orgs);
      }
    } catch {
      // Ignore errors
    } finally {
      setIsLoadingOrgs(false);
    }
  };

  // Detect repository from git remote
  const detectRepository = async () => {
    if (!project) return;

    setError(null);

    try {
      const result = await window.electronAPI.detectGitHubRepo(project.path);
      if (result.success && result.data) {
        setDetectedRepo(result.data);
        setGithubRepo(result.data);
        setStep('repo-confirm');
      } else {
        await loadUserAndOrgs();
        setStep('repo');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to detect repository');
      await loadUserAndOrgs();
      setStep('repo');
    }
  };

  // Load branches from GitHub
  const loadBranches = async (repo: string) => {
    if (!githubToken) {
      setError('GitHub token is not available.');
      return;
    }

    setIsLoadingBranches(true);
    setError(null);

    try {
      const result = await window.electronAPI.getGitHubBranches(repo, githubToken);
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

  // Handlers
  const handleGitHubAuthSuccess = async (token: string) => {
    setGithubToken(token);

    // Check Claude auth
    try {
      const profilesResult = await window.electronAPI.getClaudeProfiles();
      if (profilesResult.success && profilesResult.data) {
        const activeProfile = profilesResult.data.profiles.find(
          (p) => p.id === profilesResult.data!.activeProfileId
        );
        if (activeProfile?.oauthToken || (activeProfile?.isDefault && activeProfile?.configDir)) {
          await detectRepository();
          return;
        }
      }
    } catch {
      // Fall through
    }

    setStep('claude-auth');
  };

  const handleClaudeAuthSuccess = async () => {
    await detectRepository();
  };

  const handleConfirmRepo = async () => {
    if (detectedRepo) {
      setStep('branch');
      await loadBranches(detectedRepo);
    }
  };

  const handleChangeRepo = async () => {
    await loadUserAndOrgs();
    setStep('repo');
  };

  const handleCreateRepo = async () => {
    if (!newRepoName.trim() || !selectedOwner || !project) {
      setError('Please enter a repository name');
      return;
    }

    setIsCreatingRepo(true);
    setError(null);

    try {
      const result = await window.electronAPI.createGitHubRepo(newRepoName.trim(), {
        isPrivate: isPrivateRepo,
        projectPath: project.path,
        owner: selectedOwner !== githubUsername ? selectedOwner : undefined
      });

      if (result.success && result.data) {
        setGithubRepo(result.data.fullName);
        setDetectedRepo(result.data.fullName);
        setStep('branch');
        await loadBranches(result.data.fullName);
      } else {
        setError(result.error || 'Failed to create repository');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create repository');
    } finally {
      setIsCreatingRepo(false);
    }
  };

  const handleLinkRepo = async () => {
    if (!existingRepoName.trim() || !project) {
      setError('Please enter a repository name');
      return;
    }

    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(existingRepoName.trim())) {
      setError('Invalid format. Use owner/repo (e.g., username/my-project)');
      return;
    }

    setIsCreatingRepo(true);
    setError(null);

    try {
      const result = await window.electronAPI.addGitRemote(project.path, existingRepoName.trim());

      if (result.success) {
        setGithubRepo(existingRepoName.trim());
        setDetectedRepo(existingRepoName.trim());
        setStep('branch');
        await loadBranches(existingRepoName.trim());
      } else {
        setError(result.error || 'Failed to add remote');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add remote');
    } finally {
      setIsCreatingRepo(false);
    }
  };

  const handleComplete = () => {
    if (githubToken && githubRepo && selectedBranch) {
      onComplete({
        token: githubToken,
        repo: githubRepo,
        branch: selectedBranch
      });
    }
  };

  // Progress indicator
  const renderProgress = () => {
    const steps: { label: string }[] = [
      { label: t('github.progressAuthenticate') },
      { label: t('github.progressConfigure') },
    ];

    // Don't show progress on complete step
    if (step === 'complete') return null;

    // Map steps to progress indices
    // Auth steps (github-auth, claude-auth, repo) = 0
    // Config steps (branch) = 1
    const currentIndex =
      step === 'github-auth' ? 0 :
      step === 'claude-auth' ? 0 :
      step === 'repo-confirm' ? 0 :
      step === 'repo' ? 0 :
      1;

    return (
      <div className="flex items-center justify-center gap-2 mb-4">
        {steps.map((s, index) => (
          <div key={index} className="flex items-center">
            <div
              className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                index < currentIndex
                  ? 'bg-success text-success-foreground'
                  : index === currentIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {index < currentIndex ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                index + 1
              )}
            </div>
            <span
              className={`ml-2 text-xs ${
                index === currentIndex ? 'text-foreground font-medium' : 'text-muted-foreground'
              }`}
            >
              {s.label}
            </span>
            {index < steps.length - 1 && (
              <ChevronRight className="h-4 w-4 mx-2 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>
    );
  };

  // Render step content
  const renderStepContent = () => {
    switch (step) {
      case 'github-auth':
        return (
          <>
            <div className="flex h-full flex-col items-center justify-center px-8 py-6">
              <div className="w-full max-w-lg text-center">
                <div className="flex justify-center mb-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                    <Github className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  {t('github.connectTitle')}
                </h2>
                <p className="text-muted-foreground mb-8">
                  {t('github.description')}
                </p>
                <p className="text-sm text-muted-foreground mb-8">
                  {t('github.optionalLabel')}
                </p>

                <GitHubOAuthFlow
                  onSuccess={handleGitHubAuthSuccess}
                  onCancel={onSkip}
                />
              </div>
            </div>

            <div className="flex justify-start px-8 pb-6">
              <Button variant="outline" onClick={onBack}>
                {t('project.back')}
              </Button>
            </div>
          </>
        );

      case 'claude-auth':
        return (
          <>
            <div className="flex h-full flex-col items-center justify-center px-8 py-6">
              <div className="w-full max-w-lg text-center">
                <div className="flex justify-center mb-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  Connect to Claude AI
                </h2>
                <p className="text-muted-foreground mb-8">
                  Auto Claude uses Claude AI for intelligent features
                </p>

                <ClaudeOAuthFlow
                  onSuccess={handleClaudeAuthSuccess}
                  onCancel={onSkip}
                />
              </div>
            </div>

            <div className="flex justify-start px-8 pb-6">
              <Button variant="outline" onClick={onBack}>
                {t('project.back')}
              </Button>
            </div>
          </>
        );

      case 'repo-confirm':
        return (
          <>
            <div className="flex h-full flex-col items-center justify-center px-8 py-6">
              <div className="w-full max-w-lg">
                <div className="text-center mb-8">
                  <div className="flex justify-center mb-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10">
                      <CheckCircle2 className="h-8 w-8 text-success" />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    Repository Detected
                  </h2>
                  <p className="text-muted-foreground">
                    {t('github.repoDescription')}
                  </p>
                </div>

                <div className="rounded-lg bg-muted/50 border border-border p-5 mb-6">
                  <p className="font-mono text-sm text-center">
                    {detectedRepo}
                  </p>
                </div>

                {error && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive mb-6" role="alert">
                    {error}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between px-8 pb-6">
              <Button variant="outline" onClick={handleChangeRepo}>
                Use Different Repository
              </Button>
              <Button onClick={handleConfirmRepo}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Confirm & Continue
              </Button>
            </div>
          </>
        );

      case 'repo':
        return (
          <>
            <div className="flex h-full flex-col items-center justify-center px-8 py-6">
              <div className="w-full max-w-2xl">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    {t('github.selectProject')}
                  </h2>
                  <p className="text-muted-foreground">
                    {t('github.repoDescription')}
                  </p>
                </div>

                {!repoAction ? (
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <button
                      onClick={() => setRepoAction('create')}
                      className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dashed hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      <Plus className="h-10 w-10 text-muted-foreground" />
                      <span className="font-medium">{t('github.createNewRepo')}</span>
                      <span className="text-xs text-muted-foreground text-center">
                        Create a new repository on GitHub
                      </span>
                    </button>
                    <button
                      onClick={() => setRepoAction('link')}
                      className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dashed hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      <Link className="h-10 w-10 text-muted-foreground" />
                      <span className="font-medium">{t('github.linkExistingRepo')}</span>
                      <span className="text-xs text-muted-foreground text-center">
                        Connect to an existing repository
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <button
                      onClick={() => setRepoAction(null)}
                      className="text-sm text-primary hover:underline"
                    >
                      ← Back
                    </button>

                    {repoAction === 'create' && (
                      <>
                        {/* Owner selection */}
                        <div className="space-y-2">
                          <Label>Owner</Label>
                          {isLoadingOrgs ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading accounts...
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {githubUsername && (
                                <button
                                  onClick={() => setSelectedOwner(githubUsername)}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-md border ${
                                    selectedOwner === githubUsername
                                      ? 'border-primary bg-primary/10 text-primary'
                                      : 'border-muted hover:border-primary/50'
                                  }`}
                                  disabled={isCreatingRepo}
                                >
                                  <User className="h-4 w-4" />
                                  <span className="text-sm">{githubUsername}</span>
                                </button>
                              )}
                              {organizations.map((org) => (
                                <button
                                  key={org.login}
                                  onClick={() => setSelectedOwner(org.login)}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-md border ${
                                    selectedOwner === org.login
                                      ? 'border-primary bg-primary/10 text-primary'
                                      : 'border-muted hover:border-primary/50'
                                  }`}
                                  disabled={isCreatingRepo}
                                >
                                  <Building className="h-4 w-4" />
                                  <span className="text-sm">{org.login}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label>Repository Name</Label>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                              {selectedOwner || '...'} /
                            </span>
                            <Input
                              value={newRepoName}
                              onChange={(e) => setNewRepoName(e.target.value)}
                              placeholder="my-project"
                              disabled={isCreatingRepo}
                              className="flex-1"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="private-repo"
                            checked={isPrivateRepo}
                            onChange={(e) => setIsPrivateRepo(e.target.checked)}
                            className="h-4 w-4 rounded border-border bg-background"
                          />
                          <Label htmlFor="private-repo" className="text-sm font-normal cursor-pointer">
                            Private repository
                          </Label>
                        </div>
                      </>
                    )}

                    {repoAction === 'link' && (
                      <div className="space-y-2">
                        <Label>Repository (owner/repo)</Label>
                        <Input
                          value={existingRepoName}
                          onChange={(e) => setExistingRepoName(e.target.value)}
                          placeholder="username/my-project"
                          disabled={isCreatingRepo}
                        />
                        <p className="text-xs text-muted-foreground">
                          Format: owner/repo (e.g., facebook/react)
                        </p>
                      </div>
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
              <Button variant="outline" onClick={onBack} disabled={isCreatingRepo}>
                {t('project.back')}
              </Button>
              {repoAction && (
                <Button
                  onClick={repoAction === 'create' ? handleCreateRepo : handleLinkRepo}
                  disabled={isCreatingRepo}
                >
                  {isCreatingRepo ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      {repoAction === 'create' ? 'Create Repository' : 'Link Repository'}
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </>
                  )}
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
                    {t('github.selectBranch')}
                  </h2>
                  <p className="text-muted-foreground">
                    {t('github.branchDescription')}
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
                        <div className="flex items-center gap-3">
                          <GitBranch className="h-4 w-4" />
                          <span className="font-mono text-sm">{branch}</span>
                        </div>
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
                {t('github.continue')}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {renderProgress()}
      {renderStepContent()}
    </>
  );
}
