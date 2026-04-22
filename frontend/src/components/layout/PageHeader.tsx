import React from 'react';
import { cn } from '../../lib/cn';

/**
 * Cabeçalho de página compacto e moderno.
 * Estilo Linear/Vercel com tons neutros.
 *
 * Uso: toda página de painel admin e super admin.
 */

interface PageHeaderProps {
  /** Título principal da página */
  title: string;
  /** Subtítulo curto (máx. 1 linha) */
  subtitle?: string;
  /** Ações inline (botões) à direita */
  actions?: React.ReactNode;
  /** Classe extra */
  className?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
  className,
}) => (
  <header className={cn('flex flex-wrap items-center justify-between gap-4 pb-6', className)}>
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-gray-900">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
    </div>
    {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
  </header>
);

export default PageHeader;
