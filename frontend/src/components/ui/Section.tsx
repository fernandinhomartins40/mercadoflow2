import React from 'react';
import { cn } from '../../lib/cn';

interface SectionProps {
  kicker?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
  /** Cabeçalho sem borda inferior nem respiro extra */
  compactHead?: boolean;
  /** Aplica a animação de entrada `reveal` */
  reveal?: boolean;
}

/**
 * Bloco de conteúdo padrão: kicker + título + borda separadora + conteúdo.
 *
 * Fonte de verdade das seções — substitui analytics-panel, sales-section,
 * app-panel e PanelSection (que delega para cá).
 */
const Section: React.FC<SectionProps> = ({
  kicker,
  title,
  subtitle,
  action,
  children,
  className,
  as: Tag = 'section',
  compactHead = false,
  reveal = false,
}) => {
  const hasHead = kicker || title || subtitle || action;
  return (
    <Tag className={cn('flex min-w-0 flex-col gap-4', reveal && 'reveal', className)} data-compact={compactHead || undefined}>
      {hasHead ? (
        <div className="fx-section-head">
          <div className="flex min-w-0 flex-col">
            {kicker ? <p className="mb-1 text-[13px] font-semibold" style={{ color: 'var(--fx-green)' }}>{kicker}</p> : null}
            {title ? (typeof title === 'string' ? <h3>{title}</h3> : title) : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </Tag>
  );
};

export default Section;
