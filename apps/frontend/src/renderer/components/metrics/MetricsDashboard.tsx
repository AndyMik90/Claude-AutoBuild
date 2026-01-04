/**
 * MetricsDashboard - Main dashboard component for displaying metrics
 * Shows task statistics, provider usage, performance data, and system health
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  BarChart3,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
  TrendingUp,
  Server,
  Cloud,
  Cpu,
  HardDrive,
  RefreshCw,
  Calendar,
  DollarSign,
  Gauge
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Separator } from '../ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../../lib/utils';
import type { MetricsData, TimeRange, ActivityItem } from '../../../shared/types/metrics';

// ============================================
// Mock Data Generator (for demo purposes)
// ============================================

function generateMockMetrics(): MetricsData {
  const now = new Date();
  
  // Generate timeline data
  const taskTimeline = [];
  const providerTimeline = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    taskTimeline.push({
      date: dateStr,
      count: Math.floor(Math.random() * 10) + 1,
      completed: Math.floor(Math.random() * 8) + 1,
      failed: Math.floor(Math.random() * 2)
    });
    
    providerTimeline.push({
      date: dateStr,
      claudeRequests: Math.floor(Math.random() * 50) + 10,
      ollamaRequests: Math.floor(Math.random() * 100) + 20,
      claudeTokens: Math.floor(Math.random() * 50000) + 10000,
      ollamaTokens: Math.floor(Math.random() * 30000) + 5000
    });
  }
  
  return {
    tasks: {
      total: 156,
      byStatus: {
        pending: 12,
        in_progress: 5,
        completed: 128,
        failed: 8,
        paused: 3
      },
      byComplexity: {
        trivial: 23,
        simple: 45,
        moderate: 52,
        complex: 28,
        expert: 8
      },
      byCategory: {
        feature: 48,
        bugfix: 35,
        refactor: 28,
        documentation: 18,
        test: 15,
        other: 12
      },
      avgCompletionTime: 12.5,
      successRate: 94.1,
      timeline: taskTimeline
    },
    providers: {
      usage: {
        claude: {
          requests: 1247,
          tokensUsed: 2450000,
          inputTokens: 1800000,
          outputTokens: 650000,
          avgResponseTime: 2340,
          errors: 23,
          errorRate: 1.8
        },
        ollama: {
          requests: 3892,
          tokensUsed: 1890000,
          inputTokens: 1200000,
          outputTokens: 690000,
          avgResponseTime: 890,
          errors: 12,
          errorRate: 0.3
        }
      },
      status: {
        claude: { status: 'available', lastChecked: now.toISOString(), responseTime: 234 },
        ollama: { status: 'available', lastChecked: now.toISOString(), responseTime: 45 }
      },
      estimatedCost: {
        today: 2.45,
        week: 18.90,
        month: 67.50,
        total: 245.80
      },
      timeline: providerTimeline
    },
    performance: {
      phases: {
        spec: { name: 'Spec Creation', avgDuration: 3.2, successRate: 98.5, retries: 5, topModel: 'opus' },
        planning: { name: 'Planning', avgDuration: 2.8, successRate: 97.2, retries: 8, topModel: 'opus' },
        coding: { name: 'Coding', avgDuration: 8.5, successRate: 92.1, retries: 24, topModel: 'qwen2.5-coder:7b' },
        qa: { name: 'QA Review', avgDuration: 1.5, successRate: 99.1, retries: 3, topModel: 'llama3.1:8b' }
      },
      models: [
        { model: 'claude-opus-4-5', provider: 'claude', tasksCompleted: 89, avgCompletionTime: 14.2, successRate: 96.5, qualityScore: 94 },
        { model: 'qwen2.5-coder:7b', provider: 'ollama', tasksCompleted: 156, avgCompletionTime: 8.5, successRate: 91.2, qualityScore: 88 },
        { model: 'llama3.1:8b', provider: 'ollama', tasksCompleted: 234, avgCompletionTime: 6.2, successRate: 89.5, qualityScore: 85 },
        { model: 'claude-sonnet-4-5', provider: 'claude', tasksCompleted: 67, avgCompletionTime: 9.8, successRate: 94.2, qualityScore: 91 }
      ],
      overallScore: 92.4
    },
    resources: {
      hardware: {
        cpu: { model: 'AMD Ryzen 7 2700X', cores: 16, usage: 34, temperature: 52 },
        memory: { total: 32, used: 18, available: 14, usagePercent: 56 },
        gpu: { model: 'NVIDIA RTX 3080 Ti', vram: { total: 12288, used: 8500, available: 3788 }, usage: 45, temperature: 65 }
      },
      timeline: [],
      alerts: []
    },
    summary: {
      quickStats: {
        tasksToday: 8,
        tasksThisWeek: 42,
        activeAgents: 3,
        avgCompletionTime: 12.5,
        successRate: 94.1,
        estimatedSavings: 156.40
      },
      recentActivity: [
        { id: '1', type: 'task_completed', message: 'Task "Add user authentication" completed', timestamp: new Date(Date.now() - 300000).toISOString() },
        { id: '2', type: 'task_created', message: 'Task "Fix login bug" created', timestamp: new Date(Date.now() - 600000).toISOString() },
        { id: '3', type: 'provider_switch', message: 'Switched to Ollama for coding phase', timestamp: new Date(Date.now() - 900000).toISOString() },
        { id: '4', type: 'task_completed', message: 'Task "Update documentation" completed', timestamp: new Date(Date.now() - 1200000).toISOString() },
        { id: '5', type: 'rate_limit', message: 'Claude API rate limit - paused for 60s', timestamp: new Date(Date.now() - 1800000).toISOString() }
      ],
      systemHealth: {
        overall: 'healthy',
        components: [
          { name: 'Claude API', status: 'healthy' },
          { name: 'Ollama', status: 'healthy' },
          { name: 'Task Queue', status: 'healthy' }
        ]
      }
    },
    lastUpdated: now.toISOString()
  };
}

// ============================================
// Sub-Components
// ============================================

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: { value: number; positive: boolean };
  className?: string;
}

function StatCard({ title, value, subtitle, icon: Icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            {trend && (
              <div className={cn(
                'flex items-center gap-1 text-xs',
                trend.positive ? 'text-green-500' : 'text-red-500'
              )}>
                <TrendingUp className={cn('h-3 w-3', !trend.positive && 'rotate-180')} />
                <span>{trend.positive ? '+' : ''}{trend.value}%</span>
              </div>
            )}
          </div>
          <div className="rounded-lg bg-primary/10 p-2">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface MiniChartProps {
  data: number[];
  color?: string;
  height?: number;
}

function MiniChart({ data, color = 'currentColor', height = 40 }: MiniChartProps) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  
  return (
    <svg viewBox={`0 0 100 ${height}`} className="w-full" style={{ height }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface ProgressBarProps {
  label: string;
  value: number;
  max?: number;
  color?: string;
  showPercent?: boolean;
}

function ProgressBar({ label, value, max = 100, color, showPercent = true }: ProgressBarProps) {
  const percent = (value / max) * 100;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{showPercent ? `${percent.toFixed(1)}%` : value}</span>
      </div>
      <Progress value={percent} className="h-2" />
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function MetricsDashboard() {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  
  const loadMetrics = useCallback(async () => {
    setIsLoading(true);
    try {
      // TODO: Replace with actual API call
      // const data = await window.electron.provider.getMetrics(timeRange);
      const data = generateMockMetrics();
      setMetrics(data);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to load metrics:', error);
    } finally {
      setIsLoading(false);
    }
  }, [timeRange]);
  
  useEffect(() => {
    loadMetrics();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadMetrics, 30000);
    return () => clearInterval(interval);
  }, [loadMetrics]);
  
  if (!metrics) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  const { tasks, providers, performance, resources, summary } = metrics;
  
  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Metrics Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
              <SelectTrigger className="w-32">
                <Calendar className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={loadMetrics} disabled={isLoading}>
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </Button>
          </div>
        </div>
        
        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Tasks Today"
            value={summary.quickStats.tasksToday}
            subtitle={`${summary.quickStats.tasksThisWeek} this week`}
            icon={Activity}
            trend={{ value: 12, positive: true }}
          />
          <StatCard
            title="Success Rate"
            value={`${summary.quickStats.successRate.toFixed(1)}%`}
            subtitle="Task completion rate"
            icon={CheckCircle2}
            trend={{ value: 2.3, positive: true }}
          />
          <StatCard
            title="Avg. Completion"
            value={`${summary.quickStats.avgCompletionTime.toFixed(1)}m`}
            subtitle="Per task"
            icon={Clock}
          />
          <StatCard
            title="Est. Savings"
            value={`$${summary.quickStats.estimatedSavings.toFixed(2)}`}
            subtitle="Using local models"
            icon={DollarSign}
            trend={{ value: 15, positive: true }}
          />
        </div>
        
        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Task Statistics */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Task Statistics
              </CardTitle>
              <CardDescription>Overview of task status and distribution</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Status Distribution */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium">By Status</h4>
                <div className="grid grid-cols-5 gap-2">
                  {Object.entries(tasks.byStatus).map(([status, count]) => (
                    <div key={status} className="text-center">
                      <div className={cn(
                        'mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-full',
                        status === 'completed' && 'bg-green-500/10 text-green-500',
                        status === 'in_progress' && 'bg-blue-500/10 text-blue-500',
                        status === 'pending' && 'bg-yellow-500/10 text-yellow-500',
                        status === 'failed' && 'bg-red-500/10 text-red-500',
                        status === 'paused' && 'bg-gray-500/10 text-gray-500'
                      )}>
                        <span className="text-lg font-bold">{count}</span>
                      </div>
                      <span className="text-xs capitalize text-muted-foreground">
                        {status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              <Separator />
              
              {/* Complexity Distribution */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium">By Complexity</h4>
                <div className="space-y-2">
                  {Object.entries(tasks.byComplexity).map(([complexity, count]) => (
                    <ProgressBar
                      key={complexity}
                      label={complexity.charAt(0).toUpperCase() + complexity.slice(1)}
                      value={count}
                      max={tasks.total}
                      showPercent={false}
                    />
                  ))}
                </div>
              </div>
              
              <Separator />
              
              {/* Category Distribution */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium">By Category</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(tasks.byCategory).map(([category, count]) => (
                    <Badge key={category} variant="secondary" className="gap-1">
                      {category}
                      <span className="font-bold">{count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Provider Usage */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Provider Usage
              </CardTitle>
              <CardDescription>API requests and token usage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Claude */}
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">Claude</span>
                  </div>
                  <Badge variant={providers.status.claude.status === 'available' ? 'default' : 'destructive'}>
                    {providers.status.claude.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Requests:</span>
                    <span className="ml-1 font-medium">{providers.usage.claude.requests.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tokens:</span>
                    <span className="ml-1 font-medium">{(providers.usage.claude.tokensUsed / 1000000).toFixed(2)}M</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg Time:</span>
                    <span className="ml-1 font-medium">{providers.usage.claude.avgResponseTime}ms</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Error Rate:</span>
                    <span className="ml-1 font-medium">{providers.usage.claude.errorRate}%</span>
                  </div>
                </div>
              </div>
              
              {/* Ollama */}
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-green-500" />
                    <span className="font-medium">Ollama</span>
                  </div>
                  <Badge variant={providers.status.ollama.status === 'available' ? 'default' : 'destructive'}>
                    {providers.status.ollama.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Requests:</span>
                    <span className="ml-1 font-medium">{providers.usage.ollama.requests.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tokens:</span>
                    <span className="ml-1 font-medium">{(providers.usage.ollama.tokensUsed / 1000000).toFixed(2)}M</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg Time:</span>
                    <span className="ml-1 font-medium">{providers.usage.ollama.avgResponseTime}ms</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Error Rate:</span>
                    <span className="ml-1 font-medium">{providers.usage.ollama.errorRate}%</span>
                  </div>
                </div>
              </div>
              
              <Separator />
              
              {/* Cost Estimation */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Estimated Cost (Claude API)</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Today:</span>
                    <span className="font-medium">${providers.estimatedCost.today.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">This Week:</span>
                    <span className="font-medium">${providers.estimatedCost.week.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">This Month:</span>
                    <span className="font-medium">${providers.estimatedCost.month.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-medium">${providers.estimatedCost.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Performance & Resources Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Phase Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-5 w-5" />
                Phase Performance
              </CardTitle>
              <CardDescription>Performance metrics by task phase</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(performance.phases).map(([key, phase]) => (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{phase.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {phase.avgDuration.toFixed(1)}m avg
                        </Badge>
                        <Badge 
                          variant={phase.successRate >= 95 ? 'default' : phase.successRate >= 90 ? 'secondary' : 'destructive'}
                          className="text-xs"
                        >
                          {phase.successRate.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                    <Progress value={phase.successRate} className="h-2" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Top model: {phase.topModel}</span>
                      <span>{phase.retries} retries</span>
                    </div>
                  </div>
                ))}
              </div>
              
              <Separator className="my-4" />
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Overall Performance Score</span>
                <div className="flex items-center gap-2">
                  <Progress value={performance.overallScore} className="h-3 w-24" />
                  <span className="text-lg font-bold">{performance.overallScore.toFixed(1)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* System Resources */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5" />
                System Resources
              </CardTitle>
              <CardDescription>Hardware utilization and status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* CPU */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">CPU</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {resources.hardware.cpu.model}
                  </span>
                </div>
                <ProgressBar
                  label={`${resources.hardware.cpu.cores} cores`}
                  value={resources.hardware.cpu.usage}
                />
              </div>
              
              {/* Memory */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-green-500" />
                    <span className="font-medium">Memory</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {resources.hardware.memory.used}GB / {resources.hardware.memory.total}GB
                  </span>
                </div>
                <ProgressBar
                  label={`${resources.hardware.memory.available}GB available`}
                  value={resources.hardware.memory.usagePercent}
                />
              </div>
              
              {/* GPU */}
              {resources.hardware.gpu && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      <span className="font-medium">GPU</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {resources.hardware.gpu.model}
                    </span>
                  </div>
                  <ProgressBar
                    label={`VRAM: ${(resources.hardware.gpu.vram.used / 1024).toFixed(1)}GB / ${(resources.hardware.gpu.vram.total / 1024).toFixed(1)}GB`}
                    value={(resources.hardware.gpu.vram.used / resources.hardware.gpu.vram.total) * 100}
                  />
                  <ProgressBar
                    label="GPU Utilization"
                    value={resources.hardware.gpu.usage}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* Recent Activity & Model Performance */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Activity
              </CardTitle>
              <CardDescription>Latest events and actions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {summary.recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className={cn(
                      'mt-0.5 rounded-full p-1',
                      activity.type === 'task_completed' && 'bg-green-500/10 text-green-500',
                      activity.type === 'task_created' && 'bg-blue-500/10 text-blue-500',
                      activity.type === 'task_failed' && 'bg-red-500/10 text-red-500',
                      activity.type === 'provider_switch' && 'bg-yellow-500/10 text-yellow-500',
                      activity.type === 'rate_limit' && 'bg-orange-500/10 text-orange-500'
                    )}>
                      {activity.type === 'task_completed' && <CheckCircle2 className="h-3 w-3" />}
                      {activity.type === 'task_created' && <Activity className="h-3 w-3" />}
                      {activity.type === 'task_failed' && <XCircle className="h-3 w-3" />}
                      {activity.type === 'provider_switch' && <RefreshCw className="h-3 w-3" />}
                      {activity.type === 'rate_limit' && <Clock className="h-3 w-3" />}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm">{activity.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(activity.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          {/* Model Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Model Performance
              </CardTitle>
              <CardDescription>Comparison of model effectiveness</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {performance.models.slice(0, 5).map((model) => (
                  <div key={model.model} className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {model.provider === 'claude' ? (
                          <Cloud className="h-4 w-4 text-blue-500" />
                        ) : (
                          <Server className="h-4 w-4 text-green-500" />
                        )}
                        <span className="font-medium text-sm">{model.model}</span>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {model.tasksCompleted} tasks
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Avg Time:</span>
                        <span className="ml-1 font-medium">{model.avgCompletionTime.toFixed(1)}m</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Success:</span>
                        <span className="ml-1 font-medium">{model.successRate.toFixed(1)}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Quality:</span>
                        <span className="ml-1 font-medium">{model.qualityScore}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className={cn(
                  'h-3 w-3 rounded-full',
                  summary.systemHealth.overall === 'healthy' && 'bg-green-500',
                  summary.systemHealth.overall === 'degraded' && 'bg-yellow-500',
                  summary.systemHealth.overall === 'critical' && 'bg-red-500'
                )} />
                <span className="font-medium capitalize">{summary.systemHealth.overall}</span>
              </div>
              <Separator orientation="vertical" className="h-6" />
              {summary.systemHealth.components.map((component) => (
                <div key={component.name} className="flex items-center gap-2">
                  <div className={cn(
                    'h-2 w-2 rounded-full',
                    component.status === 'healthy' && 'bg-green-500',
                    component.status === 'degraded' && 'bg-yellow-500',
                    component.status === 'critical' && 'bg-red-500'
                  )} />
                  <span className="text-sm text-muted-foreground">{component.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}

export default MetricsDashboard;
