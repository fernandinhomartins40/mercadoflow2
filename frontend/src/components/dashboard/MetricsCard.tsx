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

/** Indicador grande do Flow: rótulo, número e legenda. */
const MetricsCard: React.FC<MetricsCardProps> = ({ title, value, icon, variant = 'default', caption, className }) => {
  const up = caption?.includes('+');
  const down = caption?.includes('-');
  return (
    <div className={cn('fx-stat-card metric-card reveal', variant !== 'default' && variant, className)}>
      <div className="flex items-center justify-between gap-2">
        <span style={{ fontSize: 13.5, color: 'var(--fx-muted)', fontWeight: 600 }}>{title}</span>
        {icon ? <span className="ico" aria-hidden="true">{icon}</span> : null}
      </div>
      <strong>{value}</strong>
      {caption ? (
        <p style={{ color: up ? 'var(--fx-green)' : down ? 'var(--fx-red)' : undefined, fontWeight: up || down ? 650 : undefined }}>{caption}</p>
      ) : null}
    </div>
  );
};

export default MetricsCard;
