import React from 'react';
import { cn } from '../../lib/cn';

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }> = ({
  variant = 'primary',
  children,
  className,
  ...props
}) => {
  const baseClassName =
    'inline-flex h-12 min-h-12 max-h-12 items-center justify-center rounded-[14px] px-5 text-center text-sm font-semibold leading-none tracking-[-0.01em] whitespace-nowrap transition duration-200 disabled:cursor-not-allowed disabled:opacity-60';
  const variantClassName =
    variant === 'secondary'
      ? 'border border-[rgba(87,51,30,0.12)] bg-white text-[color:var(--text-primary)] shadow-[0_10px_24px_rgba(44,20,6,0.06)] hover:-translate-y-px hover:bg-[rgba(255,247,240,0.92)]'
      : 'border border-transparent bg-[color:var(--accent-primary)] text-white shadow-[0_16px_30px_rgba(255,106,0,0.24)] hover:-translate-y-px hover:bg-[color:var(--accent-strong)]';

  return (
    <button className={cn(baseClassName, variantClassName, className)} {...props}>
      {children}
    </button>
  );
};

export default Button;
