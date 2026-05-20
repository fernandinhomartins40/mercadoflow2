import React from 'react';
import { cn } from '../../lib/cn';

interface ChipProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

const variantMap = {
  default: { bg: 'var(--surface-muted)',   color: 'var(--text-muted)',   border: 'var(--border-soft)' },
  success: { bg: 'var(--surface-success)', color: 'var(--brand-700)',    border: 'var(--border-success)' },
  warning: { bg: 'var(--surface-warning)', color: '#92400e',             border: 'var(--border-warning)' },
  danger:  { bg: 'var(--surface-danger)',  color: '#991b1b',             border: 'var(--border-danger)' },
  info:    { bg: 'var(--surface-info)',    color: '#1d4ed8',             border: 'var(--border-info)' },
};

/**
 * Pílula de metadado inline. Substitui hero-chip e similares.
 */
const Chip: React.FC<ChipProps> = ({ children, variant = 'default', className }) => {
  const v = variantMap[variant];
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', className)}
      style={{ background: v.bg, color: v.color, border: `1px solid ${v.border}` }}
    >
      {children}
    </span>
  );
};

export default Chip;
