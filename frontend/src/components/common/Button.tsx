import React from 'react';
import { cn } from '../../lib/cn';

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }> = ({
  variant = 'primary',
  children,
  className,
  ...props
}) => {
  const baseClassName =
    'button inline-flex min-h-11 items-center justify-center rounded-[14px] px-5 py-2.5 text-sm font-semibold tracking-[-0.01em] transition duration-200 disabled:cursor-not-allowed disabled:opacity-60';
  const variantClassName =
    variant === 'secondary'
      ? 'secondary border border-[rgba(87,51,30,0.12)] bg-white text-[color:var(--text-primary)] shadow-[0_10px_24px_rgba(44,20,6,0.06)] hover:-translate-y-px hover:bg-[rgba(255,247,240,0.92)]'
      : 'border border-transparent bg-[color:var(--accent-primary)] text-white shadow-[0_16px_30px_rgba(255,106,0,0.24)] hover:-translate-y-px hover:bg-[color:var(--accent-strong)]';

  return (
    <button className={cn(baseClassName, variantClassName, className)} {...props}>
      {children}
    </button>
  );
};

export default Button;
