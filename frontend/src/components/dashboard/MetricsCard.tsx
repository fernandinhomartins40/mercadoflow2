import React from 'react';
import { cn } from '../../lib/cn';

interface MetricsCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon?: React.ReactNode;
  variant?: 'default' | 'warning' | 'danger';
  caption?: string;
  className?: string;
}

const variantStyles: Record<string, { bg: string; badge: string; value: string; label: string }> = {
  default: {
    bg: 'bg-white border-slate-200',
    badge: 'bg-green-100 text-green-700',
    value: 'text-slate-900',
    label: 'text-slate-500',
  },
  warning: {
    bg: 'bg-amber-50 border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
    value: 'text-amber-900',
    label: 'text-amber-600',
  },
  danger: {
    bg: 'bg-red-50 border-red-200',
    badge: 'bg-red-100 text-red-700',
    value: 'text-red-900',
    label: 'text-red-600',
  },
};

const MetricsCard: React.FC<MetricsCardProps> = ({ title, value, icon, variant = 'default', caption, className }) => {
  const styles = variantStyles[variant] ?? variantStyles.default;
  const hasTrendUp = caption && caption.includes('+');
  const hasTrendDown = caption && caption.includes('-');

  return (
    <div
      className={cn(
        'metric-card reveal flex flex-col gap-3 rounded-xl border p-4',
        styles.bg,
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-[0.7rem] font-semibold uppercase tracking-widest', styles.label)}>{title}</span>
        {icon ? (
          <span className={cn('inline-flex h-7 w-7 items-center justify-center rounded-lg text-[0.68rem] font-bold [&_svg]:h-3.5 [&_svg]:w-3.5', styles.badge)}>
            {icon}
          </span>
        ) : null}
      </div>
      <strong className={cn('block text-3xl font-bold leading-none tracking-tight', styles.value)}>
        {value}
      </strong>
      {caption ? (
        <div className="flex items-center gap-1">
          {hasTrendUp ? (
            <svg className="h-3.5 w-3.5 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12 7a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 11-2 0V9.414l-4.293 4.293a1 1 0 01-1.414 0L8 11.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 11.586 14.586 8H13a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
          ) : hasTrendDown ? (
            <svg className="h-3.5 w-3.5 text-red-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12 13a1 1 0 011 1v1.586l-4.293-4.293a1 1 0 00-1.414 0L5 13.586l-4.293-4.293a1 1 0 00-1.414 1.414l5 5a1 1 0 001.414 0L8 13.414l3.293 3.293H13a1 1 0 001-1v-4a1 1 0 10-2 0v1.586L7.707 8.293a1 1 0 00-1.414 0L3 11.586.707 9.293a1 1 0 00-1.414 1.414l5 5a1 1 0 001.414 0L8 13.414 12 17.586V14a1 1 0 011-1z" clipRule="evenodd" /></svg>
          ) : null}
          <span className={cn('text-xs leading-5', styles.label)}>{caption}</span>
        </div>
      ) : null}
    </div>
  );
};

export default MetricsCard;
