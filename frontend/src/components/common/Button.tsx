import React from 'react';
import { cn } from '../../lib/cn';

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }> = ({
  variant = 'primary',
  children,
  className,
  ...props
}) => {
  const baseClassName =
    'inline-flex h-12 min-h-12 max-h-12 items-center justify-center gap-2 rounded-[14px] px-5 text-center text-sm font-semibold leading-none tracking-[-0.01em] whitespace-nowrap transition duration-200 disabled:cursor-not-allowed disabled:opacity-60';
  const variantClassName =
    variant === 'secondary'
      ? 'border border-gray-200 bg-white text-gray-900 shadow-[0_10px_24px_rgba(0,0,0,0.06)] hover:-translate-y-px hover:bg-gray-50'
      : variant === 'ghost'
      ? 'border border-transparent bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      : 'border border-transparent bg-emerald-600 text-white shadow-[0_16px_30px_rgba(5,150,105,0.24)] hover:-translate-y-px hover:bg-emerald-700';

  return (
    <button className={cn(baseClassName, variantClassName, className)} {...props}>
      {children}
    </button>
  );
};

export default Button;
