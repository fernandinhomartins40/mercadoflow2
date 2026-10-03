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

// Flow: floresta na ação principal, branco na secundária, limão para confirmar.
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'border border-transparent bg-[var(--fx-forest)] text-white hover:bg-[var(--fx-forest-2)]',
  secondary: 'border border-[var(--fx-line-2)] bg-white text-[var(--fx-ink)] hover:bg-[var(--fx-lime-soft)]',
  ghost: 'border border-transparent bg-transparent text-[var(--fx-ink-2)] hover:bg-[var(--fx-ground)] hover:text-[var(--fx-ink)]',
  danger: 'border border-transparent bg-[var(--fx-red)] text-white hover:brightness-95',
  success: 'border border-transparent bg-[var(--fx-lime)] text-[var(--fx-lime-ink)] hover:bg-[var(--fx-lime-strong)]',
  warning: 'border border-transparent bg-[#E8A317] text-[#2A1800] hover:brightness-95',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'h-9 min-h-9 px-3 text-sm',
  md: 'h-11 min-h-11 px-5 text-[15px]',
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
    'inline-flex items-center justify-center gap-2 rounded-full text-center font-semibold leading-none whitespace-nowrap transition duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';

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
