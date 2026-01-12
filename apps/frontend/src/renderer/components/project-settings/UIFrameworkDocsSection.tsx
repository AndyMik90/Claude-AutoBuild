import { useState, useEffect } from 'react';
import { FileText, Globe, Trash2, CheckCircle2, AlertCircle, Loader2, RefreshCw, Search } from 'lucide-react';
import { CollapsibleSection } from './CollapsibleSection';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import type { ProjectEnvConfig, ProjectSettings } from '../../../shared/types';

interface DocsCacheInfo {
  framework: string;
  size: number;
  lastFetched: string | null;
  source: string | null;
}

interface UIFrameworkDocsSectionProps {
  isExpanded: boolean;
  onToggle: () => void;
  envConfig: ProjectEnvConfig;
  settings: ProjectSettings;
  onUpdateConfig: (updates: Partial<ProjectEnvConfig>) => void;
  projectPath: string;
  projectId: string;
}

/**
 * UI Framework Documentation Section Component
 * Manages automatic fetching and caching of UI framework documentation
 * Uses Context7 (primary) and Firecrawl (fallback)
 */
export function UIFrameworkDocsSection({
  isExpanded,
  onToggle,
  envConfig,
  settings,
  onUpdateConfig,
  projectPath,
  projectId,
}: UIFrameworkDocsSectionProps) {
  const [cachedDocs, setCachedDocs] = useState<DocsCacheInfo[]>([]);
  const [isLoadingCache, setIsLoadingCache] = useState(false);
  const [isDeletingCache, setIsDeletingCache] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  // Load cached documentation info
  const loadCachedDocs = async () => {
    setIsLoadingCache(true);
    try {
      // TODO: Add IPC handler to list cached UI docs
      // const result = await window.electronAPI.listCachedUIDocs(projectPath);
      // if (result.success && result.data) {
      //   setCachedDocs(result.data);
      // }

      // Placeholder for now
      setCachedDocs([]);
    } catch (error) {
      console.error('Failed to load cached docs:', error);
    } finally {
      setIsLoadingCache(false);
    }
  };

  // Load cached docs when section expands
  useEffect(() => {
    if (isExpanded) {
      loadCachedDocs();
    }
  }, [isExpanded]);

  const handleDeleteCache = async (framework: string) => {
    setIsDeletingCache(framework);
    try {
      // TODO: Add IPC handler to delete cached docs
      // await window.electronAPI.deleteCachedUIDocs(projectPath, framework);
      await loadCachedDocs();
    } catch (error) {
      console.error('Failed to delete cache:', error);
    } finally {
      setIsDeletingCache(null);
    }
  };

  const handleRefreshCache = async () => {
    await loadCachedDocs();
  };

  const handleDetectFramework = async () => {
    setIsDetecting(true);
    try {
      const result = await window.electronAPI.refreshProjectIndex(projectId);
      if (result.success) {
        // Reload the page to show updated framework detection
        window.location.reload();
      } else {
        console.error('Failed to detect UI framework:', result.error);
      }
    } catch (error) {
      console.error('Failed to detect UI framework:', error);
    } finally {
      setIsDetecting(false);
    }
  };

  const hasFirecrawlKey = !!envConfig.firecrawlApiKey;
  const hasUntitledUI = envConfig.uiFrameworkLibrary?.includes('Untitled UI');

  const badge = (
    <span className="px-2 py-0.5 text-xs rounded-full bg-success/10 text-success">
      Active
    </span>
  );

  return (
    <CollapsibleSection
      title="UI Framework Documentation"
      icon={<FileText className="h-4 w-4" />}
      isExpanded={isExpanded}
      onToggle={onToggle}
      badge={badge}
    >
      <div className="space-y-6">
        {/* Info Box */}
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Globe className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-semibold text-foreground">
                Automatic Documentation Fetching
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                AI agents automatically fetch UI framework documentation when building frontend features.
                Documentation is cached locally in <code className="text-xs bg-background px-1.5 py-0.5 rounded">.auto-claude/ui-framework-docs/</code>
              </p>
            </div>
          </div>

          <Separator className="my-3" />

          <div className="space-y-3 text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-success" />
                  <span className="font-semibold text-foreground text-sm">Priority 1:</span>
                </div>
                <span className="text-muted-foreground">Context7 (LLM-optimized)</span>
              </div>
              <p className="text-muted-foreground ml-5 pl-2 leading-relaxed">
                Pre-processed documentation with no API key required
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-warning" />
                  <span className="font-semibold text-foreground text-sm">Fallback:</span>
                </div>
                <span className="text-muted-foreground">Firecrawl (web scraping)</span>
              </div>
              <p className="text-muted-foreground ml-5 pl-2 leading-relaxed">
                {hasFirecrawlKey
                  ? '✓ API key configured - fallback available'
                  : 'No API key set - Context7 only'}
              </p>
            </div>
          </div>
        </div>

        {/* Detect UI Framework Button */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold text-foreground">Framework Detection</Label>
          <Button
            variant="outline"
            onClick={handleDetectFramework}
            disabled={isDetecting}
            className="w-full"
          >
            {isDetecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Detecting UI Frameworks...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Detect UI Frameworks
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Scan project files to detect UI component libraries and frameworks
          </p>
        </div>

        {/* Current UI Framework */}
        {hasUntitledUI && (
          <div className="rounded-lg border border-success/30 bg-success/5 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-success mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Untitled UI Detected</p>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  Documentation available via Context7 (172 snippets, 32K tokens)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Cached Documentation */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-foreground">Cached Documentation</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshCache}
              disabled={isLoadingCache}
              className="h-8 px-3"
            >
              {isLoadingCache ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>

          {isLoadingCache ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : cachedDocs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center">
              <p className="text-xs text-muted-foreground leading-relaxed">
                No cached documentation yet. Documentation will be automatically fetched when agents need it.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {cachedDocs.map((doc) => (
                <div
                  key={doc.framework}
                  className="flex items-center justify-between rounded-lg border border-border bg-background p-4"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">
                        {doc.framework}
                      </span>
                      {doc.source && (
                        <span className="text-xs text-muted-foreground">
                          via {doc.source}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{(doc.size / 1024).toFixed(1)} KB</span>
                      {doc.lastFetched && (
                        <span>Fetched: {new Date(doc.lastFetched).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteCache(doc.framework)}
                    disabled={isDeletingCache === doc.framework}
                    className="h-9 px-3 hover:bg-destructive/10 hover:text-destructive"
                  >
                    {isDeletingCache === doc.framework ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Firecrawl API Key (Optional) */}
        <Separator />
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-foreground">
              Firecrawl API Key (Optional)
            </Label>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Used as fallback when Context7 is unavailable. Not required for Untitled UI.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="fc-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={envConfig.firecrawlApiKey || ''}
              onChange={(e) => onUpdateConfig({ firecrawlApiKey: e.target.value || undefined })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Get your API key from{' '}
            <a
              href="https://www.firecrawl.dev/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              firecrawl.dev
            </a>
          </p>
        </div>
      </div>
    </CollapsibleSection>
  );
}
