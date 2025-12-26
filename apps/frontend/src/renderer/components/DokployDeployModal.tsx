import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  Server,
  Rocket,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Package,
  GitBranch,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Switch } from './ui/switch';
import { ScrollArea } from './ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select';
import { useSettingsStore } from '../stores/settings-store';
import { useProjectStore } from '../stores/project-store';
import { useContextStore, loadProjectContext, refreshProjectIndex } from '../stores/context-store';
import type {
  DokployServer,
  DokployGitHubProvider,
  ServiceInfo,
  DokployProjectDeployment,
  DokployServiceDeployment
} from '../../shared/types';

interface DokployDeployModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

type DeployStep = 'configure' | 'deploying' | 'success' | 'error' | 'resync';

// Service deployment configuration
interface ServiceDeployConfig {
  enabled: boolean;
  deployNow: boolean; // Whether to trigger deployment immediately after setup (vs just configure)
  linkMode: boolean; // Whether to link to existing app instead of creating new
  linkedProjectId?: string; // Selected Dokploy project when in link mode
  linkedApp?: { projectId: string; applicationId: string }; // Selected existing app when in link mode
  appName: string;
  branch: string;
  domain: string; // Optional custom domain
  envVars: Record<string, string>; // Environment variables from service .env file
  envVarsEnabled: Record<string, boolean>; // Which env vars are enabled for upload
}

