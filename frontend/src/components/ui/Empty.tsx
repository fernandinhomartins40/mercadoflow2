import React from 'react';
import { cn } from '../../lib/cn';

interface EmptyProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Área vazia com borda tracejada. Substitui panel-empty e sales-empty-card.
 */
const Empty: React.FC<EmptyProps> = ({ children, className }) => (
  <div
    className={cn('flex min-h-[100px] items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center text-sm leading-6', className)}
    style={{ borderColor: 'var(--border-strong)', color: 'var(--text-muted)', background: 'var(--surface-soft)' }}
  >
    {children}
  </div>
);

export default Empty;
