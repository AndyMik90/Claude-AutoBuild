import * as fs from 'fs-extra';
import * as path from 'path';
import { execSync } from 'child_process';

export interface UnityDoctorCheck {
  id: string;
  category: 'project' | 'editor' | 'toolchain' | 'packages' | 'git';
  name: string;
  status: 'success' | 'warning' | 'error' | 'info';
  message: string;
  details?: string;
  actionable?: boolean;
  fixAction?: string; // Fix action ID if this check can be auto-fixed
}

export interface UnityDoctorReport {
  timestamp: string;
  checks: UnityDoctorCheck[];
  summary: {
    success: number;
    warning: number;
    error: number;
    info: number;
  };
}

export interface AndroidToolchainInfo {
  source: 'embedded' | 'environment' | 'not-found';
  jdkPath?: string;
  sdkPath?: string;
  ndkPath?: string;
  gradlePath?: string;
}

/**
 * Run all Unity Doctor checks for a project
 */
export async function runUnityDoctorChecks(
  projectPath: string,
  editorPath?: string
): Promise<UnityDoctorReport> {
  const checks: UnityDoctorCheck[] = [];

  // Project checks
  checks.push(...(await checkUnityProject(projectPath)));

  // Editor checks (if editor path provided)
  if (editorPath) {
    checks.push(...(await checkUnityEditor(editorPath, projectPath)));
  }

  // Package checks
  checks.push(...(await checkUnityPackages(projectPath)));

  // Git checks
  checks.push(...(await checkGitStatus(projectPath)));

  const summary = {
    success: checks.filter((c) => c.status === 'success').length,
    warning: checks.filter((c) => c.status === 'warning').length,
    error: checks.filter((c) => c.status === 'error').length,
    info: checks.filter((c) => c.status === 'info').length,
  };

  return {
    timestamp: new Date().toISOString(),
    checks,
    summary,
  };
}

/**
 * Check Unity project status
 */
async function checkUnityProject(projectPath: string): Promise<UnityDoctorCheck[]> {
  const checks: UnityDoctorCheck[] = [];

  // Check if Unity project
  const projectVersionPath = path.join(projectPath, 'ProjectSettings', 'ProjectVersion.txt');
  if (await fs.pathExists(projectVersionPath)) {
    try {
      const content = await fs.readFile(projectVersionPath, 'utf-8');
      const versionMatch = content.match(/m_EditorVersion:\s*(.+)/);
      if (versionMatch) {
        const version = versionMatch[1].trim();
        checks.push({
          id: 'project-detected',
          category: 'project',
          name: 'Unity Project Detected',
          status: 'success',
          message: `Unity ${version}`,
          details: projectPath,
        });
      }
    } catch (error) {
      checks.push({
        id: 'project-version-read-error',
        category: 'project',
        name: 'Project Version',
        status: 'error',
        message: `Could not read ProjectVersion.txt at ${projectVersionPath}`,
        details: (error as Error).message,
      });
    }
  } else {
    checks.push({
      id: 'not-unity-project',
      category: 'project',
      name: 'Unity Project',
      status: 'error',
      message: 'Not a Unity project',
      details: 'ProjectSettings/ProjectVersion.txt not found',
    });
  }

  // Check Unity Bridge installation
  const bridgePath = path.join(
    projectPath,
    'Assets',
    'Editor',
    'Squido.JungleXRKit.Assistant.UnityBridge',
    'JungleAssistantUnityBridge.cs'
  );
  if (await fs.pathExists(bridgePath)) {
    checks.push({
      id: 'bridge-installed',
      category: 'project',
      name: 'Unity Bridge',
      status: 'success',
      message: 'Installed',
      details: 'Unity Bridge is available for safe project tweaks',
    });
  } else {
    checks.push({
      id: 'bridge-not-installed',
      category: 'project',
      name: 'Unity Bridge',
      status: 'warning',
      message: 'Not installed',
      details: 'Install Unity Bridge to enable safe project tweaks (define symbols, scripting backend, etc.)',
      actionable: true,
      fixAction: 'install-bridge',
    });
  }

  return checks;
}

/**
 * Check Unity Editor installation and Android toolchain
 */
