import React from 'react';
import { Link, LinkProps } from 'react-router-dom';
import { cn } from '../../lib/cn';

interface ButtonLinkProps extends LinkProps {
  variant?: 'primary' | 'secondary';
  className?: string;
}

const ButtonLink: React.FC<ButtonLinkProps> = ({ variant = 'primary', className, children, ...props }) => {
  const baseClassName =
    'inline-flex h-12 min-h-12 max-h-12 items-center justify-center gap-2 rounded-[14px] px-5 text-center text-sm font-semibold leading-none tracking-[-0.01em] no-underline whitespace-nowrap transition duration-200';
  const variantClassName =
    variant === 'secondary'
      ? 'border border-gray-200 bg-white text-gray-900 shadow-[0_10px_24px_rgba(0,0,0,0.06)] hover:-translate-y-px hover:bg-gray-50'
      : 'border border-transparent bg-emerald-600 text-white shadow-[0_16px_30px_rgba(5,150,105,0.24)] hover:-translate-y-px hover:bg-emerald-700';

  return (
    <Link className={cn(baseClassName, variantClassName, className)} {...props}>
      {children}
    </Link>
  );
};

export default ButtonLink;
