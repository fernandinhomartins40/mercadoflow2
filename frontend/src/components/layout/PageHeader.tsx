import React from 'react';
import { cn } from '../../lib/cn';

/**
 * Cabeçalho de página compacto e moderno.
 * Substitui o PageHero inflado por um header limpo estilo Linear/Vercel.
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
  <header className={cn('page-header-compact', className)}>
    <div className="page-header-copy">
      <h1 className="page-header-title">{title}</h1>
      {subtitle ? <p className="page-header-subtitle">{subtitle}</p> : null}
    </div>
    {actions ? <div className="page-header-actions">{actions}</div> : null}
  </header>
);

export default PageHeader;
