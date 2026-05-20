import React from 'react';
import { Link, LinkProps } from 'react-router-dom';
import { cn } from '../../lib/cn';

interface ButtonLinkProps extends LinkProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
}

const ButtonLink: React.FC<ButtonLinkProps> = ({ variant = 'primary', className, children, ...props }) => {
  const baseClassName =
    'inline-flex h-10 min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-center text-sm font-semibold leading-none no-underline whitespace-nowrap transition-colors duration-150';
  const variantClassName =
    variant === 'secondary'
      ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'
      : variant === 'ghost'
      ? 'border border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      : 'border border-transparent bg-green-500 text-white hover:bg-green-600';

  return (
    <Link className={cn(baseClassName, variantClassName, className)} {...props}>
      {children}
    </Link>
  );
};

export default ButtonLink;
