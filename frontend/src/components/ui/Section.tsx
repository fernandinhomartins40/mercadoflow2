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
    <Tag className={cn('flex min-w-0 flex-col gap-4', reveal && 'reveal', className)}>
      {hasHead ? (
        <div
          className={cn(
            'flex flex-wrap items-start justify-between gap-3',
            !compactHead && 'border-b pb-3',
          )}
          style={compactHead ? undefined : { borderColor: 'var(--border-soft)' }}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            {kicker ? (
              <p className="text-[0.65rem] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-soft)' }}>
                {kicker}
              </p>
            ) : null}
            {title ? (
              typeof title === 'string'
                ? <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
                : title
            ) : null}
            {subtitle ? (
              <p className="text-sm leading-6" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
            ) : null}
          </div>
          {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </Tag>
  );
};

export default Section;
