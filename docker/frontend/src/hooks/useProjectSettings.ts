import { useState, useEffect } from 'react';
import type { Project, ProjectSettings, AutoBuildVersionInfo } from '../../shared/types';
import { checkProjectVersion } from '../stores/project-store';

export function useProjectSettings(project: Project, open: boolean) {
  const [settings, setSettings] = useState<ProjectSettings>(project.settings);
  const [versionInfo, setVersionInfo] = useState<AutoBuildVersionInfo | null>(null);
  const [isCheckingVersion, setIsCheckingVersion] = useState(false);

  // Reset settings when project changes
  useEffect(() => {
    setSettings(project.settings);
  }, [project]);

  // Check version when dialog opens
  useEffect(() => {
    const checkVersion = async () => {
      if (open && project.autoBuildPath) {
        setIsCheckingVersion(true);
        const info = await checkProjectVersion(project.id);
        setVersionInfo(info);
        setIsCheckingVersion(false);
      }
    };
    checkVersion();
  }, [open, project.id, project.autoBuildPath]);

  return {
    settings,
    setSettings,
    versionInfo,
    setVersionInfo,
    isCheckingVersion,
  };
}
