import React from 'react';
import { cn } from '../../lib/cn';

interface StatProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
}

const variantMap = {
  default: { bg: 'var(--surface-soft)', border: 'var(--border-soft)', value: 'var(--text-primary)' },
  success: { bg: 'var(--surface-success)', border: 'var(--border-success)', value: 'var(--brand-700)' },
  warning: { bg: 'var(--surface-warning)', border: 'var(--border-warning)', value: '#92400e' },
  danger:  { bg: 'var(--surface-danger)',  border: 'var(--border-danger)',  value: '#991b1b' },
};

/**
 * Card compacto de stat: label + valor grande + sub-texto opcional.
 * Substitui sales-insight-card e product-detail-summary-card.
 */
const Stat: React.FC<StatProps> = ({ label, value, sub, variant = 'default', className }) => {
  const v = variantMap[variant];
  return (
    <article
      className={cn('flex flex-col gap-2 rounded-xl p-5', className)}
      style={{ background: v.bg, border: `1px solid ${v.border}` }}
    >
      <span className="text-[0.68rem] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-soft)' }}>
        {label}
      </span>
      <strong className="text-xl font-bold leading-none tracking-tight" style={{ color: v.value }}>
        {value}
      </strong>
      {sub ? <p className="text-xs leading-5" style={{ color: 'var(--text-muted)' }}>{sub}</p> : null}
    </article>
  );
};

export default Stat;
