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
    'app-panel',
    reveal ? 'reveal' : '',
    className,
  );
  const hasHead = kicker || title || action;

  return (
    <Tag className={classes}>
      {hasHead ? (
        <div
          className={cn(
            'app-panel-head',
            compactHead ? 'compact' : '',
          )}
        >
          <div className="app-panel-copy">
            {kicker ? <span className="section-kicker">{kicker}</span> : null}
            {title ? (typeof title === 'string' ? <h3 className="app-panel-title">{title}</h3> : title) : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </Tag>
  );
};

export default PanelSection;
