import React from 'react';
import { cn } from '../../lib/cn';

interface StatProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
}

/** Indicador: rótulo, número grande e texto de apoio. */
const Stat: React.FC<StatProps> = ({ label, value, sub, variant = 'default', className }) => (
  <article className={cn('fx-stat-card', variant !== 'default' && variant, className)}>
    <span>{label}</span>
    <strong>{value}</strong>
    {sub ? <p>{sub}</p> : null}
  </article>
);

export default Stat;
