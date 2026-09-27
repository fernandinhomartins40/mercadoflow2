import React from 'react';
import { cn } from '../../lib/cn';

/**
 * Estado vazio reutilizável para listas, tabelas e seções sem dados.
 * Aceita ícone, mensagem e ação opcional.
 *
 * Fonte de verdade visual dos estados vazios — ui/Empty delega para cá.
 *
 * Mensagens devem estar em pt-BR.
 */

interface EmptyStateProps {
  /** Mensagem principal */
  message: React.ReactNode;
  /** Ícone opcional (React node ou Lucide icon) */
  icon?: React.ReactNode;
  /** Ação opcional (ex: botão para tentar novamente) */
  action?: React.ReactNode;
  /** Altura mínima menor, para blocos dentro de painéis */
  compact?: boolean;
  /** Classe extra */
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  message,
  icon,
  action,
  compact = false,
  className,
}) => (
  <div
    className={cn(
      'flex items-center justify-center rounded-xl border border-dashed text-center text-sm leading-6',
      compact ? 'min-h-[100px] px-4 py-6 sm:px-6 sm:py-8' : 'min-h-[160px] p-6 sm:min-h-[200px] sm:p-8',
      className,
    )}
    style={{ borderColor: 'var(--border-strong)', background: 'var(--surface-soft)', color: 'var(--text-muted)' }}
  >
    <div className="flex flex-col items-center gap-3">
      {icon ? <div className="opacity-60" style={{ color: 'var(--text-soft)' }}>{icon}</div> : null}
      <span>{message}</span>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  </div>
);

export default EmptyState;
