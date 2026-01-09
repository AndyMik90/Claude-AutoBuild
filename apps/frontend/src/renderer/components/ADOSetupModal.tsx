import { useState, useEffect } from 'react';
import {
  Cloud,
  Key,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Building2,
  FolderGit2,
  GitBranch,
} from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';
import type { Project } from '../../shared/types';

interface ADOSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  onComplete: (settings: {
    adoOrganization: string;
    adoProject: string;
    adoRepoName: string;
    adoPat: string;
    adoInstanceUrl: string;
  }) => void;
  onSkip?: () => void;
}

type SetupStep = 'credentials' | 'testing' | 'complete';

/**
 * Azure DevOps Setup Modal
 *
 * Allows users to configure their ADO connection with:
 * 1. Organization name
 * 2. Project name
 * 3. Repository name (optional, defaults to project)
 * 4. Personal Access Token (PAT)
 * 5. Instance URL (for on-prem, defaults to dev.azure.com)
 */
export function ADOSetupModal({
  open,
  onOpenChange,
  project,
  onComplete,
  onSkip,
}: ADOSetupModalProps) {
  const [step, setStep] = useState<SetupStep>('credentials');
  const [organization, setOrganization] = useState('');
  const [adoProject, setAdoProject] = useState('');
  const [repoName, setRepoName] = useState('');
  const [pat, setPat] = useState('');
  const [instanceUrl, setInstanceUrl] = useState('https://dev.azure.com');
  const [isOnPrem, setIsOnPrem] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep('credentials');
      setOrganization('');
      setAdoProject('');
      setRepoName('');
      setPat('');
      setInstanceUrl('https://dev.azure.com');
      setIsOnPrem(false);
      setError(null);
      setTestSuccess(false);
      setIsTesting(false);
    }
  }, [open]);

  // Test the connection
  const testConnection = async () => {
    if (!organization || !adoProject || !pat) {
      setError('Please fill in all required fields');
      return;
    }

    setIsTesting(true);
    setError(null);
    setStep('testing');

    try {
      // Call the ADO test connection IPC with credentials
      const result = await window.electronAPI.ado.testADOConnection({
        organization,
        project: adoProject,
        repoName: repoName || adoProject,
        pat,
        instanceUrl,
      });

      if (result.success) {
        setTestSuccess(true);
        setStep('complete');
      } else {
        setError(result.error || 'Failed to connect to Azure DevOps');
        setStep('credentials');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection test failed');
      setStep('credentials');
    } finally {
      setIsTesting(false);
    }
  };

  // Save and complete setup
  const handleComplete = () => {
    onComplete({
      adoOrganization: organization,
      adoProject: adoProject,
      adoRepoName: repoName || adoProject,
      adoPat: pat,
      adoInstanceUrl: instanceUrl,
    });
  };

  // Skip without saving (for testing the flow without real connection)
  const handleSaveWithoutTest = () => {
    if (!organization || !adoProject || !pat) {
      setError('Please fill in all required fields');
      return;
    }
    handleComplete();
  };

  const renderCredentialsStep = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Cloud className="h-5 w-5 text-blue-500" />
          Connect to Azure DevOps
        </DialogTitle>
        <DialogDescription>
          Configure your Azure DevOps connection to sync work items and pull requests.
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 space-y-4">
        {/* PAT Help Link */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800 p-3">
          <div className="flex items-start gap-2">
            <Key className="h-4 w-4 text-blue-600 mt-0.5" />
            <div className="text-xs">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                You'll need a Personal Access Token (PAT)
              </p>
              <p className="mt-1 text-blue-700 dark:text-blue-300">
                Create one at your ADO organization settings with{' '}
                <strong>Code (Read & Write)</strong> and{' '}
                <strong>Work Items (Read & Write)</strong> scopes.
              </p>
              <a
                href="https://dev.azure.com/_usersSettings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-blue-600 hover:underline"
              >
                Create PAT on Azure DevOps
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Organization */}
        <div className="space-y-2">
          <Label htmlFor="ado-org" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Organization *
          </Label>
          <Input
            id="ado-org"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="myorganization"
            disabled={isTesting}
          />
          <p className="text-xs text-muted-foreground">
            Your ADO organization name (from dev.azure.com/<strong>org-name</strong>)
          </p>
        </div>

        {/* Project */}
        <div className="space-y-2">
          <Label htmlFor="ado-project" className="flex items-center gap-2">
            <FolderGit2 className="h-4 w-4" />
            Project *
          </Label>
          <Input
            id="ado-project"
            value={adoProject}
            onChange={(e) => setAdoProject(e.target.value)}
            placeholder="MyProject"
            disabled={isTesting}
          />
        </div>

        {/* Repository (optional) */}
        <div className="space-y-2">
          <Label htmlFor="ado-repo" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Repository
            <span className="text-xs text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="ado-repo"
            value={repoName}
            onChange={(e) => setRepoName(e.target.value)}
            placeholder={adoProject || 'Same as project name'}
            disabled={isTesting}
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to use the project name as repo name
          </p>
        </div>

        {/* PAT */}
        <div className="space-y-2">
          <Label htmlFor="ado-pat" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Personal Access Token *
          </Label>
          <Input
            id="ado-pat"
            type="password"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder="Enter your PAT"
            disabled={isTesting}
          />
        </div>

        {/* On-prem toggle */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ado-onprem"
              checked={isOnPrem}
              onChange={(e) => {
                setIsOnPrem(e.target.checked);
                if (!e.target.checked) {
                  setInstanceUrl('https://dev.azure.com');
                } else {
                  setInstanceUrl('');
                }
              }}
              className="rounded border-gray-300"
              disabled={isTesting}
            />
            <Label htmlFor="ado-onprem" className="text-sm cursor-pointer">
              Using Azure DevOps Server (on-premises)
            </Label>
          </div>

          {isOnPrem && (
            <div className="ml-6 space-y-2">
              <Input
                value={instanceUrl}
                onChange={(e) => setInstanceUrl(e.target.value)}
                placeholder="https://devops.yourcompany.com"
                disabled={isTesting}
              />
              <p className="text-xs text-muted-foreground">
                Your on-premises Azure DevOps Server URL
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <DialogFooter className="flex-col sm:flex-row gap-2">
        {onSkip && (
          <Button variant="ghost" onClick={onSkip} disabled={isTesting}>
            Skip for now
          </Button>
        )}
        <Button
          variant="outline"
          onClick={handleSaveWithoutTest}
          disabled={isTesting || !organization || !adoProject || !pat}
        >
          Save Without Testing
        </Button>
        <Button
          onClick={testConnection}
          disabled={isTesting || !organization || !adoProject || !pat}
        >
          {isTesting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Test & Save
            </>
          )}
        </Button>
      </DialogFooter>
    </>
  );

  const renderTestingStep = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          Testing Connection
        </DialogTitle>
      </DialogHeader>

      <div className="py-8 flex flex-col items-center justify-center">
        <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mb-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Connecting to Azure DevOps...
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          {organization}/{adoProject}
        </p>
      </div>
    </>
  );

  const renderCompleteStep = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          Connection Successful
        </DialogTitle>
      </DialogHeader>

      <div className="py-8 flex flex-col items-center justify-center">
        <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-4">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Successfully connected to Azure DevOps!
        </p>
        <p className="text-xs text-muted-foreground mt-2 font-mono">
          {organization}/{adoProject}
        </p>
      </div>

      <DialogFooter>
        <Button onClick={handleComplete}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Complete Setup
        </Button>
      </DialogFooter>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === 'credentials' && renderCredentialsStep()}
        {step === 'testing' && renderTestingStep()}
        {step === 'complete' && renderCompleteStep()}
      </DialogContent>
    </Dialog>
  );
}
