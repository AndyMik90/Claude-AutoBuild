import { ipcMain, BrowserWindow, shell, app } from 'electron';
import { IPC_CHANNELS, AUTO_BUILD_PATHS, DEFAULT_APP_SETTINGS, DEFAULT_FEATURE_MODELS, DEFAULT_FEATURE_THINKING, MODEL_ID_MAP, THINKING_BUDGET_MAP } from '../../../shared/constants';
import type { IPCResult, WorktreeStatus, WorktreeDiff, WorktreeDiffFile, WorktreeMergeResult, WorktreeDiscardResult, WorktreeListResult, WorktreeListItem, SupportedIDE, SupportedTerminal, AppSettings } from '../../../shared/types';
import path from 'path';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { execSync, execFileSync, spawn, spawnSync, exec, execFile } from 'child_process';
import { projectStore } from '../../project-store';
import { getConfiguredPythonPath, PythonEnvManager, pythonEnvManager as pythonEnvManagerSingleton } from '../../python-env-manager';
import { getEffectiveSourcePath } from '../../auto-claude-updater';
import { getProfileEnv } from '../../rate-limit-detector';
import { findTaskAndProject } from './shared';
import { parsePythonCommand } from '../../python-detector';
import { getToolPath } from '../../cli-tool-manager';
import { promisify } from 'util';

/**
 * Read utility feature settings (for commit message, merge resolver) from settings file
 */
function getUtilitySettings(): { model: string; modelId: string; thinkingLevel: string; thinkingBudget: number | null } {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');

  try {
    if (existsSync(settingsPath)) {
      const content = readFileSync(settingsPath, 'utf-8');
      const settings: AppSettings = { ...DEFAULT_APP_SETTINGS, ...JSON.parse(content) };

      // Get utility-specific settings
      const featureModels = settings.featureModels || DEFAULT_FEATURE_MODELS;
      const featureThinking = settings.featureThinking || DEFAULT_FEATURE_THINKING;

      const model = featureModels.utility || DEFAULT_FEATURE_MODELS.utility;
      const thinkingLevel = featureThinking.utility || DEFAULT_FEATURE_THINKING.utility;

      return {
        model,
        modelId: MODEL_ID_MAP[model] || MODEL_ID_MAP.haiku,
        thinkingLevel,
        thinkingBudget: thinkingLevel in THINKING_BUDGET_MAP ? THINKING_BUDGET_MAP[thinkingLevel] : THINKING_BUDGET_MAP.low
      };
    }
  } catch (error) {
    // Log parse errors to help diagnose corrupted settings
    console.warn('[getUtilitySettings] Failed to parse settings.json:', error);
  }

  // Return defaults if settings file doesn't exist or fails to parse
  return {
    model: DEFAULT_FEATURE_MODELS.utility,
    modelId: MODEL_ID_MAP[DEFAULT_FEATURE_MODELS.utility],
    thinkingLevel: DEFAULT_FEATURE_THINKING.utility,
    thinkingBudget: THINKING_BUDGET_MAP[DEFAULT_FEATURE_THINKING.utility]
  };
}

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * IDE and Terminal detection and launching utilities
 */
interface DetectedTool {
  id: string;
  name: string;
  path: string;
  installed: boolean;
}

interface DetectedTools {
  ides: DetectedTool[];
  terminals: DetectedTool[];
}

