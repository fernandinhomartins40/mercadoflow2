import React from 'react';
import { cn } from '../../lib/cn';

/**
 * Botão base do design system.
 *
 * `size` cobre os tamanhos usados na aplicação para que as telas não precisem
 * sobrescrever altura/padding com `!important`.
 *
 * Rótulos em pt-BR.
 */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ocupa a largura toda no mobile e volta ao tamanho natural a partir de sm. */
  fullWidthOnMobile?: boolean;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'border border-transparent bg-green-500 text-white hover:bg-green-600',
  secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300',
  ghost: 'border border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'border border-transparent bg-red-500 text-white hover:bg-red-600',
  success: 'border border-transparent bg-emerald-500 text-white hover:bg-emerald-600',
  warning: 'border border-transparent bg-amber-500 text-white hover:bg-amber-600',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'h-9 min-h-9 px-3 text-sm',
  md: 'h-10 min-h-10 px-4 text-sm',
  lg: 'h-12 min-h-12 px-7 text-base',
};

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidthOnMobile = false,
  children,
  className,
  type = 'button',
  ...props
}) => {
  const baseClassName =
    'inline-flex items-center justify-center gap-2 rounded-lg text-center font-semibold leading-none whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <button
      type={type}
      className={cn(
        baseClassName,
        SIZE_CLASS[size],
        VARIANT_CLASS[variant],
        fullWidthOnMobile && 'w-full sm:w-auto',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
