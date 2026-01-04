"""
Metrics Service for Auto-Claude
Collects and aggregates metrics for tasks, providers, performance, and resources.
"""

import os
import json
import time
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Literal
from dataclasses import dataclass, field, asdict
from pathlib import Path
from collections import defaultdict

logger = logging.getLogger(__name__)

# ============================================
# Data Classes
# ============================================

@dataclass
class TaskStats:
    """Task statistics"""
    total: int = 0
    pending: int = 0
    in_progress: int = 0
    completed: int = 0
    failed: int = 0
    paused: int = 0
    
    # By complexity
    trivial: int = 0
    simple: int = 0
    moderate: int = 0
    complex: int = 0
    expert: int = 0
    
    # By category
    feature: int = 0
    bugfix: int = 0
    refactor: int = 0
    documentation: int = 0
    test: int = 0
    other: int = 0
    
    # Performance
    avg_completion_time: float = 0.0
    success_rate: float = 0.0


@dataclass
class ProviderStats:
    """Provider usage statistics"""
    requests: int = 0
    tokens_used: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    avg_response_time: float = 0.0
    errors: int = 0
    error_rate: float = 0.0


@dataclass
class MetricsRecord:
    """Single metrics record for persistence"""
    timestamp: str
    event_type: str
    provider: Optional[str] = None
    model: Optional[str] = None
    task_id: Optional[str] = None
    phase: Optional[str] = None
    duration_ms: Optional[float] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    success: bool = True
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class MetricsService:
    """
    Service for collecting, storing, and aggregating metrics.
    Stores metrics in JSON files for persistence.
    """
    
    def __init__(self, data_dir: Optional[str] = None):
        """
        Initialize the metrics service.
        
        Args:
            data_dir: Directory to store metrics data. Defaults to ~/.auto-claude/metrics
        """
        self.data_dir = Path(data_dir) if data_dir else Path.home() / ".auto-claude" / "metrics"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        # In-memory cache for current session
        self._session_metrics: List[MetricsRecord] = []
        self._session_start = datetime.now()
        
        # Provider response times (for averaging)
        self._response_times: Dict[str, List[float]] = defaultdict(list)
        
        # Load existing metrics
        self._load_metrics()
    
    def _get_metrics_file(self, date: Optional[datetime] = None) -> Path:
        """Get the metrics file path for a given date."""
        date = date or datetime.now()
        return self.data_dir / f"metrics_{date.strftime('%Y-%m-%d')}.json"
    
    def _load_metrics(self) -> None:
        """Load metrics from today's file."""
        try:
            metrics_file = self._get_metrics_file()
            if metrics_file.exists():
                with open(metrics_file, 'r') as f:
                    data = json.load(f)
                    self._session_metrics = [
                        MetricsRecord(**record) for record in data.get('records', [])
                    ]
        except Exception as e:
            logger.error(f"Failed to load metrics: {e}")
            self._session_metrics = []
    
    def _save_metrics(self) -> None:
        """Save current metrics to file."""
        try:
            metrics_file = self._get_metrics_file()
            data = {
                'date': datetime.now().strftime('%Y-%m-%d'),
                'records': [asdict(r) for r in self._session_metrics]
            }
            with open(metrics_file, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save metrics: {e}")
    
    # ============================================
    # Event Recording
    # ============================================
    
    def record_request(
        self,
        provider: str,
        model: str,
        task_id: Optional[str] = None,
        phase: Optional[str] = None,
        duration_ms: float = 0,
        tokens_in: int = 0,
        tokens_out: int = 0,
        success: bool = True,
        error_message: Optional[str] = None
    ) -> None:
        """Record an API request."""
        record = MetricsRecord(
            timestamp=datetime.now().isoformat(),
            event_type='api_request',
            provider=provider,
            model=model,
            task_id=task_id,
            phase=phase,
            duration_ms=duration_ms,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            success=success,
            error_message=error_message
        )
        self._session_metrics.append(record)
        self._response_times[provider].append(duration_ms)
        self._save_metrics()
    
    def record_task_event(
        self,
        task_id: str,
        event_type: Literal['created', 'started', 'completed', 'failed', 'paused'],
        phase: Optional[str] = None,
        duration_ms: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Record a task lifecycle event."""
        record = MetricsRecord(
            timestamp=datetime.now().isoformat(),
            event_type=f'task_{event_type}',
            task_id=task_id,
            phase=phase,
            duration_ms=duration_ms,
            success=event_type != 'failed',
            metadata=metadata or {}
        )
        self._session_metrics.append(record)
        self._save_metrics()
    
    def record_provider_switch(
        self,
        from_provider: str,
        to_provider: str,
        reason: str,
        task_id: Optional[str] = None
    ) -> None:
        """Record a provider switch event."""
        record = MetricsRecord(
            timestamp=datetime.now().isoformat(),
            event_type='provider_switch',
            provider=to_provider,
            task_id=task_id,
            metadata={
                'from_provider': from_provider,
                'to_provider': to_provider,
                'reason': reason
            }
        )
        self._session_metrics.append(record)
        self._save_metrics()
    
    def record_rate_limit(
        self,
        provider: str,
        wait_time: float,
        task_id: Optional[str] = None
    ) -> None:
        """Record a rate limit event."""
        record = MetricsRecord(
            timestamp=datetime.now().isoformat(),
            event_type='rate_limit',
            provider=provider,
            task_id=task_id,
            metadata={
                'wait_time': wait_time
            }
        )
        self._session_metrics.append(record)
        self._save_metrics()
    
    # ============================================
    # Metrics Aggregation
    # ============================================
    
    def get_task_metrics(self, time_range: str = 'all') -> Dict[str, Any]:
        """
        Get aggregated task metrics.
        
        Args:
            time_range: 'today', 'week', 'month', or 'all'
        
        Returns:
            Dictionary with task metrics
        """
        records = self._filter_by_time_range(time_range)
        task_records = [r for r in records if r.event_type.startswith('task_')]
        
        # Count by status
        status_counts = defaultdict(int)
        complexity_counts = defaultdict(int)
        category_counts = defaultdict(int)
        completion_times = []
        
        task_states: Dict[str, str] = {}
        task_start_times: Dict[str, datetime] = {}
        
        for record in task_records:
            task_id = record.task_id
            if not task_id:
                continue
            
            if record.event_type == 'task_created':
                task_states[task_id] = 'pending'
                if record.metadata:
                    complexity = record.metadata.get('complexity', 'moderate')
                    category = record.metadata.get('category', 'other')
                    complexity_counts[complexity] += 1
                    category_counts[category] += 1
            elif record.event_type == 'task_started':
                task_states[task_id] = 'in_progress'
                task_start_times[task_id] = datetime.fromisoformat(record.timestamp)
            elif record.event_type == 'task_completed':
                task_states[task_id] = 'completed'
                if task_id in task_start_times:
                    duration = (datetime.fromisoformat(record.timestamp) - task_start_times[task_id]).total_seconds() / 60
                    completion_times.append(duration)
            elif record.event_type == 'task_failed':
                task_states[task_id] = 'failed'
            elif record.event_type == 'task_paused':
                task_states[task_id] = 'paused'
        
        # Count final states
        for state in task_states.values():
            status_counts[state] += 1
        
        total_tasks = len(task_states)
        completed = status_counts.get('completed', 0)
        failed = status_counts.get('failed', 0)
        
        # Calculate timeline
        timeline = self._calculate_task_timeline(task_records, time_range)
        
        return {
            'total': total_tasks,
            'byStatus': {
                'pending': status_counts.get('pending', 0),
                'in_progress': status_counts.get('in_progress', 0),
                'completed': completed,
                'failed': failed,
                'paused': status_counts.get('paused', 0)
            },
            'byComplexity': {
                'trivial': complexity_counts.get('trivial', 0),
                'simple': complexity_counts.get('simple', 0),
                'moderate': complexity_counts.get('moderate', 0),
                'complex': complexity_counts.get('complex', 0),
                'expert': complexity_counts.get('expert', 0)
            },
            'byCategory': {
                'feature': category_counts.get('feature', 0),
                'bugfix': category_counts.get('bugfix', 0),
                'refactor': category_counts.get('refactor', 0),
                'documentation': category_counts.get('documentation', 0),
                'test': category_counts.get('test', 0),
                'other': category_counts.get('other', 0)
            },
            'avgCompletionTime': sum(completion_times) / len(completion_times) if completion_times else 0,
            'successRate': (completed / (completed + failed) * 100) if (completed + failed) > 0 else 0,
            'timeline': timeline
        }
    
    def get_provider_metrics(self, time_range: str = 'all') -> Dict[str, Any]:
        """
        Get aggregated provider metrics.
        
        Args:
            time_range: 'today', 'week', 'month', or 'all'
        
        Returns:
            Dictionary with provider metrics
        """
        records = self._filter_by_time_range(time_range)
        api_records = [r for r in records if r.event_type == 'api_request']
        
        provider_stats: Dict[str, Dict[str, Any]] = {
            'claude': {'requests': 0, 'tokens_in': 0, 'tokens_out': 0, 'errors': 0, 'response_times': []},
            'ollama': {'requests': 0, 'tokens_in': 0, 'tokens_out': 0, 'errors': 0, 'response_times': []}
        }
        
        for record in api_records:
            provider = record.provider or 'claude'
            if provider not in provider_stats:
                provider_stats[provider] = {'requests': 0, 'tokens_in': 0, 'tokens_out': 0, 'errors': 0, 'response_times': []}
            
            stats = provider_stats[provider]
            stats['requests'] += 1
            stats['tokens_in'] += record.tokens_in or 0
            stats['tokens_out'] += record.tokens_out or 0
            if not record.success:
                stats['errors'] += 1
            if record.duration_ms:
                stats['response_times'].append(record.duration_ms)
        
        # Calculate averages and rates
        usage = {}
        for provider, stats in provider_stats.items():
            requests = stats['requests']
            errors = stats['errors']
            response_times = stats['response_times']
            
            usage[provider] = {
                'requests': requests,
                'tokensUsed': stats['tokens_in'] + stats['tokens_out'],
                'inputTokens': stats['tokens_in'],
                'outputTokens': stats['tokens_out'],
                'avgResponseTime': sum(response_times) / len(response_times) if response_times else 0,
                'errors': errors,
                'errorRate': (errors / requests * 100) if requests > 0 else 0
            }
        
        # Estimate costs (Claude API pricing approximation)
        claude_stats = usage.get('claude', {})
        input_tokens = claude_stats.get('inputTokens', 0)
        output_tokens = claude_stats.get('outputTokens', 0)
        
        # Approximate pricing: $15/M input, $75/M output for Opus
        estimated_cost = (input_tokens * 15 / 1_000_000) + (output_tokens * 75 / 1_000_000)
        
        # Calculate timeline
        timeline = self._calculate_provider_timeline(api_records, time_range)
        
        return {
            'usage': usage,
            'status': {
                'claude': {'status': 'available', 'lastChecked': datetime.now().isoformat()},
                'ollama': {'status': 'available', 'lastChecked': datetime.now().isoformat()}
            },
            'estimatedCost': {
                'today': estimated_cost if time_range == 'today' else 0,
                'week': estimated_cost if time_range in ['today', 'week'] else 0,
                'month': estimated_cost if time_range in ['today', 'week', 'month'] else 0,
                'total': estimated_cost
            },
            'timeline': timeline
        }
    
    def get_performance_metrics(self, time_range: str = 'all') -> Dict[str, Any]:
        """
        Get performance metrics by phase and model.
        
        Args:
            time_range: 'today', 'week', 'month', or 'all'
        
        Returns:
            Dictionary with performance metrics
        """
        records = self._filter_by_time_range(time_range)
        
        # Phase performance
        phase_stats: Dict[str, Dict[str, Any]] = {
            'spec': {'durations': [], 'successes': 0, 'failures': 0, 'retries': 0, 'models': defaultdict(int)},
            'planning': {'durations': [], 'successes': 0, 'failures': 0, 'retries': 0, 'models': defaultdict(int)},
            'coding': {'durations': [], 'successes': 0, 'failures': 0, 'retries': 0, 'models': defaultdict(int)},
            'qa': {'durations': [], 'successes': 0, 'failures': 0, 'retries': 0, 'models': defaultdict(int)}
        }
        
        # Model performance
        model_stats: Dict[str, Dict[str, Any]] = {}
        
        for record in records:
            phase = record.phase
            model = record.model
            
            if phase and phase in phase_stats:
                stats = phase_stats[phase]
                if record.duration_ms:
                    stats['durations'].append(record.duration_ms / 60000)  # Convert to minutes
                if record.success:
                    stats['successes'] += 1
                else:
                    stats['failures'] += 1
                if model:
                    stats['models'][model] += 1
            
            if model and record.event_type == 'api_request':
                if model not in model_stats:
                    model_stats[model] = {
                        'provider': record.provider or 'claude',
                        'completions': 0,
                        'durations': [],
                        'successes': 0,
                        'failures': 0
                    }
                stats = model_stats[model]
                stats['completions'] += 1
                if record.duration_ms:
                    stats['durations'].append(record.duration_ms / 60000)
                if record.success:
                    stats['successes'] += 1
                else:
                    stats['failures'] += 1
        
        # Calculate phase metrics
        phases = {}
        for phase, stats in phase_stats.items():
            durations = stats['durations']
            total = stats['successes'] + stats['failures']
            top_model = max(stats['models'].items(), key=lambda x: x[1])[0] if stats['models'] else 'opus'
            
            phases[phase] = {
                'name': phase.capitalize(),
                'avgDuration': sum(durations) / len(durations) if durations else 0,
                'successRate': (stats['successes'] / total * 100) if total > 0 else 100,
                'retries': stats['retries'],
                'topModel': top_model
            }
        
        # Calculate model metrics
        models = []
        for model, stats in model_stats.items():
            durations = stats['durations']
            total = stats['successes'] + stats['failures']
            
            models.append({
                'model': model,
                'provider': stats['provider'],
                'tasksCompleted': stats['completions'],
                'avgCompletionTime': sum(durations) / len(durations) if durations else 0,
                'successRate': (stats['successes'] / total * 100) if total > 0 else 100,
                'qualityScore': min(100, (stats['successes'] / total * 100) + 10) if total > 0 else 85
            })
        
        # Calculate overall score
        all_success_rates = [p['successRate'] for p in phases.values()]
        overall_score = sum(all_success_rates) / len(all_success_rates) if all_success_rates else 85
        
        return {
            'phases': phases,
            'models': sorted(models, key=lambda x: x['tasksCompleted'], reverse=True),
            'overallScore': overall_score
        }
    
    def get_dashboard_summary(self, time_range: str = 'all') -> Dict[str, Any]:
        """
        Get dashboard summary with quick stats and recent activity.
        
        Args:
            time_range: 'today', 'week', 'month', or 'all'
        
        Returns:
            Dictionary with dashboard summary
        """
        task_metrics = self.get_task_metrics(time_range)
        provider_metrics = self.get_provider_metrics(time_range)
        
        # Get today's and this week's tasks
        today_tasks = self.get_task_metrics('today')
        week_tasks = self.get_task_metrics('week')
        
        # Recent activity
        recent_records = sorted(
            self._session_metrics[-50:],
            key=lambda r: r.timestamp,
            reverse=True
        )[:10]
        
        recent_activity = []
        for record in recent_records:
            activity_type = record.event_type
            if activity_type.startswith('task_'):
                activity_type = activity_type.replace('task_', 'task_')
            
            message = self._format_activity_message(record)
            recent_activity.append({
                'id': f"{record.timestamp}_{record.event_type}",
                'type': activity_type,
                'message': message,
                'timestamp': record.timestamp,
                'metadata': record.metadata
            })
        
        # Calculate estimated savings (local vs cloud)
        ollama_requests = provider_metrics['usage'].get('ollama', {}).get('requests', 0)
        estimated_savings = ollama_requests * 0.02  # Approximate $0.02 per request saved
        
        return {
            'quickStats': {
                'tasksToday': today_tasks['total'],
                'tasksThisWeek': week_tasks['total'],
                'activeAgents': task_metrics['byStatus'].get('in_progress', 0),
                'avgCompletionTime': task_metrics['avgCompletionTime'],
                'successRate': task_metrics['successRate'],
                'estimatedSavings': estimated_savings
            },
            'recentActivity': recent_activity,
            'systemHealth': {
                'overall': 'healthy',
                'components': [
                    {'name': 'Claude API', 'status': 'healthy'},
                    {'name': 'Ollama', 'status': 'healthy'},
                    {'name': 'Task Queue', 'status': 'healthy'}
                ]
            }
        }
    
    def get_all_metrics(self, time_range: str = 'all') -> Dict[str, Any]:
        """
        Get all metrics aggregated.
        
        Args:
            time_range: 'today', 'week', 'month', or 'all'
        
        Returns:
            Dictionary with all metrics
        """
        return {
            'tasks': self.get_task_metrics(time_range),
            'providers': self.get_provider_metrics(time_range),
            'performance': self.get_performance_metrics(time_range),
            'resources': self._get_resource_metrics(),
            'summary': self.get_dashboard_summary(time_range),
            'lastUpdated': datetime.now().isoformat()
        }
    
    # ============================================
    # Helper Methods
    # ============================================
    
    def _filter_by_time_range(self, time_range: str) -> List[MetricsRecord]:
        """Filter records by time range."""
        now = datetime.now()
        
        if time_range == 'today':
            cutoff = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif time_range == 'week':
            cutoff = now - timedelta(days=7)
        elif time_range == 'month':
            cutoff = now - timedelta(days=30)
        else:
            return self._session_metrics
        
        return [
            r for r in self._session_metrics
            if datetime.fromisoformat(r.timestamp) >= cutoff
        ]
    
    def _calculate_task_timeline(
        self,
        records: List[MetricsRecord],
        time_range: str
    ) -> List[Dict[str, Any]]:
        """Calculate task timeline data."""
        daily_counts: Dict[str, Dict[str, int]] = defaultdict(lambda: {'count': 0, 'completed': 0, 'failed': 0})
        
        for record in records:
            date = record.timestamp[:10]  # YYYY-MM-DD
            if record.event_type == 'task_created':
                daily_counts[date]['count'] += 1
            elif record.event_type == 'task_completed':
                daily_counts[date]['completed'] += 1
            elif record.event_type == 'task_failed':
                daily_counts[date]['failed'] += 1
        
        timeline = [
            {'date': date, **counts}
            for date, counts in sorted(daily_counts.items())
        ]
        
        return timeline[-30:]  # Last 30 days
    
    def _calculate_provider_timeline(
        self,
        records: List[MetricsRecord],
        time_range: str
    ) -> List[Dict[str, Any]]:
        """Calculate provider usage timeline."""
        daily_usage: Dict[str, Dict[str, int]] = defaultdict(
            lambda: {'claudeRequests': 0, 'ollamaRequests': 0, 'claudeTokens': 0, 'ollamaTokens': 0}
        )
        
        for record in records:
            date = record.timestamp[:10]
            provider = record.provider or 'claude'
            tokens = (record.tokens_in or 0) + (record.tokens_out or 0)
            
            if provider == 'claude':
                daily_usage[date]['claudeRequests'] += 1
                daily_usage[date]['claudeTokens'] += tokens
            else:
                daily_usage[date]['ollamaRequests'] += 1
                daily_usage[date]['ollamaTokens'] += tokens
        
        timeline = [
            {'date': date, **usage}
            for date, usage in sorted(daily_usage.items())
        ]
        
        return timeline[-30:]
    
    def _get_resource_metrics(self) -> Dict[str, Any]:
        """Get current resource metrics."""
        import psutil
        
        # CPU
        cpu_percent = psutil.cpu_percent(interval=0.1)
        cpu_count = psutil.cpu_count()
        
        # Memory
        memory = psutil.virtual_memory()
        
        # GPU (if available)
        gpu_info = None
        try:
            import subprocess
            result = subprocess.run(
                ['nvidia-smi', '--query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu',
                 '--format=csv,noheader,nounits'],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                parts = result.stdout.strip().split(', ')
                if len(parts) >= 6:
                    gpu_info = {
                        'model': parts[0],
                        'vram': {
                            'total': int(parts[1]),
                            'used': int(parts[2]),
                            'available': int(parts[3])
                        },
                        'usage': float(parts[4]),
                        'temperature': float(parts[5])
                    }
        except Exception:
            pass
        
        hardware = {
            'cpu': {
                'model': 'CPU',
                'cores': cpu_count,
                'usage': cpu_percent
            },
            'memory': {
                'total': memory.total // (1024 ** 3),  # GB
                'used': memory.used // (1024 ** 3),
                'available': memory.available // (1024 ** 3),
                'usagePercent': memory.percent
            }
        }
        
        if gpu_info:
            hardware['gpu'] = gpu_info
        
        return {
            'hardware': hardware,
            'timeline': [],
            'alerts': []
        }
    
    def _format_activity_message(self, record: MetricsRecord) -> str:
        """Format activity message for display."""
        event_type = record.event_type
        
        if event_type == 'task_created':
            return f"Task created: {record.task_id}"
        elif event_type == 'task_started':
            return f"Task started: {record.task_id}"
        elif event_type == 'task_completed':
            return f"Task completed: {record.task_id}"
        elif event_type == 'task_failed':
            return f"Task failed: {record.task_id}"
        elif event_type == 'api_request':
            return f"API request to {record.provider}: {record.model}"
        elif event_type == 'provider_switch':
            meta = record.metadata or {}
            return f"Switched from {meta.get('from_provider')} to {meta.get('to_provider')}"
        elif event_type == 'rate_limit':
            return f"Rate limit hit on {record.provider}"
        else:
            return f"Event: {event_type}"


# Global instance
_metrics_service: Optional[MetricsService] = None


def get_metrics_service() -> MetricsService:
    """Get the global metrics service instance."""
    global _metrics_service
    if _metrics_service is None:
        _metrics_service = MetricsService()
    return _metrics_service
