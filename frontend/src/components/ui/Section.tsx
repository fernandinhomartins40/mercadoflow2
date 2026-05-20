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
}

/**
 * Bloco de conteúdo padrão: kicker + título + borda separadora + conteúdo.
 * Substitui analytics-panel, sales-section, app-panel e PanelSection.
 */
const Section: React.FC<SectionProps> = ({
  kicker,
  title,
  subtitle,
  action,
  children,
  className,
  as: Tag = 'section',
}) => {
  const hasHead = kicker || title || subtitle || action;
  return (
    <Tag className={cn('flex flex-col gap-4', className)}>
      {hasHead ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--border-soft)' }}>
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
