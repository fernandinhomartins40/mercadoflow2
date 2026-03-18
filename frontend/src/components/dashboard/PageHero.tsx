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
    <div className={cn('page-hero-copy', copyClassName)}>
      <div className="page-hero-kicker">{badge}</div>
      {typeof title === 'string' ? <h1 className="page-hero-title">{title}</h1> : title}
      {typeof description === 'string' ? <p className="page-hero-text">{description}</p> : description}
      {actions ? <div className="page-hero-actions">{actions}</div> : null}
    </div>
  );

  const featureBlock = feature ? <div className={cn('page-hero-feature', featureClassName)}>{feature}</div> : null;

  return (
    <section className={cn('page-hero-grid reveal', !hasAside && 'page-hero-grid-single', className)}>
      <article className={cn('page-hero-card', articleClassName)}>
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

      {hasAside ? <aside className={cn('page-hero-aside', asideClassName)}>{aside}</aside> : null}
    </section>
  );
};

export default PageHero;
