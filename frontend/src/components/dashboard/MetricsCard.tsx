import React from 'react';
import Card from '../common/Card';

interface MetricsCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon?: string;
  variant?: 'default' | 'warning' | 'danger';
  caption?: string;
}

const MetricsCard: React.FC<MetricsCardProps> = ({ title, value, change, icon, variant = 'default', caption }) => {
  const tone = variant === 'warning' ? 'warning' : variant === 'danger' ? 'danger' : 'default';
  const deltaClass = change === undefined ? '' : change >= 0 ? 'positive' : 'negative';
  const deltaLabel = change === undefined ? null : `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
  const supportLabel = deltaLabel || caption || 'Dados reais';

  return (
    <Card className={`metric-card metric-card-${tone} reveal`}>
      <div className="metric-card-top">
        <span className="metric-card-title">{title}</span>
        {icon && <span className="metric-card-icon">{icon}</span>}
      </div>
      <strong className="metric-card-value">{value}</strong>
      <div className="metric-card-bottom">
        <span className={deltaLabel ? `metric-card-delta ${deltaClass}` : 'metric-card-meta'}>{supportLabel}</span>
      </div>
    </Card>
  );
};

export default MetricsCard;