// IDE detection paths (macOS, Windows, Linux)
// Comprehensive detection for 50+ IDEs and editors
const IDE_DETECTION: Partial<Record<SupportedIDE, { name: string; paths: Record<string, string[]>; commands: Record<string, string> }>> = {
  // Microsoft/VS Code Ecosystem
  vscode: {
    name: 'Visual Studio Code',
    paths: {
      darwin: ['/Applications/Visual Studio Code.app'],
      win32: [
        'C:\\Program Files\\Microsoft VS Code\\Code.exe',
        'C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe'
      ],
      linux: ['/usr/share/code', '/snap/bin/code', '/usr/bin/code']
    },
    commands: { darwin: 'code', win32: 'code.cmd', linux: 'code' }
  },
  visualstudio: {
    name: 'Visual Studio',
    paths: {
      darwin: [],
      win32: [
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\devenv.exe',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\Common7\\IDE\\devenv.exe',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\Common7\\IDE\\devenv.exe'
      ],
      linux: []
    },
    commands: { darwin: '', win32: 'devenv', linux: '' }
  },
  vscodium: {
    name: 'VSCodium',
    paths: {
      darwin: ['/Applications/VSCodium.app'],
      win32: ['C:\\Program Files\\VSCodium\\VSCodium.exe', 'C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\VSCodium\\VSCodium.exe'],
      linux: ['/usr/bin/codium', '/snap/bin/codium']
    },
    commands: { darwin: 'codium', win32: 'codium', linux: 'codium' }
  },
  // AI-Powered Editors
  cursor: {
    name: 'Cursor',
    paths: {
      darwin: ['/Applications/Cursor.app'],
      win32: ['C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\cursor\\Cursor.exe'],
      linux: ['/usr/bin/cursor', '/opt/Cursor/cursor']
    },
    commands: { darwin: 'cursor', win32: 'cursor.cmd', linux: 'cursor' }
  },
  windsurf: {
    name: 'Windsurf',
    paths: {
      darwin: ['/Applications/Windsurf.app'],
      win32: ['C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\Windsurf\\Windsurf.exe'],
      linux: ['/usr/bin/windsurf', '/opt/Windsurf/windsurf']
    },
    commands: { darwin: 'windsurf', win32: 'windsurf.cmd', linux: 'windsurf' }
  },
  zed: {
    name: 'Zed',
    paths: {
      darwin: ['/Applications/Zed.app'],
      win32: [],
      linux: ['/usr/bin/zed', '~/.local/bin/zed']
    },
    commands: { darwin: 'zed', win32: '', linux: 'zed' }
  },
  void: {
    name: 'Void',
    paths: {
      darwin: ['/Applications/Void.app'],
      win32: ['C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\Void\\Void.exe'],
      linux: ['/usr/bin/void']
    },
    commands: { darwin: 'void', win32: 'void', linux: 'void' }
  },
  // JetBrains IDEs
  intellij: {
    name: 'IntelliJ IDEA',
    paths: {
      darwin: ['/Applications/IntelliJ IDEA.app', '/Applications/IntelliJ IDEA CE.app'],
      win32: ['C:\\Program Files\\JetBrains\\IntelliJ IDEA*\\bin\\idea64.exe'],
      linux: ['/usr/bin/idea', '/snap/bin/intellij-idea-ultimate', '/snap/bin/intellij-idea-community']
    },
    commands: { darwin: 'idea', win32: 'idea64.exe', linux: 'idea' }
  },
  pycharm: {
    name: 'PyCharm',
    paths: {
      darwin: ['/Applications/PyCharm.app', '/Applications/PyCharm CE.app'],
      win32: ['C:\\Program Files\\JetBrains\\PyCharm*\\bin\\pycharm64.exe'],
      linux: ['/usr/bin/pycharm', '/snap/bin/pycharm-professional', '/snap/bin/pycharm-community']
    },
    commands: { darwin: 'pycharm', win32: 'pycharm64.exe', linux: 'pycharm' }
  },
  webstorm: {
    name: 'WebStorm',
    paths: {
      darwin: ['/Applications/WebStorm.app'],
      win32: ['C:\\Program Files\\JetBrains\\WebStorm*\\bin\\webstorm64.exe'],
      linux: ['/usr/bin/webstorm', '/snap/bin/webstorm']
    },
    commands: { darwin: 'webstorm', win32: 'webstorm64.exe', linux: 'webstorm' }
  },
  phpstorm: {
    name: 'PhpStorm',
    paths: {
      darwin: ['/Applications/PhpStorm.app'],
      win32: ['C:\\Program Files\\JetBrains\\PhpStorm*\\bin\\phpstorm64.exe'],
      linux: ['/usr/bin/phpstorm', '/snap/bin/phpstorm']
    },
    commands: { darwin: 'phpstorm', win32: 'phpstorm64.exe', linux: 'phpstorm' }
  },
  rubymine: {
    name: 'RubyMine',
    paths: {
      darwin: ['/Applications/RubyMine.app'],
      win32: ['C:\\Program Files\\JetBrains\\RubyMine*\\bin\\rubymine64.exe'],
      linux: ['/usr/bin/rubymine', '/snap/bin/rubymine']
    },
    commands: { darwin: 'rubymine', win32: 'rubymine64.exe', linux: 'rubymine' }
  },
  goland: {
    name: 'GoLand',
    paths: {
      darwin: ['/Applications/GoLand.app'],
      win32: ['C:\\Program Files\\JetBrains\\GoLand*\\bin\\goland64.exe'],
      linux: ['/usr/bin/goland', '/snap/bin/goland']
    },
    commands: { darwin: 'goland', win32: 'goland64.exe', linux: 'goland' }
  },
  clion: {
    name: 'CLion',
    paths: {
      darwin: ['/Applications/CLion.app'],
      win32: ['C:\\Program Files\\JetBrains\\CLion*\\bin\\clion64.exe'],
      linux: ['/usr/bin/clion', '/snap/bin/clion']
    },
    commands: { darwin: 'clion', win32: 'clion64.exe', linux: 'clion' }
  },
  rider: {
    name: 'Rider',
    paths: {
      darwin: ['/Applications/Rider.app'],
      win32: ['C:\\Program Files\\JetBrains\\Rider*\\bin\\rider64.exe'],
      linux: ['/usr/bin/rider', '/snap/bin/rider']
    },
    commands: { darwin: 'rider', win32: 'rider64.exe', linux: 'rider' }
  },
  datagrip: {
    name: 'DataGrip',
    paths: {
      darwin: ['/Applications/DataGrip.app'],
      win32: ['C:\\Program Files\\JetBrains\\DataGrip*\\bin\\datagrip64.exe'],
      linux: ['/usr/bin/datagrip', '/snap/bin/datagrip']
    },
    commands: { darwin: 'datagrip', win32: 'datagrip64.exe', linux: 'datagrip' }
  },
  fleet: {
    name: 'Fleet',
    paths: {
      darwin: ['/Applications/Fleet.app'],
      win32: ['C:\\Users\\%USERNAME%\\AppData\\Local\\JetBrains\\Toolbox\\apps\\Fleet\\ch-0\\*\\Fleet.exe'],
      linux: ['~/.local/share/JetBrains/Toolbox/apps/Fleet/ch-0/*/fleet']
    },
    commands: { darwin: 'fleet', win32: 'fleet', linux: 'fleet' }
  },
  androidstudio: {
    name: 'Android Studio',
    paths: {
      darwin: ['/Applications/Android Studio.app'],
      win32: ['C:\\Program Files\\Android\\Android Studio\\bin\\studio64.exe'],
      linux: ['/usr/bin/android-studio', '/snap/bin/android-studio', '/opt/android-studio/bin/studio.sh']
    },
    commands: { darwin: 'studio', win32: 'studio64.exe', linux: 'android-studio' }
  },
  rustrover: {
    name: 'RustRover',
    paths: {
      darwin: ['/Applications/RustRover.app'],
      win32: ['C:\\Program Files\\JetBrains\\RustRover*\\bin\\rustrover64.exe'],
      linux: ['/usr/bin/rustrover', '/snap/bin/rustrover']
    },
    commands: { darwin: 'rustrover', win32: 'rustrover64.exe', linux: 'rustrover' }
  },
  // Classic Text Editors
  sublime: {
    name: 'Sublime Text',
    paths: {
      darwin: ['/Applications/Sublime Text.app'],
      win32: ['C:\\Program Files\\Sublime Text\\subl.exe', 'C:\\Program Files\\Sublime Text 3\\subl.exe'],
      linux: ['/usr/bin/subl', '/snap/bin/subl']
    },
    commands: { darwin: 'subl', win32: 'subl.exe', linux: 'subl' }
  },
  vim: {
    name: 'Vim',
    paths: {
      darwin: ['/usr/bin/vim'],
      win32: ['C:\\Program Files\\Vim\\vim*\\vim.exe'],
      linux: ['/usr/bin/vim']
    },
    commands: { darwin: 'vim', win32: 'vim', linux: 'vim' }
  },
  neovim: {
    name: 'Neovim',
    paths: {
      darwin: ['/usr/local/bin/nvim', '/opt/homebrew/bin/nvim'],
      win32: ['C:\\Program Files\\Neovim\\bin\\nvim.exe'],
      linux: ['/usr/bin/nvim', '/snap/bin/nvim']
    },
    commands: { darwin: 'nvim', win32: 'nvim', linux: 'nvim' }
  },
  emacs: {
    name: 'Emacs',
    paths: {
      darwin: ['/Applications/Emacs.app', '/usr/local/bin/emacs', '/opt/homebrew/bin/emacs'],
      win32: ['C:\\Program Files\\Emacs\\bin\\emacs.exe'],
      linux: ['/usr/bin/emacs', '/snap/bin/emacs']
    },
    commands: { darwin: 'emacs', win32: 'emacs', linux: 'emacs' }
  },
  nano: {
    name: 'GNU Nano',
    paths: {
      darwin: ['/usr/bin/nano'],
      win32: [],
      linux: ['/usr/bin/nano']
    },
    commands: { darwin: 'nano', win32: '', linux: 'nano' }
  },
  helix: {
    name: 'Helix',
    paths: {
      darwin: ['/opt/homebrew/bin/hx', '/usr/local/bin/hx'],
      win32: ['C:\\Program Files\\Helix\\hx.exe'],
      linux: ['/usr/bin/hx', '~/.cargo/bin/hx']
    },
    commands: { darwin: 'hx', win32: 'hx', linux: 'hx' }
  },
  // Platform-Specific IDEs
  xcode: {
    name: 'Xcode',
    paths: {
      darwin: ['/Applications/Xcode.app'],
      win32: [],
      linux: []
    },
    commands: { darwin: 'xcode', win32: '', linux: '' }
  },
  eclipse: {
    name: 'Eclipse',
    paths: {
      darwin: ['/Applications/Eclipse.app'],
      win32: ['C:\\eclipse\\eclipse.exe', 'C:\\Program Files\\Eclipse\\eclipse.exe'],
      linux: ['/usr/bin/eclipse', '/snap/bin/eclipse']
    },
    commands: { darwin: 'eclipse', win32: 'eclipse', linux: 'eclipse' }
  },
  netbeans: {
    name: 'NetBeans',
    paths: {
      darwin: ['/Applications/NetBeans.app', '/Applications/Apache NetBeans.app'],
      win32: ['C:\\Program Files\\NetBeans*\\bin\\netbeans64.exe'],
      linux: ['/usr/bin/netbeans', '/snap/bin/netbeans']
    },
    commands: { darwin: 'netbeans', win32: 'netbeans64.exe', linux: 'netbeans' }
  },
  // macOS Editors
  nova: {
    name: 'Nova',
    paths: {
      darwin: ['/Applications/Nova.app'],
      win32: [],
      linux: []
    },
    commands: { darwin: 'nova', win32: '', linux: '' }
  },
  bbedit: {
    name: 'BBEdit',
    paths: {
      darwin: ['/Applications/BBEdit.app'],
      win32: [],
      linux: []
    },
    commands: { darwin: 'bbedit', win32: '', linux: '' }
  },
  textmate: {
    name: 'TextMate',
    paths: {
      darwin: ['/Applications/TextMate.app'],
      win32: [],
      linux: []
    },
    commands: { darwin: 'mate', win32: '', linux: '' }
  },
  // Windows Editors
  notepadpp: {
    name: 'Notepad++',
    paths: {
      darwin: [],
      win32: ['C:\\Program Files\\Notepad++\\notepad++.exe', 'C:\\Program Files (x86)\\Notepad++\\notepad++.exe'],
      linux: []
    },
    commands: { darwin: '', win32: 'notepad++', linux: '' }
  },
  // Linux Editors
  kate: {
    name: 'Kate',
    paths: {
      darwin: [],
      win32: [],
      linux: ['/usr/bin/kate', '/snap/bin/kate']
    },
    commands: { darwin: '', win32: '', linux: 'kate' }
  },
  gedit: {
    name: 'gedit',
    paths: {
      darwin: [],
      win32: [],
      linux: ['/usr/bin/gedit', '/snap/bin/gedit']
    },
    commands: { darwin: '', win32: '', linux: 'gedit' }
  },
  geany: {
    name: 'Geany',
    paths: {
      darwin: [],
      win32: [],
      linux: ['/usr/bin/geany']
    },
    commands: { darwin: '', win32: '', linux: 'geany' }
  },
  lapce: {
    name: 'Lapce',
    paths: {
      darwin: ['/Applications/Lapce.app'],
      win32: ['C:\\Users\\%USERNAME%\\AppData\\Local\\lapce\\Lapce.exe'],
      linux: ['/usr/bin/lapce', '~/.cargo/bin/lapce']
    },
    commands: { darwin: 'lapce', win32: 'lapce', linux: 'lapce' }
  },
  custom: {
    name: 'Custom IDE',
    paths: { darwin: [], win32: [], linux: [] },
    commands: { darwin: '', win32: '', linux: '' }
  }
};

