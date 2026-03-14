import React from 'react';
import Card from '../common/Card';
import { cn } from '../../lib/cn';

interface MetricsCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon?: string;
  variant?: 'default' | 'warning' | 'danger';
  caption?: string;
  className?: string;
}

const MetricsCard: React.FC<MetricsCardProps> = ({ title, value, icon, variant = 'default', caption, className }) => {
  const tone = variant === 'warning' ? 'warning' : variant === 'danger' ? 'danger' : 'default';
  const toneClassName =
    tone === 'warning'
      ? 'bg-[linear-gradient(180deg,rgba(255,250,246,0.98)_0%,rgba(255,243,232,0.95)_100%)]'
      : tone === 'danger'
        ? 'bg-[linear-gradient(180deg,rgba(255,247,243,0.98)_0%,rgba(255,236,231,0.95)_100%)]'
        : 'bg-[linear-gradient(180deg,rgba(255,252,248,0.98)_0%,rgba(255,249,244,0.95)_100%)]';

  return (
    <Card className={cn('metric-card reveal flex flex-col gap-3 p-5 sm:p-6', `metric-card-${tone}`, toneClassName, className)}>
      <div className="metric-card-top flex items-start justify-between gap-3">
        <span className="metric-card-title text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">{title}</span>
        {icon ? (
          <span className="metric-card-icon inline-flex min-h-9 min-w-9 items-center justify-center rounded-full bg-[rgba(255,106,0,0.1)] px-2 text-[0.75rem] font-bold text-[color:var(--accent-strong)]">
            {icon}
          </span>
        ) : null}
      </div>
      <strong className="metric-card-value text-[clamp(1.6rem,3vw,2.3rem)] font-semibold leading-none tracking-[-0.04em] text-[color:var(--text-primary)]">
        {value}
      </strong>
      {caption ? (
        <div className="metric-card-bottom">
          <span className="metric-card-meta text-sm leading-5 text-[color:var(--text-muted)]">{caption}</span>
        </div>
      ) : null}
    </Card>
  );
};

export default MetricsCard;
