import React from 'react';
import { cn } from '../../lib/cn';

/**
 * Estado vazio reutilizável para listas, tabelas e seções sem dados.
 * Aceita ícone, mensagem e ação opcional.
 *
 * Mensagens devem estar em pt-BR.
 */

interface EmptyStateProps {
  /** Mensagem principal */
  message: string;
  /** Ícone opcional (React node ou Lucide icon) */
  icon?: React.ReactNode;
  /** Ação opcional (ex: botão para tentar novamente) */
  action?: React.ReactNode;
  /** Classe extra */
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  message,
  icon,
  action,
  className,
}) => (
  <div className={cn('flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500', className)}>
    <div className="flex flex-col items-center gap-3">
      {icon ? <div className="text-gray-400 opacity-60">{icon}</div> : null}
      <span>{message}</span>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  </div>
);

export default EmptyState;
