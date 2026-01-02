import {
  AlertCircle,
  AlertTriangle,
  Bug,
  ChevronDown,
  ChevronUp,
  Filter,
  Info,
  Terminal,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../lib/utils'
import { type ConsoleLogEntry, useConsoleStore } from '../stores/console-store'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { ScrollArea } from './ui/scroll-area'

const levelIcons = {
  info: Info,
  warn: AlertTriangle,
  error: AlertCircle,
  debug: Bug,
}

const levelColors = {
  info: 'text-blue-500',
  warn: 'text-yellow-500',
  error: 'text-red-500',
  debug: 'text-gray-500',
}

const sourceColors: Record<string, string> = {
  ideation: 'bg-purple-500/20 text-purple-400',
  roadmap: 'bg-green-500/20 text-green-400',
  changelog: 'bg-blue-500/20 text-blue-400',
  task: 'bg-orange-500/20 text-orange-400',
  system: 'bg-gray-500/20 text-gray-400',
  ipc: 'bg-cyan-500/20 text-cyan-400',
}

function LogEntry({ log }: { log: ConsoleLogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = levelIcons[log.level]

  return (
    <div
      className={cn(
        'px-3 py-1.5 border-b border-border/50 hover:bg-muted/50 font-mono text-xs',
        log.level === 'error' && 'bg-red-500/5'
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', levelColors[log.level])} />
        <span className="text-muted-foreground shrink-0">{log.timestamp.toLocaleTimeString()}</span>
        <span
          className={cn(
            'px-1.5 py-0.5 rounded text-[10px] uppercase font-medium shrink-0',
            sourceColors[log.source] || 'bg-gray-500/20 text-gray-400'
          )}
        >
          {log.source}
        </span>
        <span className="flex-1 break-all">{log.message}</span>
        {log.details && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        )}
      </div>
      {expanded && log.details && (
        <div className="mt-1 ml-6 p-2 bg-muted/50 rounded text-muted-foreground whitespace-pre-wrap">
          {log.details}
        </div>
      )}
    </div>
  )
}

const ALL_SOURCES = ['ideation', 'roadmap', 'changelog', 'task', 'system', 'ipc'] as const

export function ConsoleLogsPanel() {
  const { logs, isOpen, filter, setOpen, clearLogs, setFilter } = useConsoleStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // Filter logs in component with useMemo for performance
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Level filter
      if (!filter.level.includes(log.level)) return false
      // Source filter (empty = all sources)
      if (filter.source.length > 0 && !filter.source.includes(log.source)) return false
      return true
    })
  }, [logs, filter.level, filter.source])

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  if (!isOpen) {
    return null
  }

  const handleLevelToggle = (level: ConsoleLogEntry['level']) => {
    const currentLevels = filter.level
    if (currentLevels.includes(level)) {
      setFilter({ level: currentLevels.filter((l) => l !== level) })
    } else {
      setFilter({ level: [...currentLevels, level] })
    }
  }

  const handleSourceToggle = (source: string) => {
    const currentSources = filter.source
    // When no sources are explicitly selected (= all sources implicitly selected),
    // clicking a source should explicitly select all EXCEPT that source
    if (currentSources.length === 0) {
      setFilter({ source: ALL_SOURCES.filter((s) => s !== source) })
    } else if (currentSources.includes(source)) {
      const newSources = currentSources.filter((s) => s !== source)
      // If removing this would leave no sources, reset to "all" (empty array)
      setFilter({ source: newSources.length === 0 ? [] : newSources })
    } else {
      // Adding a source - if this completes all sources, reset to empty (= all)
      const newSources = [...currentSources, source]
      setFilter({ source: newSources.length === ALL_SOURCES.length ? [] : newSources })
    }
  }

  return (
    <div className="border-t border-border bg-card flex flex-col" style={{ height: '250px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Console Logs</span>
          <span className="text-xs text-muted-foreground">
            ({filteredLogs.length} / {logs.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Filter dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2">
                <Filter className="h-3.5 w-3.5 mr-1" />
                Filter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Log Levels</DropdownMenuLabel>
              {(['info', 'warn', 'error', 'debug'] as const).map((level) => (
                <DropdownMenuCheckboxItem
                  key={level}
                  checked={filter.level.includes(level)}
                  onCheckedChange={() => handleLevelToggle(level)}
                >
                  <span className={cn('capitalize', levelColors[level])}>{level}</span>
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Sources</DropdownMenuLabel>
              {ALL_SOURCES.map((source) => (
                <DropdownMenuCheckboxItem
                  key={source}
                  checked={filter.source.length === 0 || filter.source.includes(source)}
                  onCheckedChange={() => handleSourceToggle(source)}
                >
                  <span className="capitalize">{source}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Auto-scroll toggle */}
          <Button
            variant={autoScroll ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2"
            onClick={() => setAutoScroll(!autoScroll)}
          >
            {autoScroll ? 'Auto-scroll On' : 'Auto-scroll Off'}
          </Button>

          {/* Clear logs */}
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={clearLogs}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>

          {/* Close */}
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Logs area */}
      <ScrollArea ref={scrollRef} className="flex-1">
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No logs to display
          </div>
        ) : (
          <div>
            {filteredLogs.map((log) => (
              <LogEntry key={log.id} log={log} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

// Toggle button for the sidebar
export function ConsoleLogsToggle() {
  const { isOpen, toggleOpen, logs } = useConsoleStore()

  // Optimize: count errors and warnings in single iteration
  const { errorCount, warnCount } = useMemo(() => {
    let errors = 0
    let warnings = 0
    for (const log of logs) {
      if (log.level === 'error') errors++
      else if (log.level === 'warn') warnings++
    }
    return { errorCount: errors, warnCount: warnings }
  }, [logs])

  return (
    <Button
      variant={isOpen ? 'secondary' : 'ghost'}
      size="sm"
      className="justify-start gap-2 relative"
      onClick={toggleOpen}
    >
      <Terminal className="h-4 w-4" />
      Console
      {(errorCount > 0 || warnCount > 0) && (
        <span
          className={cn(
            'ml-auto text-xs px-1.5 py-0.5 rounded-full',
            errorCount > 0 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
          )}
        >
          {errorCount > 0 ? errorCount : warnCount}
        </span>
      )}
    </Button>
  )
}
