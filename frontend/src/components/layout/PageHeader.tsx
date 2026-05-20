import React from 'react';
import { cn } from '../../lib/cn';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
  className,
}) => (
  <header className={cn('flex flex-wrap items-center justify-between gap-3 pb-4', className)}>
    <div>
      <h1 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h1>
      {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
    </div>
    {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
  </header>
);

export default PageHeader;
