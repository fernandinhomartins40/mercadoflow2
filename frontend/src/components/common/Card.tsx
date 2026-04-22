import React from 'react';
import { cn } from '../../lib/cn';

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  return (
    <div
      className={cn(
        'card rounded-xl border border-gray-200 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.06)]',
        className,
      )}
    >
      {children}
    </div>
  );
};

export default Card;