async function checkUnityEditor(editorPath: string, projectPath: string): Promise<UnityDoctorCheck[]> {
  const checks: UnityDoctorCheck[] = [];

  // Check if editor path exists
  if (!(await fs.pathExists(editorPath))) {
    checks.push({
      id: 'editor-not-found',
      category: 'editor',
      name: 'Unity Editor',
      status: 'error',
      message: 'Editor not found',
      details: editorPath,
    });
    return checks;
  }

  // Get editor root
  const editorRoot = getEditorRoot(editorPath);

  // Detect editor version
  const editorVersion = await detectEditorVersion(editorPath, editorRoot);
  if (editorVersion) {
    checks.push({
      id: 'editor-version',
      category: 'editor',
      name: 'Unity Editor Version',
      status: 'info',
      message: editorVersion,
      details: editorPath,
    });

    // Compare with project version
    const projectVersionPath = path.join(projectPath, 'ProjectSettings', 'ProjectVersion.txt');
    if (await fs.pathExists(projectVersionPath)) {
      try {
        const content = await fs.readFile(projectVersionPath, 'utf-8');
        const versionMatch = content.match(/m_EditorVersion:\s*(.+)/);
        if (versionMatch) {
          const projectVersion = versionMatch[1].trim();
          const mismatch = compareVersions(projectVersion, editorVersion);
          if (mismatch) {
            checks.push({
              id: 'version-mismatch',
              category: 'editor',
              name: 'Version Match',
              status: mismatch.severity === 'critical' ? 'error' : 'warning',
              message: mismatch.message,
              details: `Project: ${projectVersion}, Editor: ${editorVersion}`,
            });
          } else {
            checks.push({
              id: 'version-match',
              category: 'editor',
              name: 'Version Match',
              status: 'success',
              message: 'Editor matches project version',
            });
          }
        }
      } catch (error) {
        // Ignore project version read errors (already handled in project checks)
      }
    }
  }

  // Check Android module
  const androidModuleCheck = await checkAndroidModule(editorRoot);
  checks.push(androidModuleCheck);

  // If Android module exists, check toolchain
  if (androidModuleCheck.status === 'success') {
    const toolchainInfo = await detectAndroidToolchain(editorRoot);
    checks.push(...formatToolchainChecks(toolchainInfo));
  }

  return checks;
}

/**
 * Check Unity packages status
 */
async function checkUnityPackages(projectPath: string): Promise<UnityDoctorCheck[]> {
  const checks: UnityDoctorCheck[] = [];

  const manifestPath = path.join(projectPath, 'Packages', 'manifest.json');
  if (await fs.pathExists(manifestPath)) {
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content);
      const depCount = Object.keys(manifest.dependencies || {}).length;

      checks.push({
        id: 'packages-manifest',
        category: 'packages',
        name: 'Package Manifest',
        status: 'success',
        message: `${depCount} dependencies`,
        details: manifestPath,
      });

      // Check for XR packages (Quest hints)
      const xrPackages = Object.keys(manifest.dependencies || {}).filter(
        (pkg) =>
          pkg.includes('xr.openxr') || pkg.includes('xr.oculus') || pkg.includes('xr.management')
      );
      if (xrPackages.length > 0) {
        checks.push({
          id: 'xr-packages-detected',
          category: 'packages',
          name: 'XR Packages',
          status: 'info',
          message: `${xrPackages.length} XR packages detected`,
          details: xrPackages.join(', '),
        });
      }
    } catch (error) {
      checks.push({
        id: 'packages-manifest-error',
        category: 'packages',
        name: 'Package Manifest',
        status: 'error',
        message: 'Invalid manifest.json',
        details: (error as Error).message,
      });
    }
  } else {
    checks.push({
      id: 'packages-manifest-missing',
      category: 'packages',
      name: 'Package Manifest',
      status: 'warning',
      message: 'manifest.json not found',
      details: 'Packages directory may not be initialized',
    });
  }

  // Check packages-lock.json
  const lockPath = path.join(projectPath, 'Packages', 'packages-lock.json');
  if (await fs.pathExists(lockPath)) {
    checks.push({
      id: 'packages-lock',
      category: 'packages',
      name: 'Package Lock',
      status: 'success',
      message: 'packages-lock.json present',
    });
  } else {
    checks.push({
      id: 'packages-lock-missing',
      category: 'packages',
      name: 'Package Lock',
      status: 'info',
      message: 'packages-lock.json not found',
      details: 'Run UPM Resolve to generate lock file',
      actionable: true,
      fixAction: 'upm-resolve',
    });
  }

  return checks;
}

/**
 * Check git status
 */
