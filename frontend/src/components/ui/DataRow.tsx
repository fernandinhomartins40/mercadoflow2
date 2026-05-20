import React from 'react';
import { cn } from '../../lib/cn';

interface DataRowProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

/**
 * Linha label → valor com fundo suave. Substitui dashboard-stat-row e settings-line-card.
 */
const DataRow: React.FC<DataRowProps> = ({ label, value, className }) => (
  <div
    className={cn('flex min-w-0 items-center justify-between gap-4 rounded-lg px-4 py-3', className)}
    style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-soft)' }}
  >
    <span className="min-w-0 text-sm" style={{ color: 'var(--text-muted)' }}>{label}</span>
    <strong className="shrink-0 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</strong>
  </div>
);

export default DataRow;
