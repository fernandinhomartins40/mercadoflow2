import React from 'react';

/**
 * Base visual da Landing (redesenho de 22/10/2026). Cores tiradas da referência
 * aprovada pelo dono: verde-escuro nos botões, verde vivo nos destaques, azul
 * marinho nas faixas escuras e verde-limão no chamado da indústria.
 */
export const LANDING = {
  green900: '#064e3b',
  green800: '#065f46',
  green700: '#047857',
  green600: '#16a34a',
  green500: '#22c55e',
  green100: '#dcfce7',
  green50: '#f0fdf4',
  lime: '#d9f99d',
  navy: '#0f172a',
  navy800: '#1e293b',
  ink: '#0f172a',
  text: '#334155',
  muted: '#64748b',
  line: '#e2e8f0',
  surface: '#ffffff',
  soft: '#f8fafc',
  red: '#ef4444',
  amber: '#f59e0b',
  blue: '#3b82f6',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  orange: '#f97316',
  shadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06)',
  radius: 16,
} as const;

/** Largura e respiro laterais de todas as seções (16 px no celular). */
export const Container: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>
);

/** Selo verde em caixa alta acima dos títulos ("FUNCIONALIDADES", "PLANOS"...). */
export const SectionBadge: React.FC<{ children: React.ReactNode; dark?: boolean }> = ({ children, dark = false }) => (
  <span
    className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
    style={
      dark
        ? { background: LANDING.green500, color: LANDING.navy }
        : { background: LANDING.green50, color: LANDING.green700, border: `1px solid ${LANDING.green100}` }
    }
  >
    {children}
  </span>
);

/** Título e subtítulo centralizados de seção. */
export const SectionTitle: React.FC<{
  badge?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  dark?: boolean;
  align?: 'center' | 'left';
}> = ({ badge, title, subtitle, dark = false, align = 'center' }) => (
  <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-xl'}>
    {badge && <SectionBadge dark={dark}>{badge}</SectionBadge>}
    <h2
      className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl"
      style={{ color: dark ? '#ffffff' : LANDING.ink, fontFamily: 'var(--font-display)' }}
    >
      {title}
    </h2>
    {subtitle && (
      <p className="mt-3 text-base" style={{ color: dark ? '#cbd5e1' : LANDING.muted }}>
        {subtitle}
      </p>
    )}
  </div>
);
