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
  const classes = cn(
    'analytics-panel rounded-[28px] border border-[rgba(87,51,30,0.12)] bg-[rgba(255,252,248,0.92)] p-5 shadow-[0_20px_50px_rgba(44,20,6,0.08)] sm:p-6',
    reveal ? 'reveal' : '',
    className,
  );
  const hasHead = kicker || title || action;

  return (
    <Tag className={classes}>
      {hasHead ? (
        <div
          className={cn(
            'analytics-panel-head mb-4 flex items-start justify-between gap-4',
            compactHead ? 'compact' : '',
          )}
        >
          <div>
            {kicker ? <span className="section-kicker text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">{kicker}</span> : null}
            {title ? (typeof title === 'string' ? <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[color:var(--text-primary)]">{title}</h3> : title) : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </Tag>
  );
};

export default PanelSection;