async function checkGitStatus(projectPath: string): Promise<UnityDoctorCheck[]> {
  const checks: UnityDoctorCheck[] = [];

  const gitDir = path.join(projectPath, '.git');
  if (!(await fs.pathExists(gitDir))) {
    checks.push({
      id: 'git-not-repo',
      category: 'git',
      name: 'Git Repository',
      status: 'info',
      message: 'Not a git repository',
    });
    return checks;
  }

  try {
    // Check current branch
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
    }).trim();

    checks.push({
      id: 'git-branch',
      category: 'git',
      name: 'Git Branch',
      status: 'info',
      message: branch,
    });

    // Check if working directory is clean
    const status = execSync('git status --porcelain', {
      cwd: projectPath,
      encoding: 'utf-8',
    }).trim();

    if (status === '') {
      checks.push({
        id: 'git-status',
        category: 'git',
        name: 'Working Directory',
        status: 'success',
        message: 'Clean',
        details: 'No uncommitted changes',
      });
    } else {
      const lines = status.split('\n').length;
      checks.push({
        id: 'git-status',
        category: 'git',
        name: 'Working Directory',
        status: 'warning',
        message: 'Dirty',
        details: `${lines} uncommitted changes. Consider committing before applying tweaks.`,
      });
    }

    // Get HEAD sha
    const sha = execSync('git rev-parse --short HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
    }).trim();

    checks.push({
      id: 'git-head',
      category: 'git',
      name: 'HEAD Commit',
      status: 'info',
      message: sha,
    });
  } catch (error) {
    checks.push({
      id: 'git-error',
      category: 'git',
      name: 'Git Status',
      status: 'error',
      message: 'Failed to check git status',
      details: (error as Error).message,
    });
  }

  return checks;
}

/**
 * Get editor root directory from editor executable path
 */
function getEditorRoot(editorPath: string): string {
  if (process.platform === 'darwin') {
    // macOS: /Applications/Unity/Hub/Editor/2021.3.0f1/Unity.app/Contents/MacOS/Unity
    // -> /Applications/Unity/Hub/Editor/2021.3.0f1/Unity.app/Contents
    const contentsIndex = editorPath.indexOf('Contents');
    if (contentsIndex !== -1) {
      return editorPath.substring(0, contentsIndex + 'Contents'.length);
    }
    // Fallback: assume Unity.app/Contents structure
    return path.join(path.dirname(path.dirname(editorPath)), 'Contents');
  } else {
    // Windows/Linux: .../Editor/Unity.exe or .../Editor/Unity
    // -> .../Editor
    return path.dirname(editorPath);
  }
}

/**
 * Detect Unity Editor version
 */
async function detectEditorVersion(editorPath: string, editorRoot: string): Promise<string | null> {
  // Try reading version from package.json (Unity Hub installed editors)
  const packageJsonPath = path.join(path.dirname(editorRoot), 'package.json');

  if (await fs.pathExists(packageJsonPath)) {
    try {
      const pkg = await fs.readJson(packageJsonPath);
      if (pkg.version) {
        return pkg.version;
      }
    } catch (error) {
      // Ignore
    }
  }

  // Try reading from Unity version file (Unity Hub)
  const versionPath = path.join(path.dirname(editorRoot), 'UnityVersion.txt');

  if (await fs.pathExists(versionPath)) {
    try {
      const version = (await fs.readFile(versionPath, 'utf-8')).trim();
      if (version) {
        return version;
      }
    } catch (error) {
      // Ignore
    }
  }

  // Fallback: extract from path (e.g., ".../2021.3.0f1/Editor/...")
  const pathSegments = editorPath.split(path.sep);
  for (const segment of pathSegments) {
    // Match Unity version format with case-insensitive letters (e.g., 2021.3.0f1, 2021.3.0F1)
    if (/^\d{4}\.\d+\.\d+[a-zA-Z]\d+$/.test(segment)) {
      return segment;
    }
  }

  return null;
}

/**
 * Compare Unity versions and determine mismatch severity
 */
