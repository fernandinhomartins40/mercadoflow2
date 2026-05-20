import React from 'react';
import { cn } from '../../lib/cn';

interface StatGridProps {
  children: React.ReactNode;
  cols?: 2 | 3 | 4;
  className?: string;
}

/**
 * Grid responsivo para MetricsCard / Stat. Substitui metrics-grid, dashboard-kpi-ribbon, etc.
 */
const StatGrid: React.FC<StatGridProps> = ({ children, cols = 4, className }) => {
  const colClass = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 xl:grid-cols-4',
  }[cols];

  return (
    <div className={cn('grid gap-3', colClass, className)}>
      {children}
    </div>
  );
};

export default StatGrid;
