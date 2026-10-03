import React from 'react';
import { Link, LinkProps } from 'react-router-dom';
import { cn } from '../../lib/cn';

interface ButtonLinkProps extends LinkProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
}

const ButtonLink: React.FC<ButtonLinkProps> = ({ variant = 'primary', className, children, ...props }) => {
  const baseClassName =
    'inline-flex h-11 min-h-11 items-center justify-center gap-2 rounded-full px-5 text-center text-[15px] font-semibold leading-none no-underline whitespace-nowrap transition-colors duration-150';
  const variantClassName =
    variant === 'secondary'
      ? 'border border-[var(--fx-line-2)] bg-white text-[var(--fx-ink)] hover:bg-[var(--fx-lime-soft)]'
      : variant === 'ghost'
      ? 'border border-transparent bg-transparent text-[var(--fx-ink-2)] hover:bg-[var(--fx-ground)]'
      : 'border border-transparent bg-[var(--fx-forest)] text-white hover:bg-[var(--fx-forest-2)]';

  return (
    <Link className={cn(baseClassName, variantClassName, className)} {...props}>
      {children}
    </Link>
  );
};

export default ButtonLink;
