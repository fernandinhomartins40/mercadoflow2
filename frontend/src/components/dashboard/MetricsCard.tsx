import React from 'react';
import Card from '../common/Card';

interface MetricsCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon?: string;
  variant?: 'default' | 'warning' | 'danger';
}

const MetricsCard: React.FC<MetricsCardProps> = ({ title, value, change, icon, variant = 'default' }) => {
  const badgeClass =
    variant === 'warning' ? 'badge warning' : variant === 'danger' ? 'badge danger' : 'badge success';

  return (
    <Card>
      <div className="metric">
        <h3>{title}</h3>
        <span>{value}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {icon && <span>{icon}</span>}
          {change !== undefined && <span className={badgeClass}>{change.toFixed(1)}%</span>}
        </div>
      </div>
    </Card>
  );
};

export default MetricsCard;