function compareVersions(
  projectVersion: string,
  editorVersion: string
): { severity: 'critical' | 'moderate' | 'minor'; message: string } | null {
  if (projectVersion === editorVersion) {
    return null;
  }

  // Parse versions (e.g., "2021.3.0f1", "2021.3.15f1 LTS")
  const parseVersion = (v: string) => {
    // Strip LTS suffix if present
    const cleanVersion = v.replace(/\s+LTS$/i, '').trim();
    // Match Unity version format with case-insensitive letters
    const match = cleanVersion.match(/^(\d+)\.(\d+)\.(\d+)([a-zA-Z])(\d+)$/);
    if (!match) return null;
    return {
      major: parseInt(match[1]),
      minor: parseInt(match[2]),
      patch: parseInt(match[3]),
      type: match[4].toLowerCase(),
      build: parseInt(match[5]),
    };
  };

  const pv = parseVersion(projectVersion);
  const ev = parseVersion(editorVersion);

  if (!pv || !ev) {
    return {
      severity: 'moderate',
      message: 'Version format mismatch',
    };
  }

  // Major version mismatch (e.g., 2020 vs 2021) - critical
  if (pv.major !== ev.major) {
    return {
      severity: 'critical',
      message: 'Major version mismatch - may cause compatibility issues',
    };
  }

  // Minor version mismatch (e.g., 2021.2 vs 2021.3) - moderate
  if (pv.minor !== ev.minor) {
    return {
      severity: 'moderate',
      message: 'Minor version mismatch - may require project upgrade',
    };
  }

  // Patch/build mismatch - minor
  return {
    severity: 'minor',
    message: 'Patch version mismatch - usually harmless',
  };
}

/**
 * Check if Android module is installed
 */
async function checkAndroidModule(editorRoot: string): Promise<UnityDoctorCheck> {
  const possiblePaths =
    process.platform === 'darwin'
      ? [
          path.join(editorRoot, 'PlaybackEngines', 'AndroidPlayer'),
          path.join(path.dirname(editorRoot), 'PlaybackEngines', 'AndroidPlayer'),
        ]
      : [
          path.join(editorRoot, 'Data', 'PlaybackEngines', 'AndroidPlayer'),
          path.join(editorRoot, 'PlaybackEngines', 'AndroidPlayer'),
        ];

  for (const androidPath of possiblePaths) {
    if (await fs.pathExists(androidPath)) {
      return {
        id: 'android-module',
        category: 'toolchain',
        name: 'Android Module',
        status: 'success',
        message: 'Installed',
        details: androidPath,
      };
    }
  }

  return {
    id: 'android-module-missing',
    category: 'toolchain',
    name: 'Android Module',
    status: 'error',
    message: 'Not installed',
    details: 'Install Android Build Support module via Unity Hub to build for Android/Quest',
  };
}

/**
 * Detect Android toolchain (SDK, NDK, JDK, Gradle)
 */
export async function detectAndroidToolchain(editorRoot: string): Promise<AndroidToolchainInfo> {
  const info: AndroidToolchainInfo = {
    source: 'not-found',
  };

  // Check embedded toolchain first (Unity's bundled tools)
  const possibleAndroidPlayerPaths =
    process.platform === 'darwin'
      ? [
          path.join(editorRoot, 'PlaybackEngines', 'AndroidPlayer'),
          path.join(path.dirname(editorRoot), 'PlaybackEngines', 'AndroidPlayer'),
        ]
      : [
          path.join(editorRoot, 'Data', 'PlaybackEngines', 'AndroidPlayer'),
          path.join(editorRoot, 'PlaybackEngines', 'AndroidPlayer'),
        ];

  for (const androidPlayerPath of possibleAndroidPlayerPaths) {
    if (await fs.pathExists(androidPlayerPath)) {
      // Check for embedded JDK
      const jdkPaths = [
        path.join(androidPlayerPath, 'OpenJDK'),
        path.join(androidPlayerPath, 'Tools', 'OpenJDK'),
      ];
      for (const jdkPath of jdkPaths) {
        if (await fs.pathExists(jdkPath)) {
          info.jdkPath = jdkPath;
          break;
        }
      }

      // Check for embedded SDK
      const sdkPath = path.join(androidPlayerPath, 'SDK');
      if (await fs.pathExists(sdkPath)) {
        info.sdkPath = sdkPath;
      }

      // Check for embedded NDK
      const ndkPath = path.join(androidPlayerPath, 'NDK');
      if (await fs.pathExists(ndkPath)) {
        info.ndkPath = ndkPath;
      }

      // Check for embedded Gradle
      const gradlePaths = [
        path.join(androidPlayerPath, 'Tools', 'gradle'),
        path.join(androidPlayerPath, 'gradle'),
      ];
      for (const gradlePath of gradlePaths) {
        if (await fs.pathExists(gradlePath)) {
          info.gradlePath = gradlePath;
          break;
        }
      }

      if (info.jdkPath || info.sdkPath || info.ndkPath || info.gradlePath) {
        info.source = 'embedded';
      }
      break;
    }
  }

  // Fallback to environment variables if embedded not found
  if (info.source === 'not-found') {
    const sdkEnv = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
    const ndkEnv = process.env.ANDROID_NDK_ROOT;
    const jdkEnv = process.env.JAVA_HOME;

    if (sdkEnv && (await fs.pathExists(sdkEnv))) {
      info.sdkPath = sdkEnv;
      info.source = 'environment';

      // Check for NDK in SDK directory
      if (!ndkEnv) {
        const ndkDir = path.join(sdkEnv, 'ndk');
        if (await fs.pathExists(ndkDir)) {
          const ndkVersions = await fs.readdir(ndkDir);
          if (ndkVersions.length > 0) {
            // Choose the highest (lexicographically last) NDK version to ensure deterministic selection
            const sortedNdkVersions = ndkVersions.slice().sort();
            const selectedNdkVersion = sortedNdkVersions[sortedNdkVersions.length - 1];
            info.ndkPath = path.join(ndkDir, selectedNdkVersion);
          }
        }
      }
    }

    if (ndkEnv && (await fs.pathExists(ndkEnv))) {
      info.ndkPath = ndkEnv;
      info.source = 'environment';
    }

    if (jdkEnv && (await fs.pathExists(jdkEnv))) {
      info.jdkPath = jdkEnv;
      info.source = 'environment';
    }
  }

  return info;
}

