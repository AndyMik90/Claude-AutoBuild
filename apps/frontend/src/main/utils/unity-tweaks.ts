import * as fs from 'fs-extra';
import * as path from 'path';
import { execSync } from 'child_process';
import { createPatch } from 'diff';
import { randomBytes } from 'crypto';

export interface TweakBackup {
  timestamp: string;
  files: string[]; // Relative paths from project root
  preDir: string; // Absolute path to pre/ backup directory
  postDir?: string; // Absolute path to post/ backup directory (set after execution)
  diffPath?: string; // Absolute path to diff file (set after execution)
}

export interface TweakParams {
  targetGroup?: string; // 'Standalone' | 'Android' | 'iOS' | 'WebGL'
  symbol?: string; // Define symbol to add/remove
  backend?: string; // 'Mono' | 'IL2CPP'
  buildTarget?: string; // 'Android' | 'StandaloneWindows64' | etc.
}

/**
 * Create pre-backup for files that may be modified by a tweak
 */
export async function createPreBackup(
  projectPath: string,
  runDir: string,
  filesToBackup: string[]
): Promise<TweakBackup> {
  const preDir = path.join(runDir, 'pre');
  await fs.ensureDir(preDir);

  const backedUpFiles: string[] = [];

  for (const relPath of filesToBackup) {
    const srcPath = path.join(projectPath, relPath);
    if (await fs.pathExists(srcPath)) {
      const destPath = path.join(preDir, relPath);
      await fs.ensureDir(path.dirname(destPath));
      await fs.copy(srcPath, destPath);
      backedUpFiles.push(relPath);
    }
  }

  return {
    timestamp: new Date().toISOString(),
    files: backedUpFiles,
    preDir,
  };
}

/**
 * Create post-backup and generate diff
 */
export async function createPostBackupAndDiff(
  projectPath: string,
  runDir: string,
  backup: TweakBackup,
  useGit: boolean = true
): Promise<{ changedFiles: string[]; diffPath: string }> {
  const postDir = path.join(runDir, 'post');
  await fs.ensureDir(postDir);

  // Create post-backups
  for (const relPath of backup.files) {
    const srcPath = path.join(projectPath, relPath);
    if (await fs.pathExists(srcPath)) {
      const destPath = path.join(postDir, relPath);
      await fs.ensureDir(path.dirname(destPath));
      await fs.copy(srcPath, destPath);
    }
  }

  backup.postDir = postDir;

  // Generate diff
  const changedFiles: string[] = [];
  let diffContent = '';
  let gitDiffSucceeded = false;

  // Try git diff first if enabled and this is a git repository
  if (useGit && (await isGitRepository(projectPath))) {
    try {
      const gitDiff = execSync(`git diff -- ${backup.files.join(' ')}`, {
        cwd: projectPath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });
      diffContent = gitDiff;

      // Parse changed files from git diff
      const diffLines = gitDiff.split('\n');
      for (const line of diffLines) {
        if (line.startsWith('diff --git')) {
          const match = line.match(/diff --git a\/(.+) b\/.+/);
          if (match) {
            changedFiles.push(match[1]);
          }
        }
      }
      gitDiffSucceeded = true;
    } catch (error) {
      // Git diff failed, fall back to manual diff
      console.warn('Git diff failed, using manual diff:', error);
    }
  }

  // Fall back to manual diff if git wasn't used or failed
  if (!gitDiffSucceeded) {
    diffContent = '';
    for (const relPath of backup.files) {
      const prePath = path.join(backup.preDir, relPath);
      const postPath = path.join(postDir, relPath);

      if (!(await fs.pathExists(prePath)) || !(await fs.pathExists(postPath))) {
        continue;
      }

      const preContent = await fs.readFile(prePath, 'utf-8');
      const postContent = await fs.readFile(postPath, 'utf-8');

      if (preContent !== postContent) {
        changedFiles.push(relPath);

        // Generate unified diff
        const patch = createPatch(relPath, preContent, postContent, 'pre', 'post');
        diffContent += patch + '\n';
      }
    }
  }

  // Save diff file
  const diffFileName = gitDiffSucceeded ? 'git-diff.txt' : 'diff.txt';
  const diffPath = path.join(runDir, diffFileName);
  await fs.writeFile(diffPath, diffContent || 'No changes detected\n', 'utf-8');

  backup.diffPath = diffPath;

  return { changedFiles, diffPath };
}

