import React from 'react';
import { cn } from '../../lib/cn';

interface RailCardProps {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  badge?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/** Card para trilhos horizontais. */
const RailCard: React.FC<RailCardProps> = ({ kicker, title, badge, children, footer, className }) => (
  <article className={cn('fx-rail', className)}>
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        {kicker ? <p className="text-xs font-semibold" style={{ color: 'var(--fx-muted)' }}>{kicker}</p> : null}
        <h4 className="truncate text-[15px] font-bold leading-5" style={{ color: 'var(--fx-ink)' }}>{title}</h4>
      </div>
      {badge ? <div className="shrink-0">{badge}</div> : null}
    </div>
    {children ? <div className="flex flex-col gap-2">{children}</div> : null}
    {footer ? (
      <div className="border-t pt-2 text-xs" style={{ borderColor: 'var(--fx-line)', color: 'var(--fx-muted)' }}>{footer}</div>
    ) : null}
  </article>
);

export default RailCard;
