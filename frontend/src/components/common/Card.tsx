import React from 'react';
import { cn } from '../../lib/cn';

/**
 * Cartão base: superfície com borda e raio padrão do design system.
 *
 * `padding` cobre o caso comum (padding menor no mobile, maior a partir de sm)
 * para que as telas não repitam `p-4 sm:p-5` manualmente.
 */

interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** Espaçamento interno responsivo. `none` deixa o controle para quem usa. */
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const PADDING_CLASS: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3 sm:p-4',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
};

const Card: React.FC<CardProps> = ({ children, className, padding = 'none' }) => {
  return (
    <div
      className={cn(
        'min-w-0 rounded-xl border border-slate-200 bg-white',
        PADDING_CLASS[padding],
        className,
      )}
    >
      {children}
    </div>
  );
};

export default Card;