// Terminal detection paths (macOS, Windows, Linux)
// Comprehensive detection for 30+ terminal emulators
const TERMINAL_DETECTION: Partial<Record<SupportedTerminal, { name: string; paths: Record<string, string[]>; commands: Record<string, string[]> }>> = {
  // System Defaults
  system: {
    name: 'System Terminal',
    paths: { darwin: ['/System/Applications/Utilities/Terminal.app'], win32: [], linux: [] },
    commands: {
      darwin: ['open', '-a', 'Terminal'],
      win32: ['cmd.exe', '/c', 'start', 'cmd.exe', '/K', 'cd', '/d'],
      linux: ['x-terminal-emulator', '-e', 'bash', '-c']
    }
  },
  // macOS Terminals
  terminal: {
    name: 'Terminal.app',
    paths: { darwin: ['/System/Applications/Utilities/Terminal.app'], win32: [], linux: [] },
    commands: { darwin: ['open', '-a', 'Terminal'], win32: [], linux: [] }
  },
  iterm2: {
    name: 'iTerm2',
    paths: { darwin: ['/Applications/iTerm.app'], win32: [], linux: [] },
    commands: { darwin: ['open', '-a', 'iTerm'], win32: [], linux: [] }
  },
  warp: {
    name: 'Warp',
    paths: { darwin: ['/Applications/Warp.app'], win32: [], linux: ['/usr/bin/warp-terminal'] },
    commands: { darwin: ['open', '-a', 'Warp'], win32: [], linux: ['warp-terminal'] }
  },
  ghostty: {
    name: 'Ghostty',
    paths: { darwin: ['/Applications/Ghostty.app'], win32: [], linux: ['/usr/bin/ghostty'] },
    commands: { darwin: ['open', '-a', 'Ghostty'], win32: [], linux: ['ghostty'] }
  },
  rio: {
    name: 'Rio',
    paths: { darwin: ['/Applications/Rio.app'], win32: [], linux: ['/usr/bin/rio'] },
    commands: { darwin: ['open', '-a', 'Rio'], win32: [], linux: ['rio'] }
  },
  // Windows Terminals
  windowsterminal: {
    name: 'Windows Terminal',
    paths: { darwin: [], win32: ['C:\\Users\\%USERNAME%\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe'], linux: [] },
    commands: { darwin: [], win32: ['wt.exe', '-d'], linux: [] }
  },
  powershell: {
    name: 'PowerShell',
    paths: { darwin: [], win32: ['C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'], linux: [] },
    commands: { darwin: [], win32: ['powershell.exe', '-NoExit', '-Command', 'cd'], linux: [] }
  },
  cmd: {
    name: 'Command Prompt',
    paths: { darwin: [], win32: ['C:\\Windows\\System32\\cmd.exe'], linux: [] },
    commands: { darwin: [], win32: ['cmd.exe', '/K', 'cd', '/d'], linux: [] }
  },
  conemu: {
    name: 'ConEmu',
    paths: { darwin: [], win32: ['C:\\Program Files\\ConEmu\\ConEmu64.exe', 'C:\\Program Files (x86)\\ConEmu\\ConEmu.exe'], linux: [] },
    commands: { darwin: [], win32: ['ConEmu64.exe', '-Dir'], linux: [] }
  },
  cmder: {
    name: 'Cmder',
    paths: { darwin: [], win32: ['C:\\cmder\\Cmder.exe', 'C:\\tools\\cmder\\Cmder.exe'], linux: [] },
    commands: { darwin: [], win32: ['Cmder.exe', '/START'], linux: [] }
  },
  gitbash: {
    name: 'Git Bash',
    paths: { darwin: [], win32: ['C:\\Program Files\\Git\\git-bash.exe'], linux: [] },
    commands: { darwin: [], win32: ['git-bash.exe', '--cd='], linux: [] }
  },
  // Linux Desktop Environment Terminals
  gnometerminal: {
    name: 'GNOME Terminal',
    paths: { darwin: [], win32: [], linux: ['/usr/bin/gnome-terminal'] },
    commands: { darwin: [], win32: [], linux: ['gnome-terminal', '--working-directory='] }
  },
  konsole: {
    name: 'Konsole',
    paths: { darwin: [], win32: [], linux: ['/usr/bin/konsole'] },
    commands: { darwin: [], win32: [], linux: ['konsole', '--workdir'] }
  },
  xfce4terminal: {
    name: 'XFCE4 Terminal',
    paths: { darwin: [], win32: [], linux: ['/usr/bin/xfce4-terminal'] },
    commands: { darwin: [], win32: [], linux: ['xfce4-terminal', '--working-directory='] }
  },
  'mate-terminal': {
    name: 'MATE Terminal',
    paths: { darwin: [], win32: [], linux: ['/usr/bin/mate-terminal'] },
    commands: { darwin: [], win32: [], linux: ['mate-terminal', '--working-directory='] }
  },
  // Linux Feature-rich Terminals
  terminator: {
    name: 'Terminator',
    paths: { darwin: [], win32: [], linux: ['/usr/bin/terminator'] },
    commands: { darwin: [], win32: [], linux: ['terminator', '--working-directory='] }
  },
  tilix: {
    name: 'Tilix',
    paths: { darwin: [], win32: [], linux: ['/usr/bin/tilix'] },
    commands: { darwin: [], win32: [], linux: ['tilix', '--working-directory='] }
  },
  guake: {
    name: 'Guake',
    paths: { darwin: [], win32: [], linux: ['/usr/bin/guake'] },
    commands: { darwin: [], win32: [], linux: ['guake', '--show', '-n', '--'] }
  },
  yakuake: {
    name: 'Yakuake',
    paths: { darwin: [], win32: [], linux: ['/usr/bin/yakuake'] },
    commands: { darwin: [], win32: [], linux: ['yakuake'] }
  },
  tilda: {
    name: 'Tilda',
    paths: { darwin: [], win32: [], linux: ['/usr/bin/tilda'] },
    commands: { darwin: [], win32: [], linux: ['tilda'] }
  },
  // GPU-Accelerated Cross-platform Terminals
  alacritty: {
    name: 'Alacritty',
    paths: {
      darwin: ['/Applications/Alacritty.app'],
      win32: ['C:\\Program Files\\Alacritty\\alacritty.exe', 'C:\\Users\\%USERNAME%\\scoop\\apps\\alacritty\\current\\alacritty.exe'],
      linux: ['/usr/bin/alacritty', '/snap/bin/alacritty']
    },
    commands: {
      darwin: ['open', '-a', 'Alacritty', '--args', '--working-directory'],
      win32: ['alacritty.exe', '--working-directory'],
      linux: ['alacritty', '--working-directory']
    }
  },
  kitty: {
    name: 'Kitty',
    paths: {
      darwin: ['/Applications/kitty.app'],
      win32: [],
      linux: ['/usr/bin/kitty']
    },
    commands: {
      darwin: ['open', '-a', 'kitty', '--args', '--directory'],
      win32: [],
      linux: ['kitty', '--directory']
    }
  },
  wezterm: {
    name: 'WezTerm',
    paths: {
      darwin: ['/Applications/WezTerm.app'],
      win32: ['C:\\Program Files\\WezTerm\\wezterm-gui.exe'],
      linux: ['/usr/bin/wezterm', '/usr/bin/wezterm-gui']
    },
    commands: {
      darwin: ['open', '-a', 'WezTerm', '--args', 'start', '--cwd'],
      win32: ['wezterm-gui.exe', 'start', '--cwd'],
      linux: ['wezterm', 'start', '--cwd']
    }
  },
  // Cross-Platform Terminals
  hyper: {
    name: 'Hyper',
    paths: {
      darwin: ['/Applications/Hyper.app'],
      win32: ['C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\Hyper\\Hyper.exe'],
      linux: ['/usr/bin/hyper', '/opt/Hyper/hyper']
    },
    commands: {
      darwin: ['open', '-a', 'Hyper'],
      win32: ['hyper.exe'],
      linux: ['hyper']
    }
  },
  tabby: {
    name: 'Tabby',
    paths: {
      darwin: ['/Applications/Tabby.app'],
      win32: ['C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\Tabby\\Tabby.exe'],
      linux: ['/usr/bin/tabby', '/opt/Tabby/tabby']
    },
    commands: {
      darwin: ['open', '-a', 'Tabby'],
      win32: ['Tabby.exe'],
      linux: ['tabby']
    }
  },
  contour: {
    name: 'Contour',
    paths: {
      darwin: ['/Applications/Contour.app'],
      win32: [],
      linux: ['/usr/bin/contour']
    },
    commands: {
      darwin: ['open', '-a', 'Contour'],
      win32: [],
      linux: ['contour']
    }
  },
  // Minimal/Suckless Terminals
  xterm: {
    name: 'xterm',
    paths: { darwin: [], win32: [], linux: ['/usr/bin/xterm'] },
    commands: { darwin: [], win32: [], linux: ['xterm', '-e', 'cd'] }
  },
  urxvt: {
    name: 'rxvt-unicode',
    paths: { darwin: [], win32: [], linux: ['/usr/bin/urxvt'] },
    commands: { darwin: [], win32: [], linux: ['urxvt', '-cd'] }
  },
  st: {
    name: 'st (suckless)',
    paths: { darwin: [], win32: [], linux: ['/usr/local/bin/st', '/usr/bin/st'] },
    commands: { darwin: [], win32: [], linux: ['st', '-d'] }
  },
  foot: {
    name: 'Foot',
    paths: { darwin: [], win32: [], linux: ['/usr/bin/foot'] },
    commands: { darwin: [], win32: [], linux: ['foot', '--working-directory='] }
  },
  // Specialty Terminals
  coolretroterm: {
    name: 'cool-retro-term',
    paths: { darwin: ['/Applications/cool-retro-term.app'], win32: [], linux: ['/usr/bin/cool-retro-term'] },
    commands: { darwin: ['open', '-a', 'cool-retro-term'], win32: [], linux: ['cool-retro-term'] }
  },
  // Multiplexers (commonly used as terminal environment)
  tmux: {
    name: 'tmux',
    paths: {
      darwin: ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux'],
      win32: [],
      linux: ['/usr/bin/tmux']
    },
    commands: { darwin: ['tmux'], win32: [], linux: ['tmux'] }
  },
  zellij: {
    name: 'Zellij',
    paths: {
      darwin: ['/opt/homebrew/bin/zellij', '/usr/local/bin/zellij'],
      win32: [],
      linux: ['/usr/bin/zellij', '~/.cargo/bin/zellij']
    },
    commands: { darwin: ['zellij'], win32: [], linux: ['zellij'] }
  },
  custom: {
    name: 'Custom Terminal',
    paths: { darwin: [], win32: [], linux: [] },
    commands: { darwin: [], win32: [], linux: [] }
  }
};

/**
 * Security helper functions for safe path handling
 */

/**
 * Escape single quotes in a path for use in AppleScript strings
 * This prevents command injection via malicious directory names
 */
