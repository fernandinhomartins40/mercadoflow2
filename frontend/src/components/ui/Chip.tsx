import React from 'react';
import { cn } from '../../lib/cn';

interface ChipProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

const TONE = { default: 'gray', success: 'green', warning: 'amber', danger: 'red', info: 'lime' } as const;

/** Pílula de metadado inline, no tom do Flow. */
const Chip: React.FC<ChipProps> = ({ children, variant = 'default', className }) => (
  <span className={cn('fx-chip', TONE[variant], className)}>{children}</span>
);

export default Chip;
