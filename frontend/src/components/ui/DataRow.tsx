import React from 'react';
import { cn } from '../../lib/cn';

interface DataRowProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

/** Linha rótulo e valor. */
const DataRow: React.FC<DataRowProps> = ({ label, value, className }) => (
  <div className={cn('fx-datarow', className)}>
    <span className="min-w-0 text-sm" style={{ color: 'var(--fx-muted)' }}>{label}</span>
    <strong className="shrink-0 text-sm font-bold" style={{ color: 'var(--fx-ink)' }}>{value}</strong>
  </div>
);

export default DataRow;
