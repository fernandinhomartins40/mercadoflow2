import React from 'react';
import { cn } from '../../lib/cn';

/**
 * Pill de status com tom visual automático baseado no status.
 * Aceita um tom explícito ou calcula automaticamente pelo valor do status.
 *
 * Tons: success, warning, danger, neutral (padrão).
 */

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

interface StatusPillProps {
  /** Texto a exibir dentro da pill */
  children: React.ReactNode;
  /** Tom visual explícito */
  tone?: StatusTone;
  /** Status bruto — usado para calcular o tom automaticamente */
  status?: string | null;
  /** Classe extra */
  className?: string;
}

/** Mapeia status bruto para tom visual. */
export const statusToTone = (status?: string | null): StatusTone => {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE':
    case 'SUCCESS':
    case 'RUNNING':
    case 'COMPLETED':
      return 'success';
    case 'TRIAL':
    case 'EXPIRING_SOON':
    case 'PAST_DUE':
    case 'QUEUED':
      return 'warning';
    case 'BLOCKED':
    case 'SUSPENDED':
    case 'CANCELLED':
    case 'EXPIRED':
    case 'FAILED':
      return 'danger';
    default:
      return 'neutral';
  }
};

const toneClasses: Record<StatusTone, string> = {
  success: 'bg-green-50 text-green-700 border-green-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  neutral: 'bg-slate-50 text-slate-600 border-slate-200',
};

const StatusPill: React.FC<StatusPillProps> = ({
  children,
  tone,
  status,
  className,
}) => {
  const resolvedTone = tone || statusToTone(status);

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        toneClasses[resolvedTone],
        className,
      )}
    >
      {children}
    </span>
  );
};

export default StatusPill;
