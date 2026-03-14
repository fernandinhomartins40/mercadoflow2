import React from 'react';

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
  const classes = ['analytics-panel', reveal ? 'reveal' : '', className || ''].filter(Boolean).join(' ');
  const hasHead = kicker || title || action;

  return (
    <Tag className={classes}>
      {hasHead ? (
        <div className={`analytics-panel-head${compactHead ? ' compact' : ''}`}>
          <div>
            {kicker ? <span className="section-kicker">{kicker}</span> : null}
            {title ? (typeof title === 'string' ? <h3>{title}</h3> : title) : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </Tag>
  );
};

export default PanelSection;
