import { useState, useEffect } from 'react';
import { Play, ChevronDown, Loader2, Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface NpmScriptSelectorProps {
  terminalId: string;
  projectPath: string;
  /** Number of terminals (for compact mode) */
  terminalCount?: number;
  /** Disabled when terminal is busy (Claude mode, exited, etc.) */
  disabled?: boolean;
}

export function NpmScriptSelector({
  terminalId,
  projectPath,
  terminalCount = 1,
  disabled = false,
}: NpmScriptSelectorProps) {
  const { t } = useTranslation(['terminal', 'common']);
  const [scripts, setScripts] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [hasPackageJson, setHasPackageJson] = useState(true);

  // Fetch scripts when dropdown opens
  const fetchScripts = async () => {
    if (!projectPath) return;
    setIsLoading(true);
    try {
      const result = await window.electronAPI.getNpmScripts(projectPath);
      if (result.success && result.data) {
        setScripts(result.data);
        setHasPackageJson(Object.keys(result.data).length > 0);
      } else {
        setScripts({});
        setHasPackageJson(false);
      }
    } catch (err) {
      console.error('Failed to fetch npm scripts:', err);
      setScripts({});
      setHasPackageJson(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && projectPath) {
      fetchScripts();
    }
  }, [isOpen, projectPath]);

  const handleRunScript = (scriptName: string) => {
    window.electronAPI.runNpmScript(terminalId, scriptName);
    setIsOpen(false);
  };

  const scriptEntries = Object.entries(scripts);
  const isCompact = terminalCount >= 4;

  // Common scripts that should be shown first
  const priorityScripts = ['dev', 'start', 'build', 'test', 'lint'];
  const sortedScripts = scriptEntries.sort(([a], [b]) => {
    const aIndex = priorityScripts.indexOf(a);
    const bIndex = priorityScripts.indexOf(b);
    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
    if (aIndex >= 0) return -1;
    if (bIndex >= 0) return 1;
    return a.localeCompare(b);
  });

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={isCompact ? 'icon' : 'sm'}
          className={cn(
            'h-6 hover:bg-green-500/10 hover:text-green-500',
            isCompact ? 'w-6' : 'px-2 text-xs gap-1'
          )}
          disabled={disabled}
          title={t('terminal:npmScripts.title', 'Run npm script')}
        >
          <Package className="h-3 w-3" />
          {!isCompact && <span>npm</span>}
          <ChevronDown className="h-2.5 w-2.5 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-2">
          <Package className="h-3 w-3" />
          {t('terminal:npmScripts.title', 'npm scripts')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !hasPackageJson ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            {t('terminal:npmScripts.noPackageJson', 'No package.json found')}
          </div>
        ) : sortedScripts.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            {t('terminal:npmScripts.noScripts', 'No scripts defined')}
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {sortedScripts.map(([name, command]) => (
              <DropdownMenuItem
                key={name}
                onClick={() => handleRunScript(name)}
                className="flex items-start gap-2 py-2 cursor-pointer"
              >
                <Play className="h-3 w-3 mt-0.5 shrink-0 text-green-500" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {command}
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