function escapeAppleScriptPath(dirPath: string): string {
  // In AppleScript, single quotes are escaped by ending the string,
  // adding an escaped quote, and starting a new string: ' -> '\''
  return dirPath.replace(/'/g, "'\\''");
}

/**
 * Validate a path doesn't contain path traversal attempts after variable expansion
 */
function isPathSafe(expandedPath: string): boolean {
  // Normalize and check for path traversal
  const normalized = path.normalize(expandedPath);
  // Check for explicit traversal patterns
  if (normalized.includes('..')) {
    return false;
  }
  return true;
}

/**
 * Smart app detection using native OS APIs for faster, more comprehensive discovery
 */

// Cache for installed apps (refreshed on each detection call)
let installedAppsCache: Set<string> = new Set();

/**
 * macOS: Use Spotlight (mdfind) to quickly find all installed .app bundles
 */
async function detectMacApps(): Promise<Set<string>> {
  const apps = new Set<string>();
  try {
    // Use mdfind to query Spotlight for all applications - much faster than directory scanning
    // Timeout after 10 seconds to prevent hangs on systems with slow Spotlight indexing
    const { stdout } = await execAsync('mdfind -onlyin /Applications "kMDItemKind == Application" 2>/dev/null | head -500', { timeout: 10000 });
    const appPaths = stdout.trim().split('\n').filter(p => p);

    for (const appPath of appPaths) {
      // Extract app name from path (e.g., "/Applications/Visual Studio Code.app" -> "Visual Studio Code")
      const match = appPath.match(/\/([^/]+)\.app$/i);
      if (match) {
        apps.add(match[1].toLowerCase());
      }
    }
  } catch {
    // Fallback: scan /Applications directory
    try {
      const appDir = '/Applications';
      if (existsSync(appDir)) {
        const entries = readdirSync(appDir);
        for (const entry of entries) {
          if (entry.endsWith('.app')) {
            apps.add(entry.replace('.app', '').toLowerCase());
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }
  return apps;
}

/**
 * Windows: Check registry and common installation paths
 */
async function detectWindowsApps(): Promise<Set<string>> {
  const apps = new Set<string>();
  try {
    // Query registry for installed programs using PowerShell
    const { stdout } = await execAsync(
      `powershell -Command "Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Select-Object DisplayName | ConvertTo-Json"`,
      { timeout: 10000 }
    );
    const programs = JSON.parse(stdout);
    if (Array.isArray(programs)) {
      for (const prog of programs) {
        if (prog.DisplayName) {
          apps.add(prog.DisplayName.toLowerCase());
        }
      }
    }
  } catch {
    // Fallback: check common paths
    const commonPaths = [
      'C:\\Program Files',
      'C:\\Program Files (x86)',
      process.env.LOCALAPPDATA || ''
    ];
    for (const basePath of commonPaths) {
      if (basePath && existsSync(basePath)) {
        try {
          const entries = readdirSync(basePath);
          for (const entry of entries) {
            apps.add(entry.toLowerCase());
          }
        } catch {
          // Ignore errors
        }
      }
    }
  }
  return apps;
}

/**
 * Linux: Parse .desktop files from standard locations for fast app discovery
 */
async function detectLinuxApps(): Promise<Set<string>> {
  const apps = new Set<string>();
  const desktopDirs = [
    '/usr/share/applications',
    '/usr/local/share/applications',
    `${process.env.HOME}/.local/share/applications`,
    '/var/lib/flatpak/exports/share/applications',
    '/var/lib/snapd/desktop/applications'
  ];

  for (const dir of desktopDirs) {
    try {
      if (existsSync(dir)) {
        const files = readdirSync(dir);
        for (const file of files) {
          if (file.endsWith('.desktop')) {
            // Extract app name from .desktop filename
            const name = file.replace('.desktop', '').toLowerCase();
            apps.add(name);

            // Also try to read the Name= field from .desktop file for better matching
            try {
              const content = readFileSync(path.join(dir, file), 'utf-8');
              const nameMatch = content.match(/^Name=(.+)$/m);
              if (nameMatch) {
                apps.add(nameMatch[1].toLowerCase());
              }
            } catch {
              // Ignore read errors
            }
          }
        }
      }
    } catch {
      // Ignore directory errors
    }
  }

  // Also check common binary paths
  const binPaths = ['/usr/bin', '/usr/local/bin', '/snap/bin'];
  for (const binPath of binPaths) {
    try {
      if (existsSync(binPath)) {
        const bins = readdirSync(binPath);
        for (const bin of bins) {
          apps.add(bin.toLowerCase());
        }
      }
    } catch {
      // Ignore errors
    }
  }

  return apps;
}

/**
 * Check if an app is installed using the cached app list + specific path checks
 */
function isAppInstalled(
  appNames: string[],
  specificPaths: string[],
  platform: string
): { installed: boolean; foundPath: string } {
  // First, check the cached app list (fast)
  for (const name of appNames) {
    if (installedAppsCache.has(name.toLowerCase())) {
      return { installed: true, foundPath: '' };
    }
  }

  // Then check specific paths (for apps not in standard locations)
  for (const checkPath of specificPaths) {
    const expandedPath = checkPath
      .replace('%USERNAME%', process.env.USERNAME || process.env.USER || '')
      .replace('~', process.env.HOME || '');

    // Validate path doesn't contain traversal attempts after expansion
    if (!isPathSafe(expandedPath)) {
      console.warn('[detectTool] Skipping potentially unsafe path:', checkPath);
      continue;
    }

    // Handle glob patterns (e.g., JetBrains*) - just check if directory exists for base path
    const basePath = expandedPath.split('*')[0];
    if (existsSync(expandedPath) || (basePath !== expandedPath && existsSync(basePath))) {
      return { installed: true, foundPath: expandedPath };
    }
  }

  return { installed: false, foundPath: '' };
}

/**
 * Detect installed IDEs and terminals on the system
 * Uses smart platform-native detection for faster results
 */
async function detectInstalledTools(): Promise<DetectedTools> {
  const platform = process.platform as 'darwin' | 'win32' | 'linux';
  const ides: DetectedTool[] = [];
  const terminals: DetectedTool[] = [];

  // Build app cache using platform-native detection (fast!)
  console.log('[DevTools] Starting smart app detection...');
  const startTime = Date.now();

  if (platform === 'darwin') {
    installedAppsCache = await detectMacApps();
  } else if (platform === 'win32') {
    installedAppsCache = await detectWindowsApps();
  } else {
    installedAppsCache = await detectLinuxApps();
  }

  console.log(`[DevTools] Found ${installedAppsCache.size} apps in ${Date.now() - startTime}ms`);

  // Detect IDEs using cached app list + specific path checks
  for (const [id, config] of Object.entries(IDE_DETECTION)) {
    if (id === 'custom' || !config) continue;

    const paths = config.paths[platform] || [];
    // Generate search names from the config name and id
    const searchNames = [
      config.name.toLowerCase(),
      id.toLowerCase(),
      // Handle common variations
      config.name.replace(/\s+/g, '').toLowerCase(),
      config.name.replace(/\s+/g, '-').toLowerCase()
    ];

    const { installed, foundPath } = isAppInstalled(searchNames, paths, platform);

    // Also try command check if not found via app detection
    let finalInstalled = installed;
    if (!finalInstalled && config.commands[platform]) {
      try {
        if (platform === 'win32') {
          await execAsync(`where ${config.commands[platform]}`, { timeout: 2000 });
        } else {
          await execAsync(`which ${config.commands[platform]}`, { timeout: 2000 });
        }
        finalInstalled = true;
      } catch {
        // Command not found
      }
    }

    if (finalInstalled) {
      ides.push({
        id,
        name: config.name,
        path: foundPath,
        installed: true
      });
    }
  }

  // Detect Terminals using cached app list + specific path checks
  for (const [id, config] of Object.entries(TERMINAL_DETECTION)) {
    if (id === 'custom' || !config) continue;

    const paths = config.paths[platform] || [];
    const searchNames = [
      config.name.toLowerCase(),
      id.toLowerCase(),
      config.name.replace(/\s+/g, '').toLowerCase()
    ];

    const { installed, foundPath } = isAppInstalled(searchNames, paths, platform);

    if (installed) {
      terminals.push({
        id,
        name: config.name,
        path: foundPath,
        installed: true
      });
    }
  }

  // Always add system terminal as fallback
  if (!terminals.find(t => t.id === 'system')) {
    terminals.unshift({
      id: 'system',
      name: 'System Terminal',
      path: '',
      installed: true
    });
  }

  console.log(`[DevTools] Detection complete: ${ides.length} IDEs, ${terminals.length} terminals`);
  return { ides, terminals };
}

/**
 * Open a directory in the specified IDE
 */
async function openInIDE(dirPath: string, ide: SupportedIDE, customPath?: string): Promise<{ success: boolean; error?: string }> {
  const platform = process.platform as 'darwin' | 'win32' | 'linux';

  try {
    if (ide === 'custom' && customPath) {
      // Use custom IDE path with execFileAsync to prevent shell injection
      // Validate the custom path is a valid executable path
      if (!isPathSafe(customPath)) {
        return { success: false, error: 'Invalid custom IDE path' };
      }
      await execFileAsync(customPath, [dirPath]);
      return { success: true };
    }

    const config = IDE_DETECTION[ide];
    if (!config) {
      return { success: false, error: `Unknown IDE: ${ide}` };
    }

    const command = config.commands[platform];
    if (!command) {
      return { success: false, error: `IDE ${ide} is not supported on ${platform}` };
    }

    // Special handling for macOS .app bundles
    if (platform === 'darwin') {
      const appPath = config.paths.darwin?.[0];
      if (appPath && existsSync(appPath)) {
        // Use 'open' command with execFileAsync to prevent shell injection
        await execFileAsync('open', ['-a', path.basename(appPath, '.app'), dirPath]);
        return { success: true };
      }
    }

    // Special handling for Windows batch files (.cmd, .bat)
    // execFile doesn't search PATH, so we need shell: true for batch files
    if (platform === 'win32' && (command.endsWith('.cmd') || command.endsWith('.bat'))) {
      return new Promise((resolve) => {
        const child = spawn(command, [dirPath], {
          shell: true,
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
        resolve({ success: true });
      });
    }

    // Use command line tool with execFileAsync
    await execFileAsync(command, [dirPath]);
    return { success: true };
  } catch (error) {
    console.error(`Failed to open in IDE ${ide}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to open IDE' };
  }
}

/**
 * Open a directory in the specified terminal
 */
async function openInTerminal(dirPath: string, terminal: SupportedTerminal, customPath?: string): Promise<{ success: boolean; error?: string }> {
  const platform = process.platform as 'darwin' | 'win32' | 'linux';

  try {
    if (terminal === 'custom' && customPath) {
      // Use custom terminal path with execFileAsync to prevent shell injection
      if (!isPathSafe(customPath)) {
        return { success: false, error: 'Invalid custom terminal path' };
      }
      await execFileAsync(customPath, [dirPath]);
      return { success: true };
    }

    const config = TERMINAL_DETECTION[terminal];
    if (!config) {
      return { success: false, error: `Unknown terminal: ${terminal}` };
    }

    const commands = config.commands[platform];
    if (!commands || commands.length === 0) {
      // Fall back to opening the folder in system file manager
      await shell.openPath(dirPath);
      return { success: true };
    }

    if (platform === 'darwin') {
      // macOS: Use open command with the directory
      // Escape single quotes in dirPath to prevent AppleScript injection
      const escapedPath = escapeAppleScriptPath(dirPath);

      if (terminal === 'system') {
        // Use AppleScript to open Terminal.app at the directory
        const script = `tell application "Terminal" to do script "cd '${escapedPath}'"`;
        await execFileAsync('osascript', ['-e', script]);
      } else if (terminal === 'iterm2') {
        // Use AppleScript to open iTerm2 at the directory
        const script = `tell application "iTerm"
          create window with default profile
          tell current session of current window
            write text "cd '${escapedPath}'"
          end tell
        end tell`;
        await execFileAsync('osascript', ['-e', script]);
      } else if (terminal === 'warp') {
        // Warp can be opened with just the directory using execFileAsync
        await execFileAsync('open', ['-a', 'Warp', dirPath]);
      } else {
        // For other terminals, use execFileAsync with arguments array
        await execFileAsync(commands[0], [...commands.slice(1), dirPath]);
      }
    } else if (platform === 'win32') {
      // Windows: Start terminal at directory using spawn to avoid shell injection
      if (terminal === 'system') {
        // Use spawn with proper argument separation
        spawn('cmd.exe', ['/K', 'cd', '/d', dirPath], { detached: true, stdio: 'ignore' }).unref();
      } else if (commands.length > 0) {
        spawn(commands[0], [...commands.slice(1), dirPath], { detached: true, stdio: 'ignore' }).unref();
      }
    } else {
      // Linux: Use the configured terminal with execFileAsync
      if (terminal === 'system') {
        // Try common terminal emulators with proper argument arrays
        try {
          await execFileAsync('x-terminal-emulator', ['--working-directory', dirPath, '-e', 'bash']);
        } catch {
          try {
            await execFileAsync('gnome-terminal', ['--working-directory', dirPath]);
          } catch {
            // xterm doesn't have --working-directory, use -e with a script
            // Escape the path for shell use within the xterm command
            const escapedPath = escapeAppleScriptPath(dirPath);
            await execFileAsync('xterm', ['-e', `cd '${escapedPath}' && bash`]);
          }
        }
      } else {
        // Use execFileAsync with arguments array
        await execFileAsync(commands[0], [...commands.slice(1), dirPath]);
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`Failed to open in terminal ${terminal}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to open terminal' };
  }
}

/**
 * Read the stored base branch from task_metadata.json
 * This is the branch the task was created from (set by user during task creation)
 */
function getTaskBaseBranch(specDir: string): string | undefined {
  try {
    const metadataPath = path.join(specDir, 'task_metadata.json');
    if (existsSync(metadataPath)) {
      const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
      // Return baseBranch if explicitly set (not the __project_default__ marker)
      if (metadata.baseBranch && metadata.baseBranch !== '__project_default__') {
        return metadata.baseBranch;
      }
    }
  } catch (e) {
    console.warn('[getTaskBaseBranch] Failed to read task metadata:', e);
  }
  return undefined;
}

/**
 * Register worktree management handlers
 */
export function registerWorktreeHandlers(
  pythonEnvManager: PythonEnvManager,
  getMainWindow: () => BrowserWindow | null
): void {
  /**
   * Get the worktree status for a task
   * Per-spec architecture: Each spec has its own worktree at .worktrees/{spec-name}/
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_WORKTREE_STATUS,
    async (_, taskId: string): Promise<IPCResult<WorktreeStatus>> => {
      try {
        const { task, project } = findTaskAndProject(taskId);
        if (!task || !project) {
          return { success: false, error: 'Task not found' };
        }

        // Per-spec worktree path: .worktrees/{spec-name}/
        const worktreePath = path.join(project.path, '.worktrees', task.specId);

        if (!existsSync(worktreePath)) {
          return {
            success: true,
            data: { exists: false }
          };
        }

        // Get branch info from git
        try {
          // Get current branch in worktree
          const branch = execFileSync(getToolPath('git'), ['rev-parse', '--abbrev-ref', 'HEAD'], {
            cwd: worktreePath,
            encoding: 'utf-8'
          }).trim();

          // Get base branch - the current branch in the main project (where changes will be merged)
          // This matches the Python merge logic which merges into the user's current branch
          let baseBranch = 'main';
          try {
            baseBranch = execFileSync(getToolPath('git'), ['rev-parse', '--abbrev-ref', 'HEAD'], {
              cwd: project.path,
              encoding: 'utf-8'
            }).trim();
          } catch {
            baseBranch = 'main';
          }

          // Get commit count (cross-platform - no shell syntax)
          let commitCount = 0;
          try {
            const countOutput = execFileSync(getToolPath('git'), ['rev-list', '--count', `${baseBranch}..HEAD`], {
              cwd: worktreePath,
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'pipe']
            }).trim();
            commitCount = parseInt(countOutput, 10) || 0;
          } catch {
            commitCount = 0;
          }

          // Get diff stats
          let filesChanged = 0;
          let additions = 0;
          let deletions = 0;

          let diffStat = '';
          try {
            diffStat = execFileSync(getToolPath('git'), ['diff', '--stat', `${baseBranch}...HEAD`], {
              cwd: worktreePath,
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'pipe']
            }).trim();

            // Parse the summary line (e.g., "3 files changed, 50 insertions(+), 10 deletions(-)")
            const summaryMatch = diffStat.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
            if (summaryMatch) {
              filesChanged = parseInt(summaryMatch[1], 10) || 0;
              additions = parseInt(summaryMatch[2], 10) || 0;
              deletions = parseInt(summaryMatch[3], 10) || 0;
            }
          } catch {
            // Ignore diff errors
          }

          return {
            success: true,
            data: {
              exists: true,
              worktreePath,
              branch,
              baseBranch,
              commitCount,
              filesChanged,
              additions,
              deletions
            }
          };
        } catch (gitError) {
          console.error('Git error getting worktree status:', gitError);
          return {
            success: true,
            data: { exists: true, worktreePath }
          };
        }
      } catch (error) {
        console.error('Failed to get worktree status:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get worktree status'
        };
      }
    }
  );

  /**
   * Get the diff for a task's worktree
   * Per-spec architecture: Each spec has its own worktree at .worktrees/{spec-name}/
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_WORKTREE_DIFF,
    async (_, taskId: string): Promise<IPCResult<WorktreeDiff>> => {
      try {
        const { task, project } = findTaskAndProject(taskId);
        if (!task || !project) {
          return { success: false, error: 'Task not found' };
        }

        // Per-spec worktree path: .worktrees/{spec-name}/
        const worktreePath = path.join(project.path, '.worktrees', task.specId);

        if (!existsSync(worktreePath)) {
          return { success: false, error: 'No worktree found for this task' };
        }

        // Get base branch - the current branch in the main project (where changes will be merged)
        let baseBranch = 'main';
        try {
          baseBranch = execFileSync(getToolPath('git'), ['rev-parse', '--abbrev-ref', 'HEAD'], {
            cwd: project.path,
            encoding: 'utf-8'
          }).trim();
        } catch {
          baseBranch = 'main';
        }

        // Get the diff with file stats
        const files: WorktreeDiffFile[] = [];

        let numstat = '';
        let nameStatus = '';
        try {
          // Get numstat for additions/deletions per file (cross-platform)
          numstat = execFileSync(getToolPath('git'), ['diff', '--numstat', `${baseBranch}...HEAD`], {
            cwd: worktreePath,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
          }).trim();

          // Get name-status for file status (cross-platform)
          nameStatus = execFileSync(getToolPath('git'), ['diff', '--name-status', `${baseBranch}...HEAD`], {
            cwd: worktreePath,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
          }).trim();

          // Parse name-status to get file statuses
          const statusMap: Record<string, 'added' | 'modified' | 'deleted' | 'renamed'> = {};
          nameStatus.split('\n').filter(Boolean).forEach((line: string) => {
            const [status, ...pathParts] = line.split('\t');
            const filePath = pathParts.join('\t'); // Handle files with tabs in name
            switch (status[0]) {
              case 'A': statusMap[filePath] = 'added'; break;
              case 'M': statusMap[filePath] = 'modified'; break;
              case 'D': statusMap[filePath] = 'deleted'; break;
              case 'R': statusMap[pathParts[1] || filePath] = 'renamed'; break;
              default: statusMap[filePath] = 'modified';
            }
          });

          // Parse numstat for additions/deletions
          numstat.split('\n').filter(Boolean).forEach((line: string) => {
            const [adds, dels, filePath] = line.split('\t');
            files.push({
              path: filePath,
              status: statusMap[filePath] || 'modified',
              additions: parseInt(adds, 10) || 0,
              deletions: parseInt(dels, 10) || 0
            });
          });
        } catch (diffError) {
          console.error('Error getting diff:', diffError);
        }

        // Generate summary
        const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
        const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
        const summary = `${files.length} files changed, ${totalAdditions} insertions(+), ${totalDeletions} deletions(-)`;

        return {
          success: true,
          data: { files, summary }
        };
      } catch (error) {
        console.error('Failed to get worktree diff:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get worktree diff'
        };
      }
    }
  );

  /**
   * Merge the worktree changes into the main branch
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_WORKTREE_MERGE,
    async (_, taskId: string, options?: { noCommit?: boolean }): Promise<IPCResult<WorktreeMergeResult>> => {
      // Always log merge operations for debugging
      const debug = (...args: unknown[]) => {
        console.warn('[MERGE DEBUG]', ...args);
      };

      try {
        console.warn('[MERGE] Handler called with taskId:', taskId, 'options:', options);
        debug('Starting merge for taskId:', taskId, 'options:', options);

        // Ensure Python environment is ready
        if (!pythonEnvManager.isEnvReady()) {
          const autoBuildSource = getEffectiveSourcePath();
          if (autoBuildSource) {
            const status = await pythonEnvManager.initialize(autoBuildSource);
            if (!status.ready) {
              return { success: false, error: `Python environment not ready: ${status.error || 'Unknown error'}` };
            }
          } else {
            return { success: false, error: 'Python environment not ready and Auto Claude source not found' };
          }
        }

        const { task, project } = findTaskAndProject(taskId);
        if (!task || !project) {
          debug('Task or project not found');
          return { success: false, error: 'Task not found' };
        }

        debug('Found task:', task.specId, 'project:', project.path);

        // Use run.py --merge to handle the merge
        const sourcePath = getEffectiveSourcePath();
        if (!sourcePath) {
          return { success: false, error: 'Auto Claude source not found' };
        }

        const runScript = path.join(sourcePath, 'run.py');
        const specDir = path.join(project.path, project.autoBuildPath || '.auto-claude', 'specs', task.specId);

        if (!existsSync(specDir)) {
          debug('Spec directory not found:', specDir);
          return { success: false, error: 'Spec directory not found' };
        }

        // Check worktree exists before merge
        const worktreePath = path.join(project.path, '.worktrees', task.specId);
        debug('Worktree path:', worktreePath, 'exists:', existsSync(worktreePath));

        // Check if changes are already staged (for stage-only mode)
        if (options?.noCommit) {
          const stagedResult = spawnSync('git', ['diff', '--staged', '--name-only'], {
            cwd: project.path,
            encoding: 'utf-8'
          });

          if (stagedResult.status === 0 && stagedResult.stdout?.trim()) {
            const stagedFiles = stagedResult.stdout.trim().split('\n');
            debug('Changes already staged:', stagedFiles.length, 'files');
            // Return success - changes are already staged
            return {
              success: true,
              data: {
                success: true,
                merged: false,
                message: `Changes already staged (${stagedFiles.length} files). Review with git diff --staged.`,
                staged: true,
                alreadyStaged: true,
                projectPath: project.path
              }
            };
          }
        }

        // Get git status before merge
        try {
          const gitStatusBefore = execFileSync(getToolPath('git'), ['status', '--short'], { cwd: project.path, encoding: 'utf-8' });
          debug('Git status BEFORE merge in main project:\n', gitStatusBefore || '(clean)');
          const gitBranch = execFileSync(getToolPath('git'), ['branch', '--show-current'], { cwd: project.path, encoding: 'utf-8' }).trim();
          debug('Current branch:', gitBranch);
        } catch (e) {
          debug('Failed to get git status before:', e);
        }

        const args = [
          runScript,
          '--spec', task.specId,
          '--project-dir', project.path,
          '--merge'
        ];

        // Add --no-commit flag if requested (stage changes without committing)
        if (options?.noCommit) {
          args.push('--no-commit');
        }

        // Add --base-branch if task was created with a specific base branch
        const taskBaseBranch = getTaskBaseBranch(specDir);
        if (taskBaseBranch) {
          args.push('--base-branch', taskBaseBranch);
          debug('Using stored base branch:', taskBaseBranch);
        }

        // Use configured Python path (venv if ready, otherwise bundled/system)
        const pythonPath = getConfiguredPythonPath();
        debug('Running command:', pythonPath, args.join(' '));
        debug('Working directory:', sourcePath);

        // Get profile environment with OAuth token for AI merge resolution
        const profileEnv = getProfileEnv();
        debug('Profile env for merge:', {
          hasOAuthToken: !!profileEnv.CLAUDE_CODE_OAUTH_TOKEN,
          hasConfigDir: !!profileEnv.CLAUDE_CONFIG_DIR
        });

        return new Promise((resolve) => {
          const MERGE_TIMEOUT_MS = 600000; // 10 minutes timeout for AI merge operations with many files
          let timeoutId: NodeJS.Timeout | null = null;
          let resolved = false;

          // Get Python environment for bundled packages
          const pythonEnv = pythonEnvManagerSingleton.getPythonEnv();

          // Get utility settings for merge resolver
          const utilitySettings = getUtilitySettings();
          debug('Utility settings for merge:', utilitySettings);

          // Parse Python command to handle space-separated commands like "py -3"
          const [pythonCommand, pythonBaseArgs] = parsePythonCommand(pythonPath);
          const mergeProcess = spawn(pythonCommand, [...pythonBaseArgs, ...args], {
            cwd: sourcePath,
            env: {
              ...process.env,
              ...pythonEnv, // Include bundled packages PYTHONPATH
              ...profileEnv, // Include active Claude profile OAuth token
              PYTHONUNBUFFERED: '1',
              PYTHONUTF8: '1',
              // Utility feature settings for merge resolver
              UTILITY_MODEL: utilitySettings.model,
              UTILITY_MODEL_ID: utilitySettings.modelId,
              UTILITY_THINKING_BUDGET: utilitySettings.thinkingBudget === null ? '' : (utilitySettings.thinkingBudget?.toString() || '')
            },
            stdio: ['ignore', 'pipe', 'pipe'] // Don't connect stdin to avoid blocking
          });

          let stdout = '';
          let stderr = '';

          // Set up timeout to kill hung processes
          timeoutId = setTimeout(() => {
            if (!resolved) {
              debug('TIMEOUT: Merge process exceeded', MERGE_TIMEOUT_MS, 'ms, killing...');
              resolved = true;

              // Platform-specific process termination
              if (process.platform === 'win32') {
                // On Windows, .kill() without signal terminates the process tree
                // SIGTERM/SIGKILL are not supported the same way on Windows
                try {
                  mergeProcess.kill();
                } catch {
                  // Process may already be dead
                }
              } else {
                // On Unix-like systems, use SIGTERM first, then SIGKILL as fallback
                mergeProcess.kill('SIGTERM');
                // Give it a moment to clean up, then force kill
                setTimeout(() => {
                  try {
                    mergeProcess.kill('SIGKILL');
                  } catch {
                    // Process may already be dead
                  }
                }, 5000);
              }

              // Check if merge might have succeeded before the hang
              // Look for success indicators in the output
              const mayHaveSucceeded = stdout.includes('staged') ||
                                       stdout.includes('Successfully merged') ||
                                       stdout.includes('Changes from');

              if (mayHaveSucceeded) {
                debug('TIMEOUT: Process hung but merge may have succeeded based on output');
                const isStageOnly = options?.noCommit === true;
                resolve({
                  success: true,
                  data: {
                    success: true,
                    message: 'Changes staged (process timed out but merge appeared successful)',
                    staged: isStageOnly,
                    projectPath: isStageOnly ? project.path : undefined
                  }
                });
              } else {
                resolve({
                  success: false,
                  error: 'Merge process timed out. Check git status to see if merge completed.'
                });
              }
            }
          }, MERGE_TIMEOUT_MS);

          mergeProcess.stdout.on('data', (data: Buffer) => {
            const chunk = data.toString();
            stdout += chunk;
            debug('STDOUT:', chunk);
          });

          mergeProcess.stderr.on('data', (data: Buffer) => {
            const chunk = data.toString();
            stderr += chunk;
            debug('STDERR:', chunk);
          });

          // Handler for when process exits
          const handleProcessExit = async (code: number | null, signal: string | null = null) => {
            if (resolved) return; // Prevent double-resolution
            resolved = true;
            if (timeoutId) clearTimeout(timeoutId);

            debug('Process exited with code:', code, 'signal:', signal);
            debug('Full stdout:', stdout);
            debug('Full stderr:', stderr);

            // Get git status after merge
            try {
              const gitStatusAfter = execFileSync(getToolPath('git'), ['status', '--short'], { cwd: project.path, encoding: 'utf-8' });
              debug('Git status AFTER merge in main project:\n', gitStatusAfter || '(clean)');
              const gitDiffStaged = execFileSync(getToolPath('git'), ['diff', '--staged', '--stat'], { cwd: project.path, encoding: 'utf-8' });
              debug('Staged changes:\n', gitDiffStaged || '(none)');
            } catch (e) {
              debug('Failed to get git status after:', e);
            }

            if (code === 0) {
              const isStageOnly = options?.noCommit === true;

              // Verify changes were actually staged when stage-only mode is requested
              // This prevents false positives when merge was already committed previously
              let hasActualStagedChanges = false;
              let mergeAlreadyCommitted = false;

              if (isStageOnly) {
                try {
                  const gitDiffStaged = execFileSync(getToolPath('git'), ['diff', '--staged', '--stat'], { cwd: project.path, encoding: 'utf-8' });
                  hasActualStagedChanges = gitDiffStaged.trim().length > 0;
                  debug('Stage-only verification: hasActualStagedChanges:', hasActualStagedChanges);

                  if (!hasActualStagedChanges) {
                    // Check if worktree branch was already merged (merge commit exists)
                    const specBranch = `auto-claude/${task.specId}`;
                    try {
                      // Check if current branch contains all commits from spec branch
                      // git merge-base --is-ancestor returns exit code 0 if true, 1 if false
                      execFileSync(
                        'git',
                        ['merge-base', '--is-ancestor', specBranch, 'HEAD'],
                        { cwd: project.path, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
                      );
                      // If we reach here, the command succeeded (exit code 0) - branch is merged
                      mergeAlreadyCommitted = true;
                      debug('Merge already committed check:', mergeAlreadyCommitted);
                    } catch {
                      // Exit code 1 means not merged, or branch may not exist
                      mergeAlreadyCommitted = false;
                      debug('Could not check merge status, assuming not merged');
                    }
                  }
                } catch (e) {
                  debug('Failed to verify staged changes:', e);
                }
              }

              // Determine actual status based on verification
              let newStatus: string;
              let planStatus: string;
              let message: string;
              let staged: boolean;

              if (isStageOnly && !hasActualStagedChanges && mergeAlreadyCommitted) {
                // Stage-only was requested but merge was already committed previously
                // Mark as done since changes are already in the branch
                newStatus = 'done';
                planStatus = 'completed';
                message = 'Changes were already merged and committed. Task marked as done.';
                staged = false;
                debug('Stage-only requested but merge already committed. Marking as done.');
              } else if (isStageOnly && !hasActualStagedChanges) {
                // Stage-only was requested but no changes to stage (and not committed)
                // This could mean nothing to merge or an error - keep in human_review for investigation
                newStatus = 'human_review';
                planStatus = 'review';
                message = 'No changes to stage. The worktree may have no differences from the current branch.';
                staged = false;
                debug('Stage-only requested but no changes to stage.');
              } else if (isStageOnly) {
                // Stage-only with actual staged changes - expected success case
                newStatus = 'human_review';
                planStatus = 'review';
                message = 'Changes staged in main project. Review with git status and commit when ready.';
                staged = true;
              } else {
                // Full merge (not stage-only)
                newStatus = 'done';
                planStatus = 'completed';
                message = 'Changes merged successfully';
                staged = false;
              }

              debug('Merge result. isStageOnly:', isStageOnly, 'newStatus:', newStatus, 'staged:', staged);

              // Read suggested commit message if staging succeeded
              // OPTIMIZATION: Use async I/O to prevent blocking
              let suggestedCommitMessage: string | undefined;
              if (staged) {
                const commitMsgPath = path.join(specDir, 'suggested_commit_message.txt');
                try {
                  if (existsSync(commitMsgPath)) {
                    const { promises: fsPromises } = require('fs');
                    suggestedCommitMessage = (await fsPromises.readFile(commitMsgPath, 'utf-8')).trim();
                    debug('Read suggested commit message:', suggestedCommitMessage?.substring(0, 100));
                  }
                } catch (e) {
                  debug('Failed to read suggested commit message:', e);
                }
              }

              // Persist the status change to implementation_plan.json
              // Issue #243: We must update BOTH the main project's plan AND the worktree's plan (if it exists)
              // because ProjectStore prefers the worktree version when deduplicating tasks.
              // OPTIMIZATION: Use async I/O and parallel updates to prevent UI blocking
              const planPaths = [
                { path: path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN), isMain: true },
                { path: path.join(worktreePath, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN), isMain: false }
              ];

              const { promises: fsPromises } = require('fs');

              // Fire and forget - don't block the response on file writes
              // But add retry logic for transient failures and verification
              // Uses EAFP pattern (try/catch) instead of LBYL (existsSync check) to avoid TOCTOU race conditions
              const updatePlanWithRetry = async (planPath: string, isMain: boolean, maxRetries = 3) => {
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                  try {
                    const planContent = await fsPromises.readFile(planPath, 'utf-8');
                    const plan = JSON.parse(planContent);
                    plan.status = newStatus;
                    plan.planStatus = planStatus;
                    plan.updated_at = new Date().toISOString();
                    if (staged) {
                      plan.stagedAt = new Date().toISOString();
                      plan.stagedInMainProject = true;
                    }
                    await fsPromises.writeFile(planPath, JSON.stringify(plan, null, 2));

                    // Verify the write succeeded by reading back
                    const verifyContent = await fsPromises.readFile(planPath, 'utf-8');
                    const verifyPlan = JSON.parse(verifyContent);
                    if (verifyPlan.status === newStatus && verifyPlan.planStatus === planStatus) {
                      return true; // Write verified
                    }
                    throw new Error('Write verification failed - status mismatch');
                  } catch (persistError: unknown) {
                    // File doesn't exist - nothing to update (not an error)
                    if (persistError && typeof persistError === 'object' && 'code' in persistError && persistError.code === 'ENOENT') {
                      return true;
                    }
                    const isLastAttempt = attempt === maxRetries;
                    if (isLastAttempt) {
                      // Only log error if main plan fails; worktree plan might legitimately be missing or read-only
                      if (isMain) {
                        console.error('Failed to persist task status to main plan after retries:', persistError);
                      } else {
                        debug('Failed to persist task status to worktree plan (non-critical):', persistError);
                      }
                      return false;
                    }
                    // Wait before retry (exponential backoff: 100ms, 200ms, 400ms)
                    await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt - 1)));
                  }
                }
                return false;
              };

              const updatePlans = async () => {
                const results = await Promise.all(
                  planPaths.map(({ path: planPath, isMain }) =>
                    updatePlanWithRetry(planPath, isMain)
                  )
                );
                // Log if main plan update failed (first element)
                if (!results[0]) {
                  console.warn('Background plan update: main plan write may not have persisted');
                }
              };

              // Run async updates without blocking the response
              updatePlans().catch(err => debug('Background plan update failed:', err));

              const mainWindow = getMainWindow();
              if (mainWindow) {
                mainWindow.webContents.send(IPC_CHANNELS.TASK_STATUS_CHANGE, taskId, newStatus);
              }

              resolve({
                success: true,
                data: {
                  success: true,
                  message,
                  staged,
                  projectPath: staged ? project.path : undefined,
                  suggestedCommitMessage
                }
              });
            } else {
              // Check if there were conflicts
              const hasConflicts = stdout.includes('conflict') || stderr.includes('conflict');
              debug('Merge failed. hasConflicts:', hasConflicts);

              resolve({
                success: true,
                data: {
                  success: false,
                  message: hasConflicts ? 'Merge conflicts detected' : `Merge failed: ${stderr || stdout}`,
                  conflictFiles: hasConflicts ? [] : undefined
                }
              });
            }
          };

          mergeProcess.on('close', (code: number | null, signal: string | null) => {
            handleProcessExit(code, signal);
          });

          // Also listen to 'exit' event in case 'close' doesn't fire
          mergeProcess.on('exit', (code: number | null, signal: string | null) => {
            // Give close event a chance to fire first with complete output
            setTimeout(() => handleProcessExit(code, signal), 100);
          });

          mergeProcess.on('error', (err: Error) => {
            if (resolved) return;
            resolved = true;
            if (timeoutId) clearTimeout(timeoutId);
            console.error('[MERGE] Process spawn error:', err);
            resolve({
              success: false,
              error: `Failed to run merge: ${err.message}`
            });
          });
        });
      } catch (error) {
        console.error('[MERGE] Exception in merge handler:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to merge worktree'
        };
      }
    }
  );

  /**
   * Preview merge conflicts before actually merging
   * Uses the smart merge system to analyze potential conflicts
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_WORKTREE_MERGE_PREVIEW,
    async (_, taskId: string): Promise<IPCResult<WorktreeMergeResult>> => {
      console.warn('[IPC] TASK_WORKTREE_MERGE_PREVIEW called with taskId:', taskId);
      try {
        // Ensure Python environment is ready
        if (!pythonEnvManager.isEnvReady()) {
          console.warn('[IPC] Python environment not ready, initializing...');
          const autoBuildSource = getEffectiveSourcePath();
          if (autoBuildSource) {
            const status = await pythonEnvManager.initialize(autoBuildSource);
            if (!status.ready) {
              console.error('[IPC] Python environment failed to initialize:', status.error);
              return { success: false, error: `Python environment not ready: ${status.error || 'Unknown error'}` };
            }
          } else {
            console.error('[IPC] Auto Claude source not found');
            return { success: false, error: 'Python environment not ready and Auto Claude source not found' };
          }
        }

        const { task, project } = findTaskAndProject(taskId);
        if (!task || !project) {
          console.error('[IPC] Task not found:', taskId);
          return { success: false, error: 'Task not found' };
        }
        console.warn('[IPC] Found task:', task.specId, 'project:', project.name);

        // Check for uncommitted changes in the main project
        let hasUncommittedChanges = false;
        let uncommittedFiles: string[] = [];
        try {
          const gitStatus = execFileSync(getToolPath('git'), ['status', '--porcelain'], {
            cwd: project.path,
            encoding: 'utf-8'
          });

          if (gitStatus && gitStatus.trim()) {
            // Parse the status output to get file names
            // Format: XY filename (where X and Y are status chars, then space, then filename)
            uncommittedFiles = gitStatus
              .split('\n')
              .filter(line => line.trim())
              .map(line => line.substring(3).trim()); // Skip 2 status chars + 1 space, trim any trailing whitespace

            hasUncommittedChanges = uncommittedFiles.length > 0;
          }
        } catch (e) {
          console.error('[IPC] Failed to check git status:', e);
        }

        const sourcePath = getEffectiveSourcePath();
        if (!sourcePath) {
          console.error('[IPC] Auto Claude source not found');
          return { success: false, error: 'Auto Claude source not found' };
        }

        const runScript = path.join(sourcePath, 'run.py');
        const specDir = path.join(project.path, project.autoBuildPath || '.auto-claude', 'specs', task.specId);
        const args = [
          runScript,
          '--spec', task.specId,
          '--project-dir', project.path,
          '--merge-preview'
        ];

        // Add --base-branch if task was created with a specific base branch
        const taskBaseBranch = getTaskBaseBranch(specDir);
        if (taskBaseBranch) {
          args.push('--base-branch', taskBaseBranch);
          console.warn('[IPC] Using stored base branch for preview:', taskBaseBranch);
        }

        // Use configured Python path (venv if ready, otherwise bundled/system)
        const pythonPath = getConfiguredPythonPath();
        console.warn('[IPC] Running merge preview:', pythonPath, args.join(' '));

        // Get profile environment for consistency
        const previewProfileEnv = getProfileEnv();
        // Get Python environment for bundled packages
        const previewPythonEnv = pythonEnvManagerSingleton.getPythonEnv();

        return new Promise((resolve) => {
          // Parse Python command to handle space-separated commands like "py -3"
          const [pythonCommand, pythonBaseArgs] = parsePythonCommand(pythonPath);
          const previewProcess = spawn(pythonCommand, [...pythonBaseArgs, ...args], {
            cwd: sourcePath,
            env: { ...process.env, ...previewPythonEnv, ...previewProfileEnv, PYTHONUNBUFFERED: '1', PYTHONUTF8: '1', DEBUG: 'true' }
          });

          let stdout = '';
          let stderr = '';

          previewProcess.stdout.on('data', (data: Buffer) => {
            const chunk = data.toString();
            stdout += chunk;
            console.warn('[IPC] merge-preview stdout:', chunk);
          });

          previewProcess.stderr.on('data', (data: Buffer) => {
            const chunk = data.toString();
            stderr += chunk;
            console.warn('[IPC] merge-preview stderr:', chunk);
          });

          previewProcess.on('close', (code: number) => {
            console.warn('[IPC] merge-preview process exited with code:', code);
            if (code === 0) {
              try {
                // Parse JSON output from Python
                const result = JSON.parse(stdout.trim());
                console.warn('[IPC] merge-preview result:', JSON.stringify(result, null, 2));
                resolve({
                  success: true,
                  data: {
                    success: result.success,
                    message: result.error || 'Preview completed',
                    preview: {
                      files: result.files || [],
                      conflicts: result.conflicts || [],
                      summary: result.summary || {
                        totalFiles: 0,
                        conflictFiles: 0,
                        totalConflicts: 0,
                        autoMergeable: 0,
                        hasGitConflicts: false
                      },
                      gitConflicts: result.gitConflicts || null,
                      // Include uncommitted changes info for the frontend
                      uncommittedChanges: hasUncommittedChanges ? {
                        hasChanges: true,
                        files: uncommittedFiles,
                        count: uncommittedFiles.length
                      } : null
                    }
                  }
                });
              } catch (parseError) {
                console.error('[IPC] Failed to parse preview result:', parseError);
                console.error('[IPC] stdout:', stdout);
                console.error('[IPC] stderr:', stderr);
                resolve({
                  success: false,
                  error: `Failed to parse preview result: ${stderr || stdout}`
                });
              }
            } else {
              console.error('[IPC] Preview failed with exit code:', code);
              console.error('[IPC] stderr:', stderr);
              console.error('[IPC] stdout:', stdout);
              resolve({
                success: false,
                error: `Preview failed: ${stderr || stdout}`
              });
            }
          });

          previewProcess.on('error', (err: Error) => {
            console.error('[IPC] merge-preview spawn error:', err);
            resolve({
              success: false,
              error: `Failed to run preview: ${err.message}`
            });
          });
        });
      } catch (error) {
        console.error('[IPC] TASK_WORKTREE_MERGE_PREVIEW error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to preview merge'
        };
      }
    }
  );

  /**
   * Discard the worktree changes
   * Per-spec architecture: Each spec has its own worktree at .worktrees/{spec-name}/
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_WORKTREE_DISCARD,
    async (_, taskId: string): Promise<IPCResult<WorktreeDiscardResult>> => {
      try {
        const { task, project } = findTaskAndProject(taskId);
        if (!task || !project) {
          return { success: false, error: 'Task not found' };
        }

        // Per-spec worktree path: .worktrees/{spec-name}/
        const worktreePath = path.join(project.path, '.worktrees', task.specId);

        if (!existsSync(worktreePath)) {
          return {
            success: true,
            data: {
              success: true,
              message: 'No worktree to discard'
            }
          };
        }

        try {
          // Get the branch name before removing
          const branch = execFileSync(getToolPath('git'), ['rev-parse', '--abbrev-ref', 'HEAD'], {
            cwd: worktreePath,
            encoding: 'utf-8'
          }).trim();

          // Remove the worktree
          execFileSync(getToolPath('git'), ['worktree', 'remove', '--force', worktreePath], {
            cwd: project.path,
            encoding: 'utf-8'
          });

          // Delete the branch
          try {
            execFileSync(getToolPath('git'), ['branch', '-D', branch], {
              cwd: project.path,
              encoding: 'utf-8'
            });
          } catch {
            // Branch might already be deleted or not exist
          }

          const mainWindow = getMainWindow();
          if (mainWindow) {
            mainWindow.webContents.send(IPC_CHANNELS.TASK_STATUS_CHANGE, taskId, 'backlog');
          }

          return {
            success: true,
            data: {
              success: true,
              message: 'Worktree discarded successfully'
            }
          };
        } catch (gitError) {
          console.error('Git error discarding worktree:', gitError);
          return {
            success: false,
            error: `Failed to discard worktree: ${gitError instanceof Error ? gitError.message : 'Unknown error'}`
          };
        }
      } catch (error) {
        console.error('Failed to discard worktree:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to discard worktree'
        };
      }
    }
  );

  /**
   * List all spec worktrees for a project
   * Per-spec architecture: Each spec has its own worktree at .worktrees/{spec-name}/
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_LIST_WORKTREES,
    async (_, projectId: string): Promise<IPCResult<WorktreeListResult>> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          return { success: false, error: 'Project not found' };
        }

        const worktreesDir = path.join(project.path, '.worktrees');
        const worktrees: WorktreeListItem[] = [];

        if (!existsSync(worktreesDir)) {
          return { success: true, data: { worktrees } };
        }

        // Get all directories in .worktrees
        const entries = readdirSync(worktreesDir);
        for (const entry of entries) {
          const entryPath = path.join(worktreesDir, entry);
          const stat = statSync(entryPath);

          // Skip worker directories and non-directories
          if (!stat.isDirectory() || entry.startsWith('worker-')) {
            continue;
          }

          try {
            // Get branch info
            const branch = execFileSync(getToolPath('git'), ['rev-parse', '--abbrev-ref', 'HEAD'], {
              cwd: entryPath,
              encoding: 'utf-8'
            }).trim();

            // Get base branch - the current branch in the main project (where changes will be merged)
            let baseBranch = 'main';
            try {
              baseBranch = execFileSync(getToolPath('git'), ['rev-parse', '--abbrev-ref', 'HEAD'], {
                cwd: project.path,
                encoding: 'utf-8'
              }).trim();
            } catch {
              baseBranch = 'main';
            }

            // Get commit count (cross-platform - no shell syntax)
            let commitCount = 0;
            try {
              const countOutput = execFileSync(getToolPath('git'), ['rev-list', '--count', `${baseBranch}..HEAD`], {
                cwd: entryPath,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
              }).trim();
              commitCount = parseInt(countOutput, 10) || 0;
            } catch {
              commitCount = 0;
            }

            // Get diff stats (cross-platform - no shell syntax)
            let filesChanged = 0;
            let additions = 0;
            let deletions = 0;
            let diffStat = '';

            try {
              diffStat = execFileSync(getToolPath('git'), ['diff', '--shortstat', `${baseBranch}...HEAD`], {
                cwd: entryPath,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
              }).trim();

              const filesMatch = diffStat.match(/(\d+) files? changed/);
              const addMatch = diffStat.match(/(\d+) insertions?/);
              const delMatch = diffStat.match(/(\d+) deletions?/);

              if (filesMatch) filesChanged = parseInt(filesMatch[1], 10) || 0;
              if (addMatch) additions = parseInt(addMatch[1], 10) || 0;
              if (delMatch) deletions = parseInt(delMatch[1], 10) || 0;
            } catch {
              // Ignore diff errors
            }

            worktrees.push({
              specName: entry,
              path: entryPath,
              branch,
              baseBranch,
              commitCount,
              filesChanged,
              additions,
              deletions
            });
          } catch (gitError) {
            console.error(`Error getting info for worktree ${entry}:`, gitError);
            // Skip this worktree if we can't get git info
          }
        }

        return { success: true, data: { worktrees } };
      } catch (error) {
        console.error('Failed to list worktrees:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list worktrees'
        };
      }
    }
  );

  /**
   * Detect installed IDEs and terminals on the system
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_WORKTREE_DETECT_TOOLS,
    async (): Promise<IPCResult<DetectedTools>> => {
      try {
        const tools = await detectInstalledTools();
        return { success: true, data: tools };
      } catch (error) {
        console.error('Failed to detect tools:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to detect installed tools'
        };
      }
    }
  );

  /**
   * Open a worktree directory in the specified IDE
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_WORKTREE_OPEN_IN_IDE,
    async (_, worktreePath: string, ide: SupportedIDE, customPath?: string): Promise<IPCResult<{ opened: boolean }>> => {
      try {
        if (!existsSync(worktreePath)) {
          return { success: false, error: 'Worktree path does not exist' };
        }

        const result = await openInIDE(worktreePath, ide, customPath);
        if (!result.success) {
          return { success: false, error: result.error };
        }

        return { success: true, data: { opened: true } };
      } catch (error) {
        console.error('Failed to open in IDE:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to open in IDE'
        };
      }
    }
  );

  /**
   * Open a worktree directory in the specified terminal
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_WORKTREE_OPEN_IN_TERMINAL,
    async (_, worktreePath: string, terminal: SupportedTerminal, customPath?: string): Promise<IPCResult<{ opened: boolean }>> => {
      try {
        if (!existsSync(worktreePath)) {
          return { success: false, error: 'Worktree path does not exist' };
        }

        const result = await openInTerminal(worktreePath, terminal, customPath);
        if (!result.success) {
          return { success: false, error: result.error };
        }

        return { success: true, data: { opened: true } };
      } catch (error) {
        console.error('Failed to open in terminal:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to open in terminal'
        };
      }
    }
  );
}
