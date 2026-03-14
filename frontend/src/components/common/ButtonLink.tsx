import React from 'react';
import { Link, LinkProps } from 'react-router-dom';
import { cn } from '../../lib/cn';

interface ButtonLinkProps extends LinkProps {
  variant?: 'primary' | 'secondary';
  className?: string;
}

const ButtonLink: React.FC<ButtonLinkProps> = ({ variant = 'primary', className, children, ...props }) => {
  const baseClassName =
    'button inline-flex h-12 min-h-12 max-h-12 items-center justify-center rounded-[14px] px-5 text-center text-sm font-semibold leading-none tracking-[-0.01em] no-underline whitespace-nowrap transition duration-200';
  const variantClassName =
    variant === 'secondary'
      ? 'secondary border border-[rgba(87,51,30,0.12)] bg-white text-[color:var(--text-primary)] shadow-[0_10px_24px_rgba(44,20,6,0.06)] hover:-translate-y-px hover:bg-[rgba(255,247,240,0.92)]'
      : 'border border-transparent bg-[color:var(--accent-primary)] text-white shadow-[0_16px_30px_rgba(255,106,0,0.24)] hover:-translate-y-px hover:bg-[color:var(--accent-strong)]';

  return (
    <Link className={cn(baseClassName, variantClassName, className)} {...props}>
      {children}
    </Link>
  );
};

export default ButtonLink;
