import React from 'react';
import { cn } from '../../lib/cn';

interface PanelSectionProps {
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  compactHead?: boolean;
  kicker?: React.ReactNode;
  title?: React.ReactNode;
  as?: 'section' | 'article' | 'div';
  reveal?: boolean;
}

const PanelSection: React.FC<PanelSectionProps> = ({
  children,
  className,
  action,
  compactHead = false,
  kicker,
  title,
  as = 'section',
  reveal = true,
}) => {
  const Tag = as;
  const hasHead = kicker || title || action;

  return (
    <Tag className={cn('flex flex-col gap-3', reveal ? 'reveal' : '', className)}>
      {hasHead ? (
        <div className={cn('flex flex-wrap items-center justify-between gap-3', compactHead ? '' : 'pb-2 border-b border-slate-100')}>
          <div className="flex min-w-0 flex-col gap-0.5">
            {kicker ? <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-slate-400">{kicker}</span> : null}
            {title ? (typeof title === 'string' ? <h3 className="text-sm font-semibold text-slate-900">{title}</h3> : title) : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </Tag>
  );
};

export default PanelSection;
