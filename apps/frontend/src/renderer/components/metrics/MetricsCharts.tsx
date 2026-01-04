/**
 * MetricsCharts - Chart components for metrics visualization
 * Uses SVG-based charts without external dependencies
 */

import { useMemo } from 'react';
import { cn } from '../../lib/utils';

// ============================================
// Types
// ============================================

interface DataPoint {
  label: string;
  value: number;
  color?: string;
}

interface TimeSeriesPoint {
  date: string;
  values: Record<string, number>;
}

// ============================================
// Line Chart
// ============================================

interface LineChartProps {
  data: TimeSeriesPoint[];
  series: { key: string; color: string; label: string }[];
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  className?: string;
}

export function LineChart({
  data,
  series,
  height = 200,
  showGrid = true,
  showLegend = true,
  className
}: LineChartProps) {
  const { points, maxValue, minValue } = useMemo(() => {
    let max = 0;
    let min = Infinity;
    
    data.forEach(point => {
      series.forEach(s => {
        const val = point.values[s.key] || 0;
        max = Math.max(max, val);
        min = Math.min(min, val);
      });
    });
    
    if (min === Infinity) min = 0;
    const range = max - min || 1;
    const padding = range * 0.1;
    
    return {
      points: data,
      maxValue: max + padding,
      minValue: Math.max(0, min - padding)
    };
  }, [data, series]);
  
  const chartWidth = 100;
  const chartHeight = height - 40;
  const range = maxValue - minValue || 1;
  
  const getPath = (key: string) => {
    if (points.length === 0) return '';
    
    const pathPoints = points.map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * chartWidth;
      const y = chartHeight - ((point.values[key] || 0) - minValue) / range * chartHeight;
      return `${x},${y}`;
    });
    
    return `M ${pathPoints.join(' L ')}`;
  };
  
  return (
    <div className={cn('space-y-2', className)}>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" style={{ height: chartHeight }}>
        {/* Grid lines */}
        {showGrid && (
          <g className="text-muted-foreground/20">
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <line
                key={ratio}
                x1="0"
                y1={chartHeight * ratio}
                x2={chartWidth}
                y2={chartHeight * ratio}
                stroke="currentColor"
                strokeDasharray="2,2"
              />
            ))}
          </g>
        )}
        
        {/* Lines */}
        {series.map((s) => (
          <path
            key={s.key}
            d={getPath(s.key)}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        
        {/* Data points */}
        {series.map((s) => (
          <g key={`points-${s.key}`}>
            {points.map((point, index) => {
              const x = (index / Math.max(points.length - 1, 1)) * chartWidth;
              const y = chartHeight - ((point.values[s.key] || 0) - minValue) / range * chartHeight;
              return (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r="2"
                  fill={s.color}
                />
              );
            })}
          </g>
        ))}
      </svg>
      
      {/* Legend */}
      {showLegend && (
        <div className="flex flex-wrap justify-center gap-4">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Bar Chart
// ============================================

interface BarChartProps {
  data: DataPoint[];
  height?: number;
  horizontal?: boolean;
  showValues?: boolean;
  className?: string;
}

export function BarChart({
  data,
  height = 200,
  horizontal = false,
  showValues = true,
  className
}: BarChartProps) {
  const maxValue = Math.max(...data.map(d => d.value), 1);
  
  const defaultColors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
  ];
  
  if (horizontal) {
    return (
      <div className={cn('space-y-2', className)}>
        {data.map((item, index) => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              {showValues && <span className="font-medium">{item.value}</span>}
            </div>
            <div className="h-4 w-full rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(item.value / maxValue) * 100}%`,
                  backgroundColor: item.color || defaultColors[index % defaultColors.length]
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }
  
  const barWidth = 100 / data.length;
  const barPadding = barWidth * 0.2;
  
  return (
    <div className={cn('space-y-2', className)}>
      <svg viewBox={`0 0 100 ${height}`} className="w-full" style={{ height }}>
        {data.map((item, index) => {
          const barHeight = (item.value / maxValue) * (height - 30);
          const x = index * barWidth + barPadding / 2;
          const y = height - 30 - barHeight;
          
          return (
            <g key={item.label}>
              <rect
                x={x}
                y={y}
                width={barWidth - barPadding}
                height={barHeight}
                rx="2"
                fill={item.color || defaultColors[index % defaultColors.length]}
              />
              {showValues && (
                <text
                  x={x + (barWidth - barPadding) / 2}
                  y={y - 4}
                  textAnchor="middle"
                  className="fill-foreground text-[8px] font-medium"
                >
                  {item.value}
                </text>
              )}
              <text
                x={x + (barWidth - barPadding) / 2}
                y={height - 10}
                textAnchor="middle"
                className="fill-muted-foreground text-[6px]"
              >
                {item.label.slice(0, 8)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ============================================
// Pie Chart
// ============================================

interface PieChartProps {
  data: DataPoint[];
  size?: number;
  donut?: boolean;
  showLegend?: boolean;
  className?: string;
}

export function PieChart({
  data,
  size = 200,
  donut = false,
  showLegend = true,
  className
}: PieChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const radius = size / 2 - 10;
  const innerRadius = donut ? radius * 0.6 : 0;
  const center = size / 2;
  
  const defaultColors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
  ];
  
  const segments = useMemo(() => {
    let currentAngle = -90;
    
    return data.map((item, index) => {
      const angle = (item.value / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;
      
      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;
      
      const x1 = center + radius * Math.cos(startRad);
      const y1 = center + radius * Math.sin(startRad);
      const x2 = center + radius * Math.cos(endRad);
      const y2 = center + radius * Math.sin(endRad);
      
      const ix1 = center + innerRadius * Math.cos(startRad);
      const iy1 = center + innerRadius * Math.sin(startRad);
      const ix2 = center + innerRadius * Math.cos(endRad);
      const iy2 = center + innerRadius * Math.sin(endRad);
      
      const largeArc = angle > 180 ? 1 : 0;
      
      let path: string;
      if (donut) {
        path = `
          M ${x1} ${y1}
          A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}
          L ${ix2} ${iy2}
          A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1}
          Z
        `;
      } else {
        path = `
          M ${center} ${center}
          L ${x1} ${y1}
          A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}
          Z
        `;
      }
      
      return {
        path,
        color: item.color || defaultColors[index % defaultColors.length],
        label: item.label,
        value: item.value,
        percent: ((item.value / total) * 100).toFixed(1)
      };
    });
  }, [data, total, radius, innerRadius, center, donut]);
  
  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
        {segments.map((segment, index) => (
          <path
            key={index}
            d={segment.path}
            fill={segment.color}
            className="transition-opacity hover:opacity-80"
          />
        ))}
        {donut && (
          <text
            x={center}
            y={center}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-foreground text-lg font-bold"
          >
            {total}
          </text>
        )}
      </svg>
      
      {showLegend && (
        <div className="flex flex-wrap justify-center gap-3">
          {segments.map((segment, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <div
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-xs text-muted-foreground">
                {segment.label} ({segment.percent}%)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Area Chart
// ============================================

interface AreaChartProps {
  data: TimeSeriesPoint[];
  series: { key: string; color: string; label: string }[];
  height?: number;
  stacked?: boolean;
  showLegend?: boolean;
  className?: string;
}

export function AreaChart({
  data,
  series,
  height = 200,
  stacked = false,
  showLegend = true,
  className
}: AreaChartProps) {
  const chartWidth = 100;
  const chartHeight = height - 40;
  
  const { maxValue, paths } = useMemo(() => {
    let max = 0;
    
    if (stacked) {
      data.forEach(point => {
        const sum = series.reduce((acc, s) => acc + (point.values[s.key] || 0), 0);
        max = Math.max(max, sum);
      });
    } else {
      data.forEach(point => {
        series.forEach(s => {
          max = Math.max(max, point.values[s.key] || 0);
        });
      });
    }
    
    max = max || 1;
    
    const seriesPaths = series.map((s, seriesIndex) => {
      const points = data.map((point, index) => {
        const x = (index / Math.max(data.length - 1, 1)) * chartWidth;
        let y: number;
        
        if (stacked) {
          const stackedValue = series
            .slice(0, seriesIndex + 1)
            .reduce((acc, ss) => acc + (point.values[ss.key] || 0), 0);
          y = chartHeight - (stackedValue / max) * chartHeight;
        } else {
          y = chartHeight - ((point.values[s.key] || 0) / max) * chartHeight;
        }
        
        return { x, y };
      });
      
      const linePath = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
      const areaPath = `${linePath} L ${chartWidth},${chartHeight} L 0,${chartHeight} Z`;
      
      return {
        key: s.key,
        color: s.color,
        label: s.label,
        linePath,
        areaPath
      };
    });
    
    return { maxValue: max, paths: seriesPaths };
  }, [data, series, stacked, chartHeight]);
  
  return (
    <div className={cn('space-y-2', className)}>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" style={{ height: chartHeight }}>
        {/* Areas (render in reverse for proper stacking) */}
        {[...paths].reverse().map((p) => (
          <path
            key={`area-${p.key}`}
            d={p.areaPath}
            fill={p.color}
            fillOpacity="0.2"
          />
        ))}
        
        {/* Lines */}
        {paths.map((p) => (
          <path
            key={`line-${p.key}`}
            d={p.linePath}
            fill="none"
            stroke={p.color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      
      {showLegend && (
        <div className="flex flex-wrap justify-center gap-4">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Gauge Chart
// ============================================

interface GaugeChartProps {
  value: number;
  max?: number;
  label?: string;
  size?: number;
  color?: string;
  thresholds?: { value: number; color: string }[];
  className?: string;
}

export function GaugeChart({
  value,
  max = 100,
  label,
  size = 150,
  color,
  thresholds = [
    { value: 50, color: '#10b981' },
    { value: 75, color: '#f59e0b' },
    { value: 100, color: '#ef4444' }
  ],
  className
}: GaugeChartProps) {
  const percent = Math.min(value / max, 1);
  const angle = percent * 180;
  const radius = size / 2 - 15;
  const center = size / 2;
  
  // Determine color based on thresholds
  const activeColor = color || thresholds.find(t => value <= t.value)?.color || '#3b82f6';
  
  // Calculate arc path
  const startAngle = -180;
  const endAngle = startAngle + angle;
  
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;
  
  const x1 = center + radius * Math.cos(startRad);
  const y1 = center + radius * Math.sin(startRad);
  const x2 = center + radius * Math.cos(endRad);
  const y2 = center + radius * Math.sin(endRad);
  
  const largeArc = angle > 180 ? 1 : 0;
  
  const arcPath = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  const bgPath = `M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`;
  
  return (
    <div className={cn('flex flex-col items-center', className)}>
      <svg viewBox={`0 0 ${size} ${size / 2 + 20}`} style={{ width: size, height: size / 2 + 20 }}>
        {/* Background arc */}
        <path
          d={bgPath}
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
          className="text-muted"
        />
        
        {/* Value arc */}
        <path
          d={arcPath}
          fill="none"
          stroke={activeColor}
          strokeWidth="12"
          strokeLinecap="round"
          className="transition-all duration-500"
        />
        
        {/* Value text */}
        <text
          x={center}
          y={center - 5}
          textAnchor="middle"
          className="fill-foreground text-2xl font-bold"
        >
          {value.toFixed(1)}
        </text>
        
        {/* Label */}
        {label && (
          <text
            x={center}
            y={center + 15}
            textAnchor="middle"
            className="fill-muted-foreground text-xs"
          >
            {label}
          </text>
        )}
      </svg>
    </div>
  );
}

// ============================================
// Sparkline
// ============================================

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  showArea?: boolean;
  className?: string;
}

export function Sparkline({
  data,
  color = '#3b82f6',
  height = 30,
  showArea = false,
  className
}: SparklineProps) {
  if (data.length === 0) return null;
  
  const width = 100;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return { x, y };
  });
  
  const linePath = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;
  
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn('w-full', className)} style={{ height }}>
      {showArea && (
        <path d={areaPath} fill={color} fillOpacity="0.1" />
      )}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default {
  LineChart,
  BarChart,
  PieChart,
  AreaChart,
  GaugeChart,
  Sparkline
};
