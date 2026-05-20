import React from 'react';
import { cn } from '../../lib/cn';

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 bg-white',
        className,
      )}
    >
      {children}
    </div>
  );
};

export default Card;
