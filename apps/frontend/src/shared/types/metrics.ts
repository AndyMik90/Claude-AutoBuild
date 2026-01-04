/**
 * Metrics types for the Auto-Claude dashboard
 * Defines data structures for task statistics, provider usage, and performance metrics
 */

// ============================================
// Time Range Types
// ============================================

export type TimeRange = 'today' | 'week' | 'month' | 'all';

// ============================================
// Task Metrics
// ============================================

export interface TaskMetrics {
  /** Total number of tasks */
  total: number;
  /** Tasks by status */
  byStatus: {
    pending: number;
    in_progress: number;
    completed: number;
    failed: number;
    paused: number;
  };
  /** Tasks by complexity */
  byComplexity: {
    trivial: number;
    simple: number;
    moderate: number;
    complex: number;
    expert: number;
  };
  /** Tasks by category */
  byCategory: {
    feature: number;
    bugfix: number;
    refactor: number;
    documentation: number;
    test: number;
    other: number;
  };
  /** Average completion time in minutes */
  avgCompletionTime: number;
  /** Success rate percentage */
  successRate: number;
  /** Tasks created over time (for chart) */
  timeline: TimelineDataPoint[];
}

export interface TimelineDataPoint {
  date: string;
  count: number;
  completed: number;
  failed: number;
}

// ============================================
// Provider Metrics
// ============================================

export interface ProviderMetrics {
  /** Provider usage breakdown */
  usage: {
    claude: ProviderUsage;
    ollama: ProviderUsage;
  };
  /** Current provider status */
  status: {
    claude: ProviderStatus;
    ollama: ProviderStatus;
  };
  /** Cost estimation (Claude API) */
  estimatedCost: {
    today: number;
    week: number;
    month: number;
    total: number;
  };
  /** Provider usage over time */
  timeline: ProviderTimelineDataPoint[];
}

export interface ProviderUsage {
  /** Number of requests */
  requests: number;
  /** Total tokens used */
  tokensUsed: number;
  /** Input tokens */
  inputTokens: number;
  /** Output tokens */
  outputTokens: number;
  /** Average response time in ms */
  avgResponseTime: number;
  /** Number of errors */
  errors: number;
  /** Error rate percentage */
  errorRate: number;
}

export interface ProviderStatus {
  status: 'available' | 'degraded' | 'unavailable';
  lastChecked: string;
  responseTime?: number;
  errorMessage?: string;
}

export interface ProviderTimelineDataPoint {
  date: string;
  claudeRequests: number;
  ollamaRequests: number;
  claudeTokens: number;
  ollamaTokens: number;
}

// ============================================
// Performance Metrics
// ============================================

export interface PerformanceMetrics {
  /** Phase performance breakdown */
  phases: {
    spec: PhasePerformance;
    planning: PhasePerformance;
    coding: PhasePerformance;
    qa: PhasePerformance;
  };
  /** Model performance comparison */
  models: ModelPerformance[];
  /** Overall performance score (0-100) */
  overallScore: number;
}

export interface PhasePerformance {
  /** Phase name */
  name: string;
  /** Average duration in minutes */
  avgDuration: number;
  /** Success rate percentage */
  successRate: number;
  /** Number of retries */
  retries: number;
  /** Most used model */
  topModel: string;
}

export interface ModelPerformance {
  /** Model identifier */
  model: string;
  /** Provider (claude or ollama) */
  provider: 'claude' | 'ollama';
  /** Number of tasks completed */
  tasksCompleted: number;
  /** Average completion time in minutes */
  avgCompletionTime: number;
  /** Success rate percentage */
  successRate: number;
  /** Quality score (0-100) based on QA pass rate */
  qualityScore: number;
}

// ============================================
// Resource Metrics
// ============================================

export interface ResourceMetrics {
  /** Current hardware status */
  hardware: HardwareStatus;
  /** Resource usage over time */
  timeline: ResourceTimelineDataPoint[];
  /** Resource alerts */
  alerts: ResourceAlert[];
}

export interface HardwareStatus {
  cpu: {
    model: string;
    cores: number;
    usage: number;
    temperature?: number;
  };
  memory: {
    total: number;
    used: number;
    available: number;
    usagePercent: number;
  };
  gpu?: {
    model: string;
    vram: {
      total: number;
      used: number;
      available: number;
    };
    usage: number;
    temperature?: number;
  };
}

export interface ResourceTimelineDataPoint {
  timestamp: string;
  cpuUsage: number;
  memoryUsage: number;
  gpuUsage?: number;
  gpuMemoryUsage?: number;
}

export interface ResourceAlert {
  id: string;
  type: 'warning' | 'critical';
  resource: 'cpu' | 'memory' | 'gpu' | 'vram';
  message: string;
  timestamp: string;
  threshold: number;
  currentValue: number;
}

// ============================================
// Dashboard Summary
// ============================================

export interface DashboardSummary {
  /** Quick stats for header cards */
  quickStats: {
    tasksToday: number;
    tasksThisWeek: number;
    activeAgents: number;
    avgCompletionTime: number;
    successRate: number;
    estimatedSavings: number;
  };
  /** Recent activity */
  recentActivity: ActivityItem[];
  /** System health */
  systemHealth: {
    overall: 'healthy' | 'degraded' | 'critical';
    components: {
      name: string;
      status: 'healthy' | 'degraded' | 'critical';
      message?: string;
    }[];
  };
}

export interface ActivityItem {
  id: string;
  type: 'task_created' | 'task_completed' | 'task_failed' | 'provider_switch' | 'rate_limit' | 'error';
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Aggregated Metrics Response
// ============================================

export interface MetricsData {
  tasks: TaskMetrics;
  providers: ProviderMetrics;
  performance: PerformanceMetrics;
  resources: ResourceMetrics;
  summary: DashboardSummary;
  lastUpdated: string;
}
