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

const variantBorder: Record<string, string> = {
  default: 'border-l-emerald-500',
  warning: 'border-l-amber-400',
  danger: 'border-l-red-500',
};

const MetricsCard: React.FC<MetricsCardProps> = ({ title, value, icon, variant = 'default', caption, className }) => {
  const hasTrendUp = caption && caption.includes('+');
  const hasTrendDown = caption && caption.includes('-');

  return (
    <div
      className={cn(
        'metric-card reveal relative min-h-[132px] overflow-hidden rounded-xl border border-gray-200 border-l-4 bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.04)] sm:p-5',
        variantBorder[variant] || variantBorder.default,
        className,
      )}
    >
      <div className="metric-card-top flex items-start justify-between gap-3">
        <span className="metric-card-title text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-gray-400">{title}</span>
        {icon ? (
          <span className="metric-card-icon inline-flex min-h-8 min-w-8 items-center justify-center rounded-full bg-emerald-50 px-2 text-[0.72rem] font-bold text-emerald-600 [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </span>
        ) : null}
      </div>
      <strong className="metric-card-value mt-4 block text-[clamp(1.45rem,2.5vw,2.05rem)] font-semibold leading-none tracking-[-0.04em] text-gray-900">
        {value}
      </strong>
      {caption ? (
        <div className="metric-card-bottom mt-2 flex items-center gap-1">
          {hasTrendUp ? (
            <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12 7a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 11-2 0V9.414l-4.293 4.293a1 1 0 01-1.414 0L8 11.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 11.586 14.586 8H13a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
          ) : hasTrendDown ? (
            <svg className="h-4 w-4 text-red-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12 13a1 1 0 011 1v1.586l-4.293-4.293a1 1 0 00-1.414 0L5 13.586l-4.293-4.293a1 1 0 00-1.414 1.414l5 5a1 1 0 001.414 0L8 13.414l3.293 3.293H13a1 1 0 001-1v-4a1 1 0 10-2 0v1.586L7.707 8.293a1 1 0 00-1.414 0L3 11.586.707 9.293a1 1 0 00-1.414 1.414l5 5a1 1 0 001.414 0L8 13.414 12 17.586V14a1 1 0 011-1z" clipRule="evenodd" /></svg>
          ) : null}
          <span className="metric-card-meta text-[0.82rem] leading-5 text-gray-400">{caption}</span>
        </div>
      ) : null}
    </div>
  );
};

export default MetricsCard;