export function DokployDeployModal({ open, onOpenChange, projectId }: DokployDeployModalProps) {
  const { t } = useTranslation('deploy');
  const settings = useSettingsStore((state) => state.settings);
  const projects = useProjectStore((state) => state.projects);
  const project = projects.find(p => p.id === projectId);
  const projectIndex = useContextStore((state) => state.projectIndex);
  const indexLoading = useContextStore((state) => state.indexLoading);

  const dokployAccounts = settings.deploymentProviders?.dokploy || [];

  // Get services from project index
  const services = useMemo(() => {
    if (!projectIndex?.services) return [];
    return Object.entries(projectIndex.services).map(([key, info]) => ({
      key,
      ...info
    }));
  }, [projectIndex]);

  // Form state
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [projectName, setProjectName] = useState('');
  const [selectedGitHubProviderId, setSelectedGitHubProviderId] = useState<string>('');

  // Auto-detected repository from project
  const [detectedRepo, setDetectedRepo] = useState<{ owner: string; name: string; fullName: string } | null>(null);
  const [repoDetectionError, setRepoDetectionError] = useState<string | null>(null);

  // Per-service configuration
  const [serviceConfigs, setServiceConfigs] = useState<Record<string, ServiceDeployConfig>>({});

  // Track which services have env vars expanded
  const [expandedEnvVars, setExpandedEnvVars] = useState<Record<string, boolean>>({});

  // Loading states
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [isLoadingGitHub, setIsLoadingGitHub] = useState(false);
  const [isLoadingRepo, setIsLoadingRepo] = useState(false);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);

  // Data from API
  const [servers, setServers] = useState<DokployServer[]>([]);
  const [gitHubProviders, setGitHubProviders] = useState<DokployGitHubProvider[]>([]);
  const [branches, setBranches] = useState<string[]>([]);

  // Deploy state
  const [step, setStep] = useState<DeployStep>('configure');
  const [error, setError] = useState<string | null>(null);
  const [deployedApps, setDeployedApps] = useState<string[]>([]);
  const [deployingService, setDeployingService] = useState<string | null>(null);

  // Existing deployment (for resync)
  const [existingDeployment, setExistingDeployment] = useState<DokployProjectDeployment | null>(null);
  const [isLoadingDeployment, setIsLoadingDeployment] = useState(false);
  const [resyncService, setResyncService] = useState<string | null>(null);
  const [customEnvKey, setCustomEnvKey] = useState('');
  const [customEnvValue, setCustomEnvValue] = useState('');

  // Link to existing deployment
  const [dokployProjects, setDokployProjects] = useState<Array<{
    projectId: string;
    name: string;
    applications: Array<{
      applicationId: string;
      name: string;
      appName: string;
      type: 'application' | 'compose' | 'mariadb' | 'mongo' | 'mysql' | 'postgres' | 'redis';
      environmentId: string;
      environmentName: string;
    }>;
  }>>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Parse GitHub repo string to extract owner and repo name
  const parseGitHubRepo = (repoString: string): { owner: string; name: string } | null => {
    // Handle various formats:
    // owner/repo (returned by detectGitHubRepo)
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    // https://github.com/owner/repo

    // First try simple owner/repo format
    const simpleMatch = repoString.match(/^([^/]+)\/([^/]+)$/);
    if (simpleMatch) {
      return { owner: simpleMatch[1], name: simpleMatch[2].replace(/\.git$/, '') };
    }

    // Try URL formats
    const httpsMatch = repoString.match(/github\.com\/([^/]+)\/([^/.]+)/);
    const sshMatch = repoString.match(/github\.com:([^/]+)\/([^/.]+)/);
    const match = httpsMatch || sshMatch;
    if (match) {
      return { owner: match[1], name: match[2].replace(/\.git$/, '') };
    }
    return null;
  };

  // Auto-detect repository from project
  const detectRepository = useCallback(async () => {
    if (!project?.path) return;

    setIsLoadingRepo(true);
    setRepoDetectionError(null);

    try {
      const result = await window.electronAPI.github.detectGitHubRepo(project.path);
      if (result.success && result.data) {
        const parsed = parseGitHubRepo(result.data);
        if (parsed) {
          setDetectedRepo({
            owner: parsed.owner,
            name: parsed.name,
            fullName: `${parsed.owner}/${parsed.name}`
          });
        } else {
          setRepoDetectionError('Could not parse GitHub repository URL');
        }
      } else {
        setRepoDetectionError('No GitHub remote found in project');
      }
    } catch (err) {
      setRepoDetectionError(err instanceof Error ? err.message : 'Failed to detect repository');
    } finally {
      setIsLoadingRepo(false);
    }
  }, [project?.path]);

  // Load project context and detect repo when modal opens
  useEffect(() => {
    if (open && projectId) {
      loadProjectContext(projectId);
    }
  }, [open, projectId]);

  // Load existing deployment info
  useEffect(() => {
    const loadExistingDeployment = async () => {
      if (open && project?.path) {
        setIsLoadingDeployment(true);
        try {
          const result = await window.electronAPI.dokployGetDeployment(project.path);
          if (result.success && result.data) {
            setExistingDeployment(result.data);
            // If deployment exists, auto-select that account and switch to resync mode
            setSelectedAccountId(result.data.accountId);
            setStep('resync');
          } else {
            setExistingDeployment(null);
          }
        } catch (err) {
          console.error('Failed to load deployment info:', err);
          setExistingDeployment(null);
        } finally {
          setIsLoadingDeployment(false);
        }
      }
    };
    loadExistingDeployment();
  }, [open, project?.path]);

  useEffect(() => {
    if (open && project) {
      detectRepository();
    }
  }, [open, project, detectRepository]);

  // Initialize form with project name and service configs
  useEffect(() => {
    if (open && project) {
      setProjectName(project.name);
      // Auto-select first account if only one
      if (dokployAccounts.length === 1) {
        setSelectedAccountId(dokployAccounts[0].id);
      }
    }
  }, [open, project, dokployAccounts]);

  // Get the default/main branch (prefer main, then master, then first available)
  const getDefaultBranch = useCallback((branchList: string[]): string => {
    if (branchList.includes('main')) return 'main';
    if (branchList.includes('master')) return 'master';
    return branchList[0] || '';
  }, []);

  // Get relative path from absolute path
  const getRelativePath = useCallback((absolutePath: string): string => {
    if (!project?.path) return absolutePath;
    if (absolutePath.startsWith(project.path)) {
      return absolutePath.slice(project.path.length).replace(/^\//, '') || '.';
    }
    return absolutePath;
  }, [project?.path]);

  // Initialize service configs when services change
  useEffect(() => {
    const initializeConfigs = async () => {
      if (services.length > 0 && Object.keys(serviceConfigs).length === 0) {
        const defaultBranch = getDefaultBranch(branches);
        const configs: Record<string, ServiceDeployConfig> = {};

        for (const service of services) {
          // Read env vars from service folder .env file only
          let envVars: Record<string, string> = {};

          // Debug: Log raw service data
          console.log(`[Dokploy] Service "${service.name}" raw path:`, service.path);
          console.log(`[Dokploy] Project path:`, project?.path);
          console.log(`[Dokploy] Service environment from context:`, service.environment);

          const servicePath = service.path.startsWith('/')
            ? service.path
            : `${project?.path}/${service.path}`;

          console.log(`[Dokploy] Full service path:`, servicePath);

          try {
            const result = await window.electronAPI.dokployReadEnv(servicePath);
            console.log(`[Dokploy] dokployReadEnv result:`, result);
            if (result.success && result.data) {
              envVars = result.data;
              console.log(`[Dokploy] Loaded env vars:`, Object.keys(envVars));
            } else {
              console.log(`[Dokploy] No env vars found or error:`, result.error);
            }
          } catch (err) {
            console.error(`[Dokploy] Exception reading .env:`, err);
          }

          console.log(`[Dokploy] Final env var count for ${service.name}:`, Object.keys(envVars).length);

          // Initialize all env vars as enabled by default
          const envVarsEnabled: Record<string, boolean> = {};
          Object.keys(envVars).forEach(key => {
            envVarsEnabled[key] = true;
          });

          // Use "app" as default name if only one service, otherwise use service name
          const defaultAppName = services.length === 1
            ? 'app'
            : service.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

          configs[service.key] = {
            enabled: true, // Enable all services by default
            deployNow: true, // Deploy immediately after setup by default
            linkMode: false, // Default to create new mode
            linkedProjectId: undefined,
            linkedApp: undefined,
            appName: defaultAppName,
            branch: defaultBranch,
            domain: '', // Optional, leave empty by default
            envVars,
            envVarsEnabled
          };
        }
        setServiceConfigs(configs);
      }
    };

    initializeConfigs();
  }, [services, branches, serviceConfigs, getDefaultBranch, project]);

  // Update service branches when branches are loaded
  useEffect(() => {
    if (branches.length > 0 && Object.keys(serviceConfigs).length > 0) {
      const defaultBranch = getDefaultBranch(branches);
      setServiceConfigs(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(key => {
          // Set branch if empty or if current branch doesn't exist in branch list
          if (!updated[key].branch || !branches.includes(updated[key].branch)) {
            updated[key] = { ...updated[key], branch: defaultBranch };
          }
        });
        return updated;
      });
    }
  }, [branches, getDefaultBranch]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep('configure');
      setError(null);
      setDeployedApps([]);
      setDeployingService(null);
      setServers([]);
      setGitHubProviders([]);
      setBranches([]);
      setSelectedServerId('');
      setSelectedGitHubProviderId('');
      setDetectedRepo(null);
      setRepoDetectionError(null);
      setServiceConfigs({});
      setExpandedEnvVars({});
      setExistingDeployment(null);
      setResyncService(null);
      setCustomEnvKey('');
      setCustomEnvValue('');
      setDokployProjects([]);
    }
  }, [open]);

  // Toggle env vars expansion for a service
  const toggleEnvVars = (serviceKey: string) => {
    setExpandedEnvVars(prev => ({
      ...prev,
      [serviceKey]: !prev[serviceKey]
    }));
  };

  // Helper to update a single service config
  const updateServiceConfig = (serviceKey: string, updates: Partial<ServiceDeployConfig>) => {
    setServiceConfigs(prev => ({
      ...prev,
      [serviceKey]: { ...prev[serviceKey], ...updates }
    }));
  };

  // Add custom environment variable to a service
  const addCustomEnvVar = (serviceKey: string) => {
    if (!customEnvKey.trim()) return;
    const config = serviceConfigs[serviceKey];
    if (!config) return;

    const newEnvVars = { ...config.envVars, [customEnvKey.trim()]: customEnvValue };
    const newEnvVarsEnabled = { ...config.envVarsEnabled, [customEnvKey.trim()]: true };
    updateServiceConfig(serviceKey, { envVars: newEnvVars, envVarsEnabled: newEnvVarsEnabled });
    setCustomEnvKey('');
    setCustomEnvValue('');
  };

  // Resync environment variables to Dokploy
  const handleResyncEnvVars = async (serviceKey: string) => {
    if (!existingDeployment) return;

    const config = serviceConfigs[serviceKey];
    const deployedService = existingDeployment.services.find(s => s.serviceKey === serviceKey);
    if (!config || !deployedService) return;

    setResyncService(serviceKey);
    setError(null);

    try {
      // Filter to only enabled env vars
      const enabledEnvVars = Object.entries(config.envVars)
        .filter(([key]) => config.envVarsEnabled[key] !== false);

      if (enabledEnvVars.length === 0) {
        setError('No environment variables selected to sync');
        setResyncService(null);
        return;
      }

      const envString = enabledEnvVars
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      const result = await window.electronAPI.dokployApi({
        accountId: existingDeployment.accountId,
        endpoint: 'application.saveEnvironment',
        method: 'POST',
        body: {
          applicationId: deployedService.applicationId,
          env: envString,
          createEnvFile: false
        }
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to sync environment variables');
      }

      // Update the deployment info with new timestamp
      const updatedDeployment: DokployProjectDeployment = {
        ...existingDeployment,
        updatedAt: new Date().toISOString()
      };
      if (project?.path) {
        await window.electronAPI.dokploySaveDeployment(project.path, updatedDeployment);
        setExistingDeployment(updatedDeployment);
      }

      setStep('success');
      setDeployedApps([deployedService.serviceName]);
    } catch (err) {
      console.error('Resync failed:', err);
      setError(err instanceof Error ? err.message : 'Resync failed');
    } finally {
      setResyncService(null);
    }
  };

  // Reset/clear local deployment config
  const handleResetDeployment = async () => {
    if (!project?.path) return;

    try {
      await window.electronAPI.dokployDeleteDeployment(project.path);
      setExistingDeployment(null);
      setStep('configure');
    } catch (err) {
      console.error('Failed to reset deployment config:', err);
    }
  };

  // Link to existing Dokploy project/applications (for services in link mode)
  const handleLinkExisting = async () => {
    if (!selectedAccountId || !project?.path) return;

    // Build service deployments from the links
    const deployedServices: DokployServiceDeployment[] = [];
    let firstProjectId = '';
    let firstProjectName = '';

    for (const service of services) {
      const config = serviceConfigs[service.key];
      if (!config?.enabled || !config?.linkMode || !config?.linkedApp?.applicationId) continue;

      const proj = dokployProjects.find(p => p.projectId === config.linkedApp!.projectId);
      const app = proj?.applications.find(a => a.applicationId === config.linkedApp!.applicationId);

      if (app) {
        if (!firstProjectId) {
          firstProjectId = config.linkedApp!.projectId;
          firstProjectName = proj?.name || '';
        }
        deployedServices.push({
          serviceKey: service.key,
          serviceName: service.name,
          applicationId: app.applicationId,
          appName: app.appName || app.name,
          applicationType: app.type, // Store the app type for future reference
          branch: '', // Unknown for linked apps
          deployedAt: new Date().toISOString()
        });
      }
    }

    if (deployedServices.length === 0) {
      setError('Please link at least one service to an application');
      return;
    }

    const selectedAccount = dokployAccounts.find(a => a.id === selectedAccountId);
    const deploymentInfo: DokployProjectDeployment = {
      accountId: selectedAccountId,
      accountName: selectedAccount?.name || 'Unknown',
      projectId: firstProjectId, // Use first linked project
      projectName: firstProjectName,
      environmentId: '', // Unknown for linked projects
      serverId: selectedServerId === '__local__' ? undefined : selectedServerId,
      repository: detectedRepo ? {
        owner: detectedRepo.owner,
        name: detectedRepo.name,
        fullName: detectedRepo.fullName
      } : { owner: '', name: '', fullName: '' },
      services: deployedServices,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await window.electronAPI.dokploySaveDeployment(project.path, deploymentInfo);
      setExistingDeployment(deploymentInfo);
      setStep('success');
      setDeployedApps(deployedServices.map(s => s.serviceName));
    } catch (err) {
      console.error('Failed to save linked deployment:', err);
      setError('Failed to save deployment configuration');
    }
  };

  // Get enabled services
  const enabledServices = useMemo(() => {
    return services.filter(s => serviceConfigs[s.key]?.enabled);
  }, [services, serviceConfigs]);

  // Services that are fully configured (either create new or linked)
  const configuredServices = useMemo(() => {
    return services.filter(s => {
      const config = serviceConfigs[s.key];
      if (!config?.enabled) return false;

      if (config.linkMode) {
        // Link mode: must have app selected
        return !!config.linkedApp?.applicationId;
      } else {
        // Create new mode: must have appName and branch
        return !!config.appName && !!config.branch;
      }
    });
  }, [services, serviceConfigs]);

  // Services left to deploy = enabled but not configured
  const servicesLeftToDeploy = useMemo(() => {
    return services.filter(s => {
      const config = serviceConfigs[s.key];
      if (!config?.enabled) return false;

      if (config.linkMode) {
        return !config.linkedApp?.applicationId;
      } else {
        return !config.appName || !config.branch;
      }
    });
  }, [services, serviceConfigs]);

  // Are ALL enabled services in link mode with apps selected?
  const isAllLinked = useMemo(() => {
    const enabled = services.filter(s => serviceConfigs[s.key]?.enabled);
    if (enabled.length === 0) return false;

    return enabled.every(s => {
      const config = serviceConfigs[s.key];
      return config.linkMode && config.linkedApp?.applicationId;
    });
  }, [services, serviceConfigs]);

  // Are ALL enabled services in create new mode?
  const isAllCreateNew = useMemo(() => {
    const enabled = services.filter(s => serviceConfigs[s.key]?.enabled);
    if (enabled.length === 0) return false;

    return enabled.every(s => !serviceConfigs[s.key]?.linkMode);
  }, [services, serviceConfigs]);

  // Fetch servers when account is selected
  const fetchServers = useCallback(async (accountId: string) => {
    setIsLoadingServers(true);
    setError(null);
    try {
      const result = await window.electronAPI.dokployApi({
        accountId,
        endpoint: 'server.all',
        method: 'GET'
      });
      if (result.success && result.data) {
        const serverList = result.data as DokployServer[];
        setServers(serverList);
        // Default to last remote server (most recently added)
        if (serverList.length > 0) {
          setSelectedServerId(serverList[serverList.length - 1].serverId);
        }
      } else {
        console.error('Failed to fetch servers:', result.error);
      }
    } catch (err) {
      console.error('Failed to fetch servers:', err);
    } finally {
      setIsLoadingServers(false);
    }
  }, []);

  // Fetch GitHub providers when account is selected
  const fetchGitHubProviders = useCallback(async (accountId: string) => {
    setIsLoadingGitHub(true);
    try {
      const result = await window.electronAPI.dokployApi({
        accountId,
        endpoint: 'gitProvider.getAll',
        method: 'GET'
      });
      console.log('[Dokploy] Git providers response:', result);
      if (result.success && result.data) {
        // Filter to only GitHub providers
        const allProviders = result.data as DokployGitHubProvider[];
        const githubProviders = allProviders.filter(p => p.providerType === 'github');
        console.log('[Dokploy] GitHub providers:', githubProviders);
        setGitHubProviders(githubProviders);
        // Auto-select first provider - use the actual githubId from nested object or top level
        if (githubProviders.length > 0) {
          const provider = githubProviders[0];
          const githubId = provider.github?.githubId || provider.githubId || provider.gitProviderId;
          console.log('[Dokploy] Selected GitHub ID:', githubId, 'from provider:', provider);
          setSelectedGitHubProviderId(githubId);
        }
      } else {
        console.error('Failed to fetch GitHub providers:', result.error);
      }
    } catch (err) {
      console.error('Failed to fetch GitHub providers:', err);
    } finally {
      setIsLoadingGitHub(false);
    }
  }, []);

  // Fetch existing projects with their applications
  const fetchDokployProjects = useCallback(async (accountId: string) => {
    setIsLoadingProjects(true);
    try {
      // Fetch projects with nested environments and all resource types
      const projectsResult = await window.electronAPI.dokployApi({
        accountId,
        endpoint: 'project.all',
        method: 'GET'
      });

      if (!projectsResult.success || !projectsResult.data) {
        console.error('Failed to fetch projects:', projectsResult.error);
        return;
      }

      // Parse the nested structure: projects -> environments -> [applications, compose, databases]
      const rawProjects = projectsResult.data as Array<{
        projectId: string;
        name: string;
        environments?: Array<{
          environmentId: string;
          name: string;
          applications?: Array<{ applicationId: string; name: string; appName: string }>;
          compose?: Array<{ composeId: string; name: string; appName: string }>;
          mariadb?: Array<{ mariadbId: string; name: string; appName: string }>;
          mongo?: Array<{ mongoId: string; name: string; appName: string }>;
          mysql?: Array<{ mysqlId: string; name: string; appName: string }>;
          postgres?: Array<{ postgresId: string; name: string; appName: string }>;
          redis?: Array<{ redisId: string; name: string; appName: string }>;
        }>;
      }>;

      console.log('[Dokploy] Raw projects with environments:', rawProjects);

      // Extract all applications from all environments and resource types
      const projectsWithApps = rawProjects.map(project => {
        const allApps: Array<{
          applicationId: string;
          name: string;
          appName: string;
          type: 'application' | 'compose' | 'mariadb' | 'mongo' | 'mysql' | 'postgres' | 'redis';
          environmentId: string;
          environmentName: string;
        }> = [];

        // Iterate through all environments
        for (const env of project.environments || []) {
          // Regular applications
          for (const app of env.applications || []) {
            allApps.push({
              applicationId: app.applicationId,
              name: app.name,
              appName: app.appName,
              type: 'application',
              environmentId: env.environmentId,
              environmentName: env.name
            });
          }

          // Compose applications
          for (const compose of env.compose || []) {
            allApps.push({
              applicationId: compose.composeId,
              name: compose.name,
              appName: compose.appName,
              type: 'compose',
              environmentId: env.environmentId,
              environmentName: env.name
            });
          }

          // MariaDB
          for (const db of env.mariadb || []) {
            allApps.push({
              applicationId: db.mariadbId,
              name: db.name,
              appName: db.appName,
              type: 'mariadb',
              environmentId: env.environmentId,
              environmentName: env.name
            });
          }

          // MongoDB
          for (const db of env.mongo || []) {
            allApps.push({
              applicationId: db.mongoId,
              name: db.name,
              appName: db.appName,
              type: 'mongo',
              environmentId: env.environmentId,
              environmentName: env.name
            });
          }

          // MySQL
          for (const db of env.mysql || []) {
            allApps.push({
              applicationId: db.mysqlId,
              name: db.name,
              appName: db.appName,
              type: 'mysql',
              environmentId: env.environmentId,
              environmentName: env.name
            });
          }

          // PostgreSQL
          for (const db of env.postgres || []) {
            allApps.push({
              applicationId: db.postgresId,
              name: db.name,
              appName: db.appName,
              type: 'postgres',
              environmentId: env.environmentId,
              environmentName: env.name
            });
          }

          // Redis
          for (const db of env.redis || []) {
            allApps.push({
              applicationId: db.redisId,
              name: db.name,
              appName: db.appName,
              type: 'redis',
              environmentId: env.environmentId,
              environmentName: env.name
            });
          }
        }

        return {
          projectId: project.projectId,
          name: project.name,
          applications: allApps
        };
      });

      console.log('[Dokploy] Parsed projects with all app types:', projectsWithApps);
      setDokployProjects(projectsWithApps);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  // Load servers and GitHub providers when account changes or modal opens
  useEffect(() => {
    if (open && selectedAccountId) {
      fetchServers(selectedAccountId);
      fetchGitHubProviders(selectedAccountId);
    }
  }, [open, selectedAccountId, fetchServers, fetchGitHubProviders]);

  // Check if any service is in link mode
  const hasAnyLinkMode = useMemo(() => {
    return Object.values(serviceConfigs).some(c => c.enabled && c.linkMode);
  }, [serviceConfigs]);

  // Fetch projects when any service enters link mode
  useEffect(() => {
    if (hasAnyLinkMode && selectedAccountId && dokployProjects.length === 0) {
      fetchDokployProjects(selectedAccountId);
    }
  }, [hasAnyLinkMode, selectedAccountId, fetchDokployProjects, dokployProjects.length]);

  // Resync all API data
  const handleResyncAll = useCallback(() => {
    if (selectedAccountId) {
      fetchServers(selectedAccountId);
      fetchGitHubProviders(selectedAccountId);
      if (hasAnyLinkMode) {
        fetchDokployProjects(selectedAccountId);
      }
    }
  }, [selectedAccountId, fetchServers, fetchGitHubProviders, hasAnyLinkMode, fetchDokployProjects]);

  // Fetch branches locally from git
  const fetchBranches = useCallback(async () => {
    if (!project?.path) return;

    setIsLoadingBranches(true);
    setBranches([]);
    try {
      const result = await window.electronAPI.getGitBranches(project.path);
      if (result.success && result.data) {
        setBranches(result.data);
      } else {
        console.error('Failed to fetch branches:', result.error);
      }
    } catch (err) {
      console.error('Failed to fetch branches:', err);
    } finally {
      setIsLoadingBranches(false);
    }
  }, [project?.path]);

  // Fetch branches when modal opens and project is available
  useEffect(() => {
    if (open && project?.path) {
      fetchBranches();
    }
  }, [open, project?.path, fetchBranches]);

  const handleDeploy = async () => {
    if (!selectedAccountId || !projectName || !selectedGitHubProviderId || !detectedRepo || enabledServices.length === 0) {
      return;
    }

    setStep('deploying');
    setError(null);
    setDeployedApps([]);

    try {
      // 1. Create project
      const projectResult = await window.electronAPI.dokployApi({
        accountId: selectedAccountId,
        endpoint: 'project.create',
        method: 'POST',
        body: { name: projectName }
      });

      console.log('[Dokploy] Project create response:', projectResult);

      if (!projectResult.success || !projectResult.data) {
        throw new Error(projectResult.error || t('modal.error.createProject'));
      }

      const createdProject = projectResult.data as {
        project: { projectId: string };
        environment: { environmentId: string };
      };

      const dokployProjectId = createdProject.project.projectId;
      const environmentId = createdProject.environment.environmentId;

      if (!environmentId) {
        throw new Error('No environment found in project');
      }

      // Track deployed services for saving
      const deployedServices: DokployServiceDeployment[] = [];

      // 2. Create and deploy each enabled service
      for (const service of enabledServices) {
        const config = serviceConfigs[service.key];
        if (!config) continue;

        setDeployingService(service.name);

        // Create application for this service
        const appResult = await window.electronAPI.dokployApi({
          accountId: selectedAccountId,
          endpoint: 'application.create',
          method: 'POST',
          body: {
            name: config.appName,
            appName: config.appName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            environmentId,
            serverId: selectedServerId === '__local__' ? null : selectedServerId || null
          }
        });

        if (!appResult.success || !appResult.data) {
          throw new Error(`${service.name}: ${appResult.error || t('modal.error.createApp')}`);
        }

        const createdApp = appResult.data as { applicationId: string };

        // Configure GitHub provider with service-specific path (relative to project root)
        const relativePath = getRelativePath(service.path);
        const buildPath = relativePath === '.' ? '/' : `/${relativePath}`;
        const githubResult = await window.electronAPI.dokployApi({
          accountId: selectedAccountId,
          endpoint: 'application.saveGithubProvider',
          method: 'POST',
          body: {
            applicationId: createdApp.applicationId,
            repository: detectedRepo.name,
            branch: config.branch,
            owner: detectedRepo.owner,
            githubId: selectedGitHubProviderId,
            buildPath,
            enableSubmodules: false,
            triggerType: 'push'
          }
        });

        if (!githubResult.success) {
          throw new Error(`${service.name}: ${githubResult.error || t('modal.error.configureGitHub')}`);
        }

        // Configure custom domain if provided
        if (config.domain.trim()) {
          const domainBody: Record<string, unknown> = {
            applicationId: createdApp.applicationId,
            host: config.domain.trim(),
            https: true,
            certificateType: 'letsencrypt',
            domainType: 'application'
          };

          // Include port from service if available
          if (service.default_port) {
            domainBody.port = service.default_port;
          }

          const domainResult = await window.electronAPI.dokployApi({
            accountId: selectedAccountId,
            endpoint: 'domain.create',
            method: 'POST',
            body: domainBody
          });

          if (!domainResult.success) {
            console.warn(`${service.name}: Failed to set domain - ${domainResult.error}`);
            // Don't fail deployment for domain errors, just warn
          }
        }

        // Upload environment variables from .env file (only enabled ones)
        const enabledEnvVars = Object.entries(config.envVars)
          .filter(([key]) => config.envVarsEnabled[key] !== false);
        console.log(`[Dokploy Modal] Env vars for ${service.name}:`, enabledEnvVars.length, 'of', Object.keys(config.envVars).length);
        if (enabledEnvVars.length > 0) {
          // Convert env vars object to newline-separated KEY=VALUE format
          const envString = enabledEnvVars
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

          console.log(`[Dokploy Modal] Uploading env string for ${service.name}:`, envString.substring(0, 100) + '...');

          const envResult = await window.electronAPI.dokployApi({
            accountId: selectedAccountId,
            endpoint: 'application.saveEnvironment',
            method: 'POST',
            body: {
              applicationId: createdApp.applicationId,
              env: envString,
              createEnvFile: false
            }
          });

          console.log(`[Dokploy Modal] Save env result for ${service.name}:`, envResult);

          if (!envResult.success) {
            console.warn(`${service.name}: Failed to save environment variables - ${envResult.error}`);
            // Don't fail for env var errors, just warn
          }
        } else {
          console.log(`[Dokploy Modal] No env vars to upload for ${service.name}`);
        }

        // Trigger deployment if deployNow is enabled
        if (config.deployNow) {
          console.log(`[Dokploy] Triggering deployment for ${service.name}...`);
          try {
            const deployResult = await window.electronAPI.dokployApi({
              accountId: selectedAccountId,
              endpoint: 'application.deploy',
              method: 'POST',
              body: {
                applicationId: createdApp.applicationId
              }
            });

            if (!deployResult.success) {
              console.warn(`${service.name}: Failed to trigger deployment - ${deployResult.error}`);
              // Don't fail the whole process for deployment trigger errors
            } else {
              console.log(`[Dokploy] Deployment triggered for ${service.name}`);
            }
          } catch (err) {
            console.warn(`${service.name}: Error triggering deployment:`, err);
            // Don't fail the whole process for deployment trigger errors
          }
        }

        // Track deployed service
        deployedServices.push({
          serviceKey: service.key,
          serviceName: service.name,
          applicationId: createdApp.applicationId,
          appName: config.appName,
          branch: config.branch,
          domain: config.domain || undefined,
          port: service.default_port,
          deployedAt: new Date().toISOString()
        });

        setDeployedApps(prev => [...prev, service.name]);
      }

      // Save deployment info locally
      const selectedAccount = dokployAccounts.find(a => a.id === selectedAccountId);
      const deploymentInfo: DokployProjectDeployment = {
        accountId: selectedAccountId,
        accountName: selectedAccount?.name || 'Unknown',
        projectId: dokployProjectId,
        projectName,
        environmentId,
        serverId: selectedServerId === '__local__' ? undefined : selectedServerId,
        repository: {
          owner: detectedRepo.owner,
          name: detectedRepo.name,
          fullName: detectedRepo.fullName
        },
        services: deployedServices,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (project?.path) {
        await window.electronAPI.dokploySaveDeployment(project.path, deploymentInfo);
        console.log('[Dokploy] Saved deployment info to project');
      }

      setDeployingService(null);
      setStep('success');
    } catch (err) {
      console.error('Deployment failed:', err);
      setError(err instanceof Error ? err.message : 'Deployment failed');
      setStep('error');
    }
  };

  const canDeploy = selectedAccountId &&
    projectName.trim() &&
    selectedGitHubProviderId &&
    detectedRepo &&
    enabledServices.length > 0 &&
    enabledServices.every(s => serviceConfigs[s.key]?.appName && serviceConfigs[s.key]?.branch);

  // Helper to show what's blocking deployment
  const getDeployBlocker = (): string | null => {
    if (!selectedAccountId) return 'Select a Dokploy account';
    if (!projectName.trim()) return 'Enter a project name';
    if (!selectedGitHubProviderId) return 'No GitHub provider configured in Dokploy';
    if (!detectedRepo) return 'Could not detect repository';
    if (enabledServices.length === 0) return 'Enable at least one service';
    const missingConfig = enabledServices.find(s => !serviceConfigs[s.key]?.appName || !serviceConfigs[s.key]?.branch);
    if (missingConfig) return `Configure app name and branch for ${missingConfig.name}`;
    return null;
  };

  const renderContent = () => {
    if (step === 'deploying') {
      return (
        <div className="flex flex-col items-center justify-center py-8">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">
            {deployingService ? `Configuring ${deployingService}...` : 'Setting up applications...'}
          </p>
          {deployedApps.length > 0 && (
            <div className="mt-4 text-xs text-muted-foreground">
              <p>Configured: {deployedApps.join(', ')}</p>
            </div>
          )}
        </div>
      );
    }

    if (step === 'success') {
      return (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
          </div>
          <h3 className="mt-4 font-semibold text-foreground">
            {enabledServices.some(s => serviceConfigs[s.key]?.deployNow) ? 'Deployment Started' : 'Applications Configured'}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground text-center">
            {enabledServices.some(s => serviceConfigs[s.key]?.deployNow) ? (
              <>
                Your applications have been configured and deployment has been triggered.
                <br />
                Check the Dokploy dashboard for deployment progress.
              </>
            ) : (
              <>
                Your applications have been created and configured in Dokploy.
                <br />
                Deploy them from the Dokploy dashboard when ready.
              </>
            )}
          </p>
          {deployedApps.length > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-muted/50 w-full">
              <p className="text-xs font-medium text-muted-foreground mb-2">Configured services:</p>
              <ul className="space-y-1">
                {deployedApps.map(app => (
                  <li key={app} className="text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    {app}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }

    if (step === 'error') {
      return (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="h-12 w-12 rounded-full bg-destructive/20 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h3 className="mt-4 font-semibold text-foreground">{t('modal.error.title')}</h3>
          <p className="mt-2 text-sm text-destructive text-center">{error}</p>
          <Button className="mt-4" variant="outline" onClick={() => setStep(existingDeployment ? 'resync' : 'configure')}>
            Try Again
          </Button>
        </div>
      );
    }

    if (step === 'resync' && existingDeployment) {
      return (
        <div className="space-y-4">
          {/* Deployment Info */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="font-medium text-sm">Deployed to Dokploy</span>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Project: {existingDeployment.projectName}</p>
              <p>Account: {existingDeployment.accountName}</p>
              <p>Last updated: {new Date(existingDeployment.updatedAt).toLocaleString()}</p>
            </div>
          </div>

          {/* Services with resync option */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Deployed Services
            </Label>
            <ScrollArea className="h-[350px] rounded-md border p-2">
              <div className="space-y-3">
                {existingDeployment.services.map((deployedService) => {
                  const service = services.find(s => s.key === deployedService.serviceKey);
                  const config = serviceConfigs[deployedService.serviceKey];
                  if (!config) return null;

                  const enabledCount = Object.values(config.envVarsEnabled).filter(Boolean).length;
                  const totalCount = Object.keys(config.envVars).length;

                  return (
                    <div key={deployedService.serviceKey} className="p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-medium text-sm">{deployedService.serviceName}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({deployedService.appName})
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResyncEnvVars(deployedService.serviceKey)}
                          disabled={resyncService !== null}
                        >
                          {resyncService === deployedService.serviceKey ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              Syncing...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Sync Env Vars
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Environment Variables */}
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => toggleEnvVars(deployedService.serviceKey)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                        >
                          {expandedEnvVars[deployedService.serviceKey] ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                          Environment Variables ({enabledCount}/{totalCount})
                        </button>
                        {expandedEnvVars[deployedService.serviceKey] && (
                          <div className="bg-muted/30 rounded p-2 space-y-2 max-h-48 overflow-y-auto mt-1">
                            {Object.entries(config.envVars).map(([key, value]) => {
                              const isEnabled = config.envVarsEnabled[key] !== false;
                              return (
                                <div key={key} className={`flex items-center gap-2 ${!isEnabled ? 'opacity-50' : ''}`}>
                                  <Checkbox
                                    checked={isEnabled}
                                    onCheckedChange={(checked) => {
                                      const newEnvVarsEnabled = { ...config.envVarsEnabled, [key]: !!checked };
                                      updateServiceConfig(deployedService.serviceKey, { envVarsEnabled: newEnvVarsEnabled });
                                    }}
                                    className="h-4 w-4"
                                  />
                                  <span className="text-xs font-mono text-foreground min-w-[120px] truncate" title={key}>
                                    {key}
                                  </span>
                                  <Input
                                    value={value}
                                    onChange={(e) => {
                                      const newEnvVars = { ...config.envVars, [key]: e.target.value };
                                      updateServiceConfig(deployedService.serviceKey, { envVars: newEnvVars });
                                    }}
                                    className="h-7 text-xs font-mono flex-1"
                                    placeholder="Value"
                                    disabled={!isEnabled}
                                  />
                                </div>
                              );
                            })}

                            {/* Add Custom Variable */}
                            <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                              <Input
                                value={customEnvKey}
                                onChange={(e) => setCustomEnvKey(e.target.value)}
                                placeholder="KEY"
                                className="h-7 text-xs font-mono w-[120px]"
                              />
                              <Input
                                value={customEnvValue}
                                onChange={(e) => setCustomEnvValue(e.target.value)}
                                placeholder="value"
                                className="h-7 text-xs font-mono flex-1"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2"
                                onClick={() => addCustomEnvVar(deployedService.serviceKey)}
                                disabled={!customEnvKey.trim()}
                              >
                                Add
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Account Selection */}
        <div className="space-y-2">
          <Label>{t('modal.selectAccount')}</Label>
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger>
              <SelectValue placeholder={t('modal.selectAccountPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {dokployAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedAccountId && (
          <>
            {/* Server Selection */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    {t('modal.selectServer')}
                  </Label>
                  {isLoadingServers ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('modal.loadingServers')}
                    </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Select value={selectedServerId} onValueChange={setSelectedServerId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={t('modal.selectServerPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {servers.map((server) => (
                        <SelectItem key={server.serverId} value={server.serverId}>
                          {server.name} {server.ipAddress && `(${server.ipAddress})`}
                        </SelectItem>
                      ))}
                      <SelectItem value="__local__">{t('modal.localServer')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleResyncAll}
                    disabled={isLoadingServers || isLoadingGitHub}
                    className="shrink-0"
                    title="Refresh"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoadingServers || isLoadingGitHub ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t('modal.selectServerDescription')}</p>
            </div>

            {/* Project Name */}
            <div className="space-y-2">
              <Label>{t('modal.projectName')}</Label>
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder={t('modal.projectNamePlaceholder')}
              />
              <p className="text-xs text-muted-foreground">{t('modal.projectNameDescription')}</p>
            </div>

            {/* Error states for repo detection */}
            {repoDetectionError && (
              <p className="text-sm text-destructive">{repoDetectionError}</p>
            )}

            {/* Services List */}
            {detectedRepo && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Services ({enabledServices.length}/{services.length} selected)
                  </Label>
                  <div className="flex items-center gap-2">
                    {isLoadingBranches && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {t('modal.loadingBranches')}
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => {
                        const allEnabled = enabledServices.length === services.length;
                        const updated = { ...serviceConfigs };
                        services.forEach(s => {
                          if (updated[s.key]) {
                            updated[s.key] = { ...updated[s.key], enabled: !allEnabled };
                          }
                        });
                        setServiceConfigs(updated);
                      }}
                      title={enabledServices.length === services.length ? "Deselect all" : "Select all"}
                    >
                      {enabledServices.length === services.length ? 'Deselect All' : 'Select All'}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        setServiceConfigs({});
                        refreshProjectIndex(projectId);
                      }}
                      disabled={indexLoading}
                      title="Refresh services"
                    >
                      <RefreshCw className={`h-3 w-3 ${indexLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>

                {indexLoading ? (
                  <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading project services...
                  </div>
                ) : services.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-2">
                    No services detected in this project.
                  </div>
                ) : (
                  <ScrollArea className="h-[300px] rounded-md border p-2">
                    <div className="space-y-3">
                      {services.map((service) => {
                        const config = serviceConfigs[service.key];
                        if (!config) return null;

                        return (
                          <div
                            key={service.key}
                            className={`p-3 rounded-lg border ${config.enabled ? 'bg-muted/50 border-primary/20' : 'bg-muted/20'}`}
                          >
                            {/* Service Header */}
                            <div className="flex items-center gap-2 mb-2">
                              <Checkbox
                                id={`service-${service.key}`}
                                checked={config.enabled}
                                onCheckedChange={(checked) =>
                                  updateServiceConfig(service.key, { enabled: !!checked })
                                }
                              />
                              <label
                                htmlFor={`service-${service.key}`}
                                className="text-sm font-medium cursor-pointer flex-1"
                              >
                                {service.name}
                              </label>
                              <span className="text-xs text-muted-foreground">
                                {service.type} • {service.framework || service.language}
                              </span>
                            </div>

                            {/* Service Config (only when enabled) */}
                            {config.enabled && (
                              <>
                                {/* Mode Toggle */}
                                <div className="flex items-center gap-2 mt-2 p-1 rounded-md bg-muted/30 border border-border/50">
                                  <button
                                    type="button"
                                    onClick={() => updateServiceConfig(service.key, { linkMode: false })}
                                    className={`flex-1 py-1 px-2 rounded text-xs font-medium transition-colors ${
                                      !config.linkMode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                  >
                                    Create New
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateServiceConfig(service.key, { linkMode: true })}
                                    className={`flex-1 py-1 px-2 rounded text-xs font-medium transition-colors ${
                                      config.linkMode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                  >
                                    Link Existing
                                  </button>
                                </div>

                                {config.linkMode ? (
                                  /* Link Existing Mode */
                                  <div className="space-y-3 mt-2">
                                    {isLoadingProjects ? (
                                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Loading projects...
                                      </div>
                                    ) : (
                                      <>
                                        {/* Project Selection */}
                                        <div className="space-y-1">
                                          <Label className="text-xs text-muted-foreground">Dokploy Project</Label>
                                          <Select
                                            value={config.linkedProjectId || ''}
                                            onValueChange={(value) => {
                                              if (value === '__none__') {
                                                updateServiceConfig(service.key, { linkedProjectId: undefined, linkedApp: undefined });
                                              } else {
                                                updateServiceConfig(service.key, { linkedProjectId: value, linkedApp: undefined });
                                              }
                                            }}
                                          >
                                            <SelectTrigger className="h-8 text-sm">
                                              <SelectValue placeholder="Select a project" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="__none__">None (skip this service)</SelectItem>
                                              {dokployProjects.map((proj) => (
                                                <SelectItem key={proj.projectId} value={proj.projectId}>
                                                  {proj.name}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>

                                        {/* Application Selection (only shown when project is selected) */}
                                        {config.linkedProjectId && (
                                          <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Application</Label>
                                            {(() => {
                                              const selectedProject = dokployProjects.find(p => p.projectId === config.linkedProjectId);
                                              const apps = selectedProject?.applications || [];
                                              return apps.length === 0 ? (
                                                <p className="text-xs text-muted-foreground py-2">No applications in this project</p>
                                              ) : (
                                                <Select
                                                  value={config.linkedApp?.applicationId || ''}
                                                  onValueChange={(value) => {
                                                    if (value && config.linkedProjectId) {
                                                      updateServiceConfig(service.key, {
                                                        linkedApp: { projectId: config.linkedProjectId, applicationId: value }
                                                      });
                                                    }
                                                  }}
                                                >
                                                  <SelectTrigger className="h-8 text-sm">
                                                    <SelectValue placeholder="Select an application" />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    {apps.map((app) => (
                                                      <SelectItem key={app.applicationId} value={app.applicationId}>
                                                        <div className="flex items-center gap-2">
                                                          <span>{app.name}</span>
                                                          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                                                            {app.type}
                                                          </span>
                                                          <span className="text-xs text-muted-foreground">
                                                            • {app.environmentName}
                                                          </span>
                                                        </div>
                                                      </SelectItem>
                                                    ))}
                                                  </SelectContent>
                                                </Select>
                                              );
                                            })()}
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                ) : (
                                  /* Create New Mode */
                                  <>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                      {/* App Name */}
                                      <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">App Name</Label>
                                        <Input
                                          value={config.appName}
                                          onChange={(e) =>
                                            updateServiceConfig(service.key, { appName: e.target.value })
                                          }
                                          placeholder="app-name"
                                          className="h-8 text-sm"
                                        />
                                      </div>

                                      {/* Branch */}
                                      <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                          <GitBranch className="h-3 w-3" />
                                          Branch
                                        </Label>
                                        <Select
                                          value={config.branch}
                                          onValueChange={(value) =>
                                            updateServiceConfig(service.key, { branch: value })
                                          }
                                        >
                                          <SelectTrigger className="h-8 text-sm">
                                            <SelectValue placeholder="Select branch" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {branches.map((branch) => (
                                              <SelectItem key={branch} value={branch}>
                                                {branch}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>

                                    {/* Domain (optional) */}
                                    <div className="space-y-1 mt-2">
                                      <Label className="text-xs text-muted-foreground">
                                        Domain (optional)
                                      </Label>
                                      <Input
                                        value={config.domain}
                                        onChange={(e) =>
                                          updateServiceConfig(service.key, { domain: e.target.value })
                                        }
                                        placeholder="app.example.com"
                                        className="h-8 text-sm"
                                      />
                                    </div>

                                    {/* Environment Variables (Collapsible) */}
                                    {Object.keys(config.envVars).length > 0 && (
                                      <div className="mt-2">
                                        <button
                                          type="button"
                                          onClick={() => toggleEnvVars(service.key)}
                                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                                        >
                                          {expandedEnvVars[service.key] ? (
                                            <ChevronDown className="h-3 w-3" />
                                          ) : (
                                            <ChevronRight className="h-3 w-3" />
                                          )}
                                          Environment Variables ({Object.values(config.envVarsEnabled).filter(Boolean).length}/{Object.keys(config.envVars).length})
                                        </button>
                                        {expandedEnvVars[service.key] && (
                                          <div className="bg-muted/30 rounded p-2 space-y-2 max-h-40 overflow-y-auto mt-1">
                                            {Object.entries(config.envVars).map(([key, value]) => {
                                              const isEnabled = config.envVarsEnabled[key] !== false;
                                              return (
                                                <div key={key} className={`flex items-center gap-2 ${!isEnabled ? 'opacity-50' : ''}`}>
                                                  <Checkbox
                                                    checked={isEnabled}
                                                    onCheckedChange={(checked) => {
                                                      const newEnvVarsEnabled = { ...config.envVarsEnabled, [key]: !!checked };
                                                      updateServiceConfig(service.key, { envVarsEnabled: newEnvVarsEnabled });
                                                    }}
                                                    className="h-4 w-4"
                                                  />
                                                  <span className="text-xs font-mono text-foreground min-w-[120px] truncate" title={key}>
                                                    {key}
                                                  </span>
                                                  <Input
                                                    value={value}
                                                    onChange={(e) => {
                                                      const newEnvVars = { ...config.envVars, [key]: e.target.value };
                                                      updateServiceConfig(service.key, { envVars: newEnvVars });
                                                    }}
                                                    className="h-7 text-xs font-mono flex-1"
                                                    placeholder="Value"
                                                    disabled={!isEnabled}
                                                  />
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Service Path */}
                                    <p className="text-xs text-muted-foreground mt-2">
                                      Build path: /{getRelativePath(service.path) === '.' ? '' : getRelativePath(service.path)}
                                    </p>

                                    {/* Deploy Now Toggle - only for Create New mode */}
                                    <div className="flex items-center justify-between p-2 rounded-md bg-muted/20 border border-border/30 mt-3">
                                      <div className="flex flex-col gap-0.5">
                                        <Label htmlFor={`deploy-now-${service.key}`} className="text-xs font-medium cursor-pointer">
                                          Deploy immediately after setup
                                        </Label>
                                        <p className="text-xs text-muted-foreground">
                                          {config.deployNow ? 'Will trigger deployment automatically' : 'Will only configure (manual deploy required)'}
                                        </p>
                                      </div>
                                      <Switch
                                        id={`deploy-now-${service.key}`}
                                        checked={config.deployNow}
                                        onCheckedChange={(checked) =>
                                          updateServiceConfig(service.key, { deployNow: checked })
                                        }
                                      />
                                    </div>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            {t('modal.title')}
          </DialogTitle>
          <DialogDescription>{t('modal.description')}</DialogDescription>
        </DialogHeader>

        {renderContent()}

        {step === 'configure' && (
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {existingDeployment && (
              <Button variant="ghost" size="sm" className="mr-auto" onClick={() => setStep('resync')}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Manage Existing Deployment
              </Button>
            )}

            {/* Show services left to deploy */}
            {servicesLeftToDeploy.length > 0 && !existingDeployment && (
              <p className="text-xs text-muted-foreground mr-auto">
                {servicesLeftToDeploy.length} service{servicesLeftToDeploy.length !== 1 ? 's' : ''} left to configure
              </p>
            )}

            {!canDeploy && getDeployBlocker() && !existingDeployment && servicesLeftToDeploy.length === 0 && (
              <p className="text-xs text-destructive mr-auto">
                {getDeployBlocker()}
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('modal.cancel')}
              </Button>

              {isAllLinked ? (
                <Button
                  onClick={handleLinkExisting}
                  disabled={configuredServices.length === 0}
                >
                  Link Applications ({configuredServices.length})
                </Button>
              ) : isAllCreateNew ? (
                <Button onClick={handleDeploy} disabled={!canDeploy}>
                  <Rocket className="mr-2 h-4 w-4" />
                  {existingDeployment ? 'Create New Deployment' : 'Configure Apps'}
                </Button>
              ) : (
                <Button
                  onClick={configuredServices.some(s => serviceConfigs[s.key]?.linkMode) ? handleLinkExisting : handleDeploy}
                  disabled={configuredServices.length === 0}
                >
                  {configuredServices.some(s => serviceConfigs[s.key]?.linkMode) ? 'Link' : 'Configure'} ({configuredServices.length})
                </Button>
              )}
            </div>
          </DialogFooter>
        )}

        {step === 'success' && (
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>
              {t('modal.close')}
            </Button>
          </DialogFooter>
        )}

        {step === 'resync' && (
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <div className="flex gap-2 mr-auto">
              <Button variant="ghost" size="sm" onClick={() => setStep('configure')}>
                New Deployment
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleResetDeployment}>
                Reset Config
              </Button>
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('modal.close')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
