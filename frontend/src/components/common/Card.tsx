import React from 'react';
import { cn } from '../../lib/cn';

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  return (
    <div
      className={cn(
        'card rounded-[28px] border border-[rgba(87,51,30,0.12)] bg-[rgba(255,252,248,0.92)] shadow-[0_20px_50px_rgba(44,20,6,0.08)]',
        className,
      )}
    >
      {children}
    </div>
  );
};

export default Card;
