import React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { AlertSeverity, RiskLevel } from '@/types/types';

interface SeverityBadgeProps {
  severity: AlertSeverity;
  className?: string;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity, className }) => {
  const variants: Record<AlertSeverity, string> = {
    low:      'bg-green-50 text-green-700 border border-green-200 dark:bg-green-500/10 dark:text-green-400',
    medium:   'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-yellow-500/10 dark:text-yellow-400',
    high:     'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-500/10 dark:text-orange-400',
    critical: 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400',
  };
  return (
    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide', variants[severity], className)}>
      {severity}
    </span>
  );
};

interface RiskBadgeProps {
  level: RiskLevel;
  score?: number;
  className?: string;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ level, score, className }) => {
  const variants: Record<RiskLevel, string> = {
    low:    'bg-green-50 text-green-700 border border-green-200 dark:bg-green-500/10 dark:text-green-400',
    medium: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-yellow-500/10 dark:text-yellow-400',
    high:   'bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide', variants[level], className)}>
      {score !== undefined && <span className="font-mono font-bold">{score}</span>}
      <span>{level}</span>
    </span>
  );
};

interface StatusDotProps {
  active: boolean;
  label: string;
  className?: string;
}

export const StatusDot: React.FC<StatusDotProps> = ({ active, label, className }) => (
  <div className={cn('flex items-center gap-1.5 text-xs', className)}>
    <span className={cn(
      'w-1.5 h-1.5 rounded-full shrink-0',
      active ? 'bg-green-500 ai-active' : 'bg-red-400'
    )} />
    <span className={cn('font-medium text-xs', active ? 'text-foreground' : 'text-red-500 dark:text-red-400')}>
      {label}
    </span>
  </div>
);

interface IntegrityScoreProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export const IntegrityScore: React.FC<IntegrityScoreProps> = ({ score, size = 'md' }) => {
  const color   = score >= 80 ? 'text-green-600 dark:text-green-400' : score >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
  const ringBg  = score >= 80 ? 'ring-green-400/25 bg-green-50 dark:bg-green-500/10' : score >= 60 ? 'ring-amber-400/25 bg-amber-50 dark:bg-amber-500/10' : 'ring-red-400/25 bg-red-50 dark:bg-red-500/10';
  const sizes: Record<string, string> = {
    sm: 'text-base font-bold w-10 h-10',
    md: 'text-xl font-bold w-14 h-14',
    lg: 'text-3xl font-bold w-18 h-18',
  };
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-full ring-2', sizes[size], color, ringBg)}>
      <span className="font-mono tabular-nums leading-none">{score}</span>
      {size !== 'sm' && <span className="text-[9px] text-muted-foreground mt-0.5">score</span>}
    </div>
  );
};

/* ── StatCard: compact, reference-style ──────────────────────────────────── */
interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: number; label: string };
  variant?: 'default' | 'danger' | 'success' | 'warning';
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title, value, subtitle, icon, trend, variant = 'default', className
}) => {
  const iconBg: Record<string, string> = {
    default: 'bg-primary/10 text-primary',
    danger:  'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400',
    success: 'bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400',
    warning: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  };
  const valueColor: Record<string, string> = {
    default: 'text-foreground',
    danger:  'text-red-600 dark:text-red-400',
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-amber-600 dark:text-amber-400',
  };
  const borderTop: Record<string, string> = {
    default: 'border-t-2 border-t-primary',
    danger:  'border-t-2 border-t-red-400',
    success: 'border-t-2 border-t-green-500',
    warning: 'border-t-2 border-t-amber-400',
  };

  return (
    <div className={cn(
      'bg-card rounded-lg p-4 flex flex-col gap-2 h-full card-shadow card-shadow-hover border border-border',
      borderTop[variant],
      className
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Icon + label row like reference */}
          <div className="flex items-center gap-1.5 mb-2">
            <div className={cn('w-6 h-6 rounded flex items-center justify-center shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5', iconBg[variant])}>
              {icon}
            </div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">{title}</p>
          </div>
          <p className={cn('text-2xl font-bold font-mono tabular-nums leading-none text-balance', valueColor[variant])}>
            {value}
          </p>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-1 text-pretty">{subtitle}</p>}
        </div>
      </div>
      {trend && (
        <div className={cn(
          'flex items-center gap-1 text-[11px] font-semibold pt-1.5 border-t border-border',
          trend.value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
        )}>
          {trend.value >= 0
            ? <TrendingUp  className="w-3 h-3 shrink-0" />
            : <TrendingDown className="w-3 h-3 shrink-0" />}
          {Math.abs(trend.value)}% {trend.label}
        </div>
      )}
    </div>
  );
};
