import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Trash2, RefreshCw } from 'lucide-react';

type LogSource = 'backend' | 'ipc' | 'frontend';
type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: LogSource;
  message: string;
  context?: Record<string, any>;
}

export function LogViewer() {
  const { t } = useTranslation(['debug']);
  const [selectedSource, setSelectedSource] = useState<LogSource>('backend');
  const [selectedLevel, setSelectedLevel] = useState<LogLevel>('debug');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Load recent logs when source changes
  const loadRecentLogs = async () => {
    setIsLoading(true);
    try {
      const recentLogs = await window.electronAPI.getRecentLogs(selectedSource, 100);
      setLogs(recentLogs);
    } catch (error) {
      console.error('Failed to load recent logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Subscribe to log streams
  useEffect(() => {
    // Load initial logs
    loadRecentLogs();

    let unsubscribe: (() => void) | undefined;

    // Subscribe to the selected source's log stream
    switch (selectedSource) {
      case 'backend':
        unsubscribe = window.electronAPI.onBackendLog((log: LogEntry) => {
          setLogs((prev) => [...prev, log]);
        });
        break;
      case 'ipc':
        unsubscribe = window.electronAPI.onIpcLog((log: LogEntry) => {
          setLogs((prev) => [...prev, log]);
        });
        break;
      case 'frontend':
        unsubscribe = window.electronAPI.onFrontendLog((log: LogEntry) => {
          setLogs((prev) => [...prev, log]);
        });
        break;
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [selectedSource]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleClear = () => {
    setLogs([]);
  };

  // Filter logs by level
  const filteredLogs = logs.filter((log) => {
    const levelPriority: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };
    const selectedPriority = levelPriority[selectedLevel];
    const logPriority = levelPriority[log.level];
    return logPriority <= selectedPriority;
  });

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case 'error':
        return 'text-red-500';
      case 'warn':
        return 'text-yellow-500';
      case 'info':
        return 'text-blue-500';
      case 'debug':
        return 'text-muted-foreground';
      default:
        return 'text-foreground';
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Controls */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <label className="text-sm font-medium mb-2 block">
            {t('logs.sourceLabel')}
          </label>
          <Select value={selectedSource} onValueChange={(value) => setSelectedSource(value as LogSource)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="backend">{t('logs.sources.backend')}</SelectItem>
              <SelectItem value="ipc">{t('logs.sources.ipc')}</SelectItem>
              <SelectItem value="frontend">{t('logs.sources.frontend')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <label className="text-sm font-medium mb-2 block">
            {t('logs.levelLabel')}
          </label>
          <Select value={selectedLevel} onValueChange={(value) => setSelectedLevel(value as LogLevel)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="warn">Warning</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="debug">Debug</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="self-end flex gap-2">
          <Button variant="outline" size="sm" onClick={loadRecentLogs} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            {t('logs.refreshButton')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear}>
            <Trash2 className="mr-2 h-4 w-4" />
            {t('logs.clearButton')}
          </Button>
        </div>
      </div>

      {/* Log Display */}
      <div className="flex-1 rounded-lg border bg-muted/50 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4 font-mono text-sm">
            {filteredLogs.length === 0 ? (
              <p className="text-muted-foreground">{t('logs.noLogs')}</p>
            ) : (
              <div className="space-y-1">
                {filteredLogs.map((log, index) => (
                  <div key={index} className="flex gap-4">
                    <span className="text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className={`font-semibold ${getLevelColor(log.level)} min-w-[60px]`}>
                      {log.level.toUpperCase()}
                    </span>
                    <span className="flex-1">{log.message}</span>
                  </div>
                ))}
                <div ref={scrollRef} />
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
