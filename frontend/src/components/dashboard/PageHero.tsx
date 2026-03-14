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
  const copyBlock = (
    <div className={cn('dashboard-command-copy', copyClassName)}>
      <span className="pill">{badge}</span>
      {typeof title === 'string' ? <h1 className="dashboard-command-title">{title}</h1> : title}
      {typeof description === 'string' ? <p className="dashboard-command-text">{description}</p> : description}
      {actions ? <div className="hero-inline-actions">{actions}</div> : null}
    </div>
  );

  const featureBlock = feature ? <div className={cn('dashboard-command-showcase', featureClassName)}>{feature}</div> : null;

  return (
    <section className={cn('dashboard-command-grid reveal', className)}>
      <article className={cn('dashboard-command-card', articleClassName)}>
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

      {aside ? <aside className={cn('dashboard-priority-rail', asideClassName)}>{aside}</aside> : null}
    </section>
  );
};

export default PageHero;
