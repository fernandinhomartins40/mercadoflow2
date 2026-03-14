import React from 'react';
import Card from '../common/Card';

interface MetricsCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon?: string;
  variant?: 'default' | 'warning' | 'danger';
  caption?: string;
  className?: string;
}

const MetricsCard: React.FC<MetricsCardProps> = ({ title, value, icon, variant = 'default', caption, className }) => {
  const tone = variant === 'warning' ? 'warning' : variant === 'danger' ? 'danger' : 'default';

  return (
    <Card className={`metric-card metric-card-${tone} reveal ${className || ''}`.trim()}>
      <div className="metric-card-top">
        <span className="metric-card-title">{title}</span>
        {icon && <span className="metric-card-icon">{icon}</span>}
      </div>
      <strong className="metric-card-value">{value}</strong>
      {caption ? (
        <div className="metric-card-bottom">
          <span className="metric-card-meta">{caption}</span>
        </div>
      ) : null}
    </Card>
  );
};

export default MetricsCard;