/**
 * Get list of files that may be modified by a tweak action
 */
export function getFilesToBackup(action: string, params: TweakParams): string[] {
  const files: string[] = [];

  // ProjectSettings are always modified by tweaks
  files.push('ProjectSettings/ProjectSettings.asset');

  // For some actions, additional files may be modified
  switch (action) {
    case 'add-define':
    case 'remove-define':
    case 'set-backend':
      // Define symbols and scripting backend are in ProjectSettings.asset
      break;

    case 'switch-build-target':
      // Switching build target also modifies EditorUserBuildSettings (stored in Library/)
      // This file is important for build configuration persistence and should be backed up
      // Build target changes may also update ProjectSettings if platform-specific settings differ
      files.push('ProjectSettings/EditorBuildSettings.asset');
      files.push('Library/EditorUserBuildSettings.asset');
      break;

    case 'upm-resolve':
      // UPM resolve may modify packages-lock.json and manifest.json
      files.push('Packages/manifest.json');
      files.push('Packages/packages-lock.json');
      break;
  }

  return files;
}

/**
 * Check if project is a git repository
 */
function isGitRepository(projectPath: string): Promise<boolean> {
  const gitDir = path.join(projectPath, '.git');
  return fs.pathExists(gitDir);
}

/**
 * Install Unity Bridge into project
 */
export async function installUnityBridge(
  projectPath: string,
  bridgeTemplatePath: string
): Promise<{ installed: boolean; bridgePath: string; message: string }> {
  const bridgeDir = path.join(projectPath, 'Assets', 'Editor', 'Squido.JungleXRKit.Assistant.UnityBridge');
  const bridgePath = path.join(bridgeDir, 'JungleAssistantUnityBridge.cs');

  // Read template
  const templateContent = await fs.readFile(bridgeTemplatePath, 'utf-8');

  // Check if bridge already exists and is identical
  if (await fs.pathExists(bridgePath)) {
    const existingContent = await fs.readFile(bridgePath, 'utf-8');
    if (existingContent === templateContent) {
      return {
        installed: false,
        bridgePath,
        message: 'Unity Bridge is already up to date',
      };
    }
  }

  // Ensure directory exists
  await fs.ensureDir(bridgeDir);

  // Write bridge file
  await fs.writeFile(bridgePath, templateContent, 'utf-8');

  // Create .meta file to avoid Unity warnings (optional but recommended)
  const metaPath = `${bridgePath}.meta`;
  if (!(await fs.pathExists(metaPath))) {
    const guid = generateGuid();
    const metaContent = `fileFormatVersion: 2
guid: ${guid}
MonoImporter:
  externalObjects: {}
  serializedVersion: 2
  defaultReferences: []
  executionOrder: 0
  icon: {instanceID: 0}
  userData:
  assetBundleName:
  assetBundleVariant:
`;
    await fs.writeFile(metaPath, metaContent, 'utf-8');
  }

  return {
    installed: true,
    bridgePath,
    message: 'Unity Bridge installed successfully',
  };
}

/**
 * Check if Unity Bridge is installed
 */
export async function isUnityBridgeInstalled(projectPath: string): Promise<boolean> {
  const bridgePath = path.join(
    projectPath,
    'Assets',
    'Editor',
    'Squido.JungleXRKit.Assistant.UnityBridge',
    'JungleAssistantUnityBridge.cs'
  );
  return await fs.pathExists(bridgePath);
}

/**
 * Generate a Unity-compatible GUID for .meta files
 */
function generateGuid(): string {
  // Generate a cryptographically secure random GUID (Unity format: 32 hex chars)
  return randomBytes(16).toString('hex');
}

