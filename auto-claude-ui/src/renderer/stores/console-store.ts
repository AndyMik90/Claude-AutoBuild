import { create } from 'zustand'

export interface ConsoleLogEntry {
  id: string
  timestamp: Date
  level: 'info' | 'warn' | 'error' | 'debug'
  source: 'ideation' | 'roadmap' | 'changelog' | 'task' | 'system' | 'ipc'
  message: string
  projectId?: string
  details?: string
}

interface ConsoleState {
  logs: ConsoleLogEntry[]
  isOpen: boolean
  filter: {
    level: ('info' | 'warn' | 'error' | 'debug')[]
    source: string[]
  }
  maxLogs: number

  // Actions
  addLog: (entry: Omit<ConsoleLogEntry, 'id' | 'timestamp'>) => void
  clearLogs: () => void
  setOpen: (open: boolean) => void
  toggleOpen: () => void
  setFilter: (filter: Partial<ConsoleState['filter']>) => void
  getFilteredLogs: () => ConsoleLogEntry[]
}

let logIdCounter = 0

export const useConsoleStore = create<ConsoleState>((set, get) => ({
  logs: [],
  isOpen: false,
  filter: {
    level: ['info', 'warn', 'error', 'debug'],
    source: [],
  },
  maxLogs: 1000,

  addLog: (entry) => {
    const newLog: ConsoleLogEntry = {
      ...entry,
      id: `log-${Date.now()}-${logIdCounter++}`,
      timestamp: new Date(),
    }

    set((state) => {
      const newLogs = [...state.logs, newLog]
      // Keep only the last maxLogs entries
      if (newLogs.length > state.maxLogs) {
        return { logs: newLogs.slice(-state.maxLogs) }
      }
      return { logs: newLogs }
    })
  },

  clearLogs: () => set({ logs: [] }),

  setOpen: (open) => set({ isOpen: open }),

  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),

  setFilter: (filter) =>
    set((state) => ({
      filter: { ...state.filter, ...filter },
    })),

  getFilteredLogs: () => {
    const state = get()
    return state.logs.filter((log) => {
      // Filter by level
      if (!state.filter.level.includes(log.level)) {
        return false
      }
      // Filter by source (empty means all)
      if (state.filter.source.length > 0 && !state.filter.source.includes(log.source)) {
        return false
      }
      return true
    })
  },
}))

// Helper function to add logs from different sources
export const consoleLog = {
  info: (
    source: ConsoleLogEntry['source'],
    message: string,
    details?: string,
    projectId?: string
  ) => {
    useConsoleStore.getState().addLog({ level: 'info', source, message, details, projectId })
  },
  warn: (
    source: ConsoleLogEntry['source'],
    message: string,
    details?: string,
    projectId?: string
  ) => {
    useConsoleStore.getState().addLog({ level: 'warn', source, message, details, projectId })
  },
  error: (
    source: ConsoleLogEntry['source'],
    message: string,
    details?: string,
    projectId?: string
  ) => {
    useConsoleStore.getState().addLog({ level: 'error', source, message, details, projectId })
  },
  debug: (
    source: ConsoleLogEntry['source'],
    message: string,
    details?: string,
    projectId?: string
  ) => {
    useConsoleStore.getState().addLog({ level: 'debug', source, message, details, projectId })
  },
}
