import React from 'react';
import { cn } from '../../lib/cn';

interface PageHeroProps {
  badge: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  actions?: React.ReactNode;
  feature?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
  articleClassName?: string;
  copyClassName?: string;
  featureClassName?: string;
  asideClassName?: string;
  visualFirst?: boolean;
}

const PageHero: React.FC<PageHeroProps> = ({
  badge,
  title,
  description,
  actions,
  feature,
  aside,
  className,
  articleClassName,
  copyClassName,
  featureClassName,
  asideClassName,
  visualFirst = false,
}) => {
  const hasAside = Boolean(aside);

  const copyBlock = (
    <div className={cn('flex min-w-0 flex-col gap-3', copyClassName)}>
      {badge ? <p className="text-[13px] font-semibold" style={{ color: 'var(--fx-green)' }}>{badge}</p> : null}
      {typeof title === 'string' ? <h1 className="fx-title" style={{ fontSize: 'clamp(30px, 4vw, 52px)' }}>{title}</h1> : title}
      {typeof description === 'string' ? <p className="fx-sub">{description}</p> : description}
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );

  const featureBlock = feature ? (
    <div className={cn('flex min-w-0 flex-col gap-3', featureClassName)}>{feature}</div>
  ) : null;

  return (
    <section className={cn('flex flex-col gap-5', className)}>
      <article className={cn('grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.68fr)] xl:items-start', articleClassName)}>
        {visualFirst ? (
          <>
            {featureBlock}
            {copyBlock}
          </>
        ) : (
          <>
            {copyBlock}
            {featureBlock}
          </>
        )}
      </article>

      {hasAside ? <aside className={cn('flex flex-col gap-3', asideClassName)}>{aside}</aside> : null}
    </section>
  );
};

export default PageHero;
