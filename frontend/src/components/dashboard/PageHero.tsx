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
      <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-slate-400">{badge}</p>
      {typeof title === 'string' ? <h1 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h1> : title}
      {typeof description === 'string' ? <p className="text-sm leading-6 text-slate-500">{description}</p> : description}
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
