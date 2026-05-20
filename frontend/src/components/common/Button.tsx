import React from 'react';
import { cn } from '../../lib/cn';

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }> = ({
  variant = 'primary',
  children,
  className,
  ...props
}) => {
  const baseClassName =
    'inline-flex h-9 min-h-9 items-center justify-center gap-1.5 rounded-lg px-4 text-center text-sm font-semibold leading-none whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50';
  const variantClassName =
    variant === 'secondary'
      ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'
      : variant === 'ghost'
      ? 'border border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      : 'border border-transparent bg-green-500 text-white hover:bg-green-600';

  return (
    <button className={cn(baseClassName, variantClassName, className)} {...props}>
      {children}
    </button>
  );
};

export default Button;