/**
 * Format toolchain info into doctor checks
 */
function formatToolchainChecks(info: AndroidToolchainInfo): UnityDoctorCheck[] {
  const checks: UnityDoctorCheck[] = [];

  const sourceLabel = info.source === 'embedded' ? 'Embedded' : info.source === 'environment' ? 'Environment' : 'Not Found';

  checks.push({
    id: 'toolchain-source',
    category: 'toolchain',
    name: 'Toolchain Source',
    status: 'info',
    message: sourceLabel,
    details:
      info.source === 'embedded'
        ? 'Using Unity embedded toolchain'
        : info.source === 'environment'
        ? 'Using environment variables'
        : 'No toolchain detected',
  });

  checks.push({
    id: 'toolchain-jdk',
    category: 'toolchain',
    name: 'JDK',
    status: info.jdkPath ? 'success' : 'warning',
    message: info.jdkPath ? 'Found' : 'Not found',
    details: info.jdkPath || 'Set JAVA_HOME or install Android Build Support module',
  });

  checks.push({
    id: 'toolchain-sdk',
    category: 'toolchain',
    name: 'Android SDK',
    status: info.sdkPath ? 'success' : 'warning',
    message: info.sdkPath ? 'Found' : 'Not found',
    details: info.sdkPath || 'Set ANDROID_SDK_ROOT or install Android Build Support module',
  });

  checks.push({
    id: 'toolchain-ndk',
    category: 'toolchain',
    name: 'Android NDK',
    status: info.ndkPath ? 'success' : 'warning',
    message: info.ndkPath ? 'Found' : 'Not found',
    details: info.ndkPath || 'Set ANDROID_NDK_ROOT or install NDK via SDK Manager',
  });

  checks.push({
    id: 'toolchain-gradle',
    category: 'toolchain',
    name: 'Gradle',
    status: info.gradlePath ? 'success' : 'info',
    message: info.gradlePath ? 'Found' : 'Not found (Unity will download)',
    details: info.gradlePath || 'Unity will download Gradle automatically when building',
  });

  return checks;
}

/**
 * Get diagnostic text summary for copy/paste
 */
export function getDiagnosticsSummary(report: UnityDoctorReport): string {
  const lines: string[] = [];
  lines.push('=== Unity Doctor Diagnostics ===');
  lines.push(`Generated: ${new Date(report.timestamp).toLocaleString()}`);
  lines.push('');

  const categories: Array<'project' | 'editor' | 'toolchain' | 'packages' | 'git'> = [
    'project',
    'editor',
    'toolchain',
    'packages',
    'git',
  ];

  for (const category of categories) {
    const categoryChecks = report.checks.filter((c) => c.category === category);
    if (categoryChecks.length === 0) continue;

    lines.push(`[${category.toUpperCase()}]`);
    for (const check of categoryChecks) {
      const icon =
        check.status === 'success'
          ? '✅'
          : check.status === 'warning'
          ? '⚠️'
          : check.status === 'error'
          ? '❌'
          : 'ℹ️';
      lines.push(`${icon} ${check.name}: ${check.message}`);
      if (check.details) {
        lines.push(`   ${check.details}`);
      }
    }
    lines.push('');
  }

  lines.push('=== Summary ===');
  lines.push(`Success: ${report.summary.success}`);
  lines.push(`Warning: ${report.summary.warning}`);
  lines.push(`Error: ${report.summary.error}`);
  lines.push(`Info: ${report.summary.info}`);

  return lines.join('\n');
}
