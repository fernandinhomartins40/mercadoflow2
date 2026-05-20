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

/**
 * Card para trilhos horizontais (scroll rail). Substitui product-detail-rail-card,
 * sales-product-card em modo rail, etc.
 */
const RailCard: React.FC<RailCardProps> = ({ kicker, title, badge, children, footer, className }) => (
  <article
    className={cn('flex min-w-[220px] max-w-[260px] flex-col gap-3 rounded-xl p-4', className)}
    style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        {kicker ? (
          <p className="text-[0.63rem] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-soft)' }}>
            {kicker}
          </p>
        ) : null}
        <h4 className="truncate text-sm font-semibold leading-5" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h4>
      </div>
      {badge ? <div className="shrink-0">{badge}</div> : null}
    </div>
    {children ? <div className="flex flex-col gap-2">{children}</div> : null}
    {footer ? (
      <div className="border-t pt-2 text-xs" style={{ borderColor: 'var(--border-soft)', color: 'var(--text-muted)' }}>
        {footer}
      </div>
    ) : null}
  </article>
);

export default RailCard;
