import { useState, useEffect } from 'react';
import { FileText, Globe, Trash2, CheckCircle2, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
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
}: UIFrameworkDocsSectionProps) {
  const [cachedDocs, setCachedDocs] = useState<DocsCacheInfo[]>([]);
  const [isLoadingCache, setIsLoadingCache] = useState(false);
  const [isDeletingCache, setIsDeletingCache] = useState<string | null>(null);

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
      <div className="space-y-4">
        {/* Info Box */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <Globe className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 space-y-1">
              <p className="text-xs font-medium text-foreground">
                Automatic Documentation Fetching
              </p>
              <p className="text-xs text-muted-foreground">
                AI agents automatically fetch UI framework documentation when building frontend features.
                Documentation is cached locally in <code className="text-xs bg-background px-1 py-0.5 rounded">.auto-claude/ui-framework-docs/</code>
              </p>
            </div>
          </div>

          <Separator className="my-2" />

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-success" />
                <span className="font-medium text-foreground">Priority 1:</span>
              </div>
              <span className="text-muted-foreground">Context7 (LLM-optimized)</span>
            </div>
            <p className="text-muted-foreground ml-4 pl-1">
              Pre-processed documentation with no API key required
            </p>

            <div className="flex items-center gap-2 mt-2">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-warning" />
                <span className="font-medium text-foreground">Fallback:</span>
              </div>
              <span className="text-muted-foreground">Firecrawl (web scraping)</span>
            </div>
            <p className="text-muted-foreground ml-4 pl-1">
              {hasFirecrawlKey
                ? '✓ API key configured - fallback available'
                : 'No API key set - Context7 only'}
            </p>
          </div>
        </div>

        {/* Current UI Framework */}
        {hasUntitledUI && (
          <div className="rounded-lg border border-success/30 bg-success/5 p-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-medium text-foreground">Untitled UI Detected</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Documentation available via Context7 (172 snippets, 32K tokens)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Cached Documentation */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-foreground">Cached Documentation</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshCache}
              disabled={isLoadingCache}
              className="h-7 px-2"
            >
              {isLoadingCache ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          </div>

          {isLoadingCache ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : cachedDocs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center">
              <p className="text-xs text-muted-foreground">
                No cached documentation yet. Documentation will be automatically fetched when agents need it.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {cachedDocs.map((doc) => (
                <div
                  key={doc.framework}
                  className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <span className="text-sm font-medium text-foreground">
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
                    className="h-8 px-2 hover:bg-destructive/10 hover:text-destructive"
                  >
                    {isDeletingCache === doc.framework ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Firecrawl API Key (Optional) */}
        <Separator />
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">
            Firecrawl API Key (Optional)
          </Label>
          <p className="text-xs text-muted-foreground">
            Used as fallback when Context7 is unavailable. Not required for Untitled UI.
          </p>
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