/**
 * Read Unity packages from manifest.json
 */
export async function readUnityPackages(projectPath: string): Promise<{
  success: boolean;
  packages?: Array<{ name: string; version: string }>;
  error?: string;
}> {
  // Validate projectPath exists and is a directory
  if (!projectPath) {
    return {
      success: false,
      error: 'Project path is required',
    };
  }

  if (!(await fs.pathExists(projectPath))) {
    return {
      success: false,
      error: 'Project path does not exist',
    };
  }

  const stats = await fs.stat(projectPath);
  if (!stats.isDirectory()) {
    return {
      success: false,
      error: 'Project path is not a directory',
    };
  }

  const manifestPath = path.join(projectPath, 'Packages', 'manifest.json');

  if (!(await fs.pathExists(manifestPath))) {
    return {
      success: false,
      error: 'manifest.json not found',
    };
  }

  try {
    const content = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);
    const dependencies = manifest.dependencies || {};

    const packages = Object.entries(dependencies).map(([name, version]) => ({
      name,
      version: version as string,
    }));

    return {
      success: true,
      packages,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Build Unity command for a tweak action
 */
export function buildTweakCommand(
  editorPath: string,
  projectPath: string,
  action: string,
  params: TweakParams,
  logFilePath: string
): string[] {
  const args = [
    '-batchmode',
    '-quit',
    '-projectPath',
    projectPath,
    '-logFile',
    logFilePath,
  ];

  switch (action) {
    case 'add-define':
      args.push('-executeMethod', 'Squido.JungleXRKit.Assistant.UnityBridge.JungleAssistantUnityBridge.AddDefineSymbol');
      if (params.targetGroup) {
        args.push('-jaTargetGroup', params.targetGroup);
      }
      if (params.symbol) {
        args.push('-jaDefine', params.symbol);
      }
      break;

    case 'remove-define':
      args.push('-executeMethod', 'Squido.JungleXRKit.Assistant.UnityBridge.JungleAssistantUnityBridge.RemoveDefineSymbol');
      if (params.targetGroup) {
        args.push('-jaTargetGroup', params.targetGroup);
      }
      if (params.symbol) {
        args.push('-jaDefine', params.symbol);
      }
      break;

    case 'set-backend':
      args.push('-executeMethod', 'Squido.JungleXRKit.Assistant.UnityBridge.JungleAssistantUnityBridge.SetScriptingBackend');
      if (params.targetGroup) {
        args.push('-jaTargetGroup', params.targetGroup);
      }
      if (params.backend) {
        args.push('-jaBackend', params.backend);
      }
      break;

    case 'switch-build-target':
      args.push('-executeMethod', 'Squido.JungleXRKit.Assistant.UnityBridge.JungleAssistantUnityBridge.SwitchBuildTarget');
      if (params.buildTarget) {
        args.push('-jaBuildTarget', params.buildTarget);
      }
      break;

    case 'upm-resolve':
      args.push('-executeMethod', 'Squido.JungleXRKit.Assistant.UnityBridge.JungleAssistantUnityBridge.NoopValidate');
      break;

    default:
      throw new Error(`Unknown tweak action: ${action}`);
  }

  return args;
}

/**
 * Get human-readable description of a tweak action
 */
export function getTweakDescription(action: string, params: TweakParams): string {
  switch (action) {
    case 'add-define':
      return `Add define symbol '${params.symbol}' to ${params.targetGroup}`;
    case 'remove-define':
      return `Remove define symbol '${params.symbol}' from ${params.targetGroup}`;
    case 'set-backend':
      return `Set scripting backend to ${params.backend} for ${params.targetGroup}`;
    case 'switch-build-target':
      return `Switch build target to ${params.buildTarget}`;
    case 'upm-resolve':
      return 'Resolve Unity Package Manager dependencies';
    case 'install-bridge':
      return 'Install Unity Bridge for safe project tweaks';
    default:
      return action;
  }
}
