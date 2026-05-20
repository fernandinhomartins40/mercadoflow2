// Design tokens alinhados ao painel admin/superadmin do MercadoFlow
// Referência: WorkspaceSidebar.tsx, WorkspaceTopbar.tsx, tailwind.css (:root)

import React from 'react';

export const colors = {
  // Cor de marca — verde, igual ao painel web (brand-500/600/700)
  primary: {
    50:  '#f0fdf4',  // surface-success
    100: '#dcfce7',  // brand-100
    200: '#bbf7d0',  // brand-200
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',  // brand-500 — bg-green-500 (sidebar item ativo, logo mark)
    600: '#16a34a',  // brand-600 — hover do botão primário
    700: '#15803d',  // brand-700 — texto sobre fundo success
    800: '#166534',
    900: '#14532d',
  },
  // Sucesso — mesmo que primary (verde)
  success: {
    50:  '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
  },
  // Alerta
  warning: {
    50:  '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
  },
  // Erro/crítico
  error: {
    50:  '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
  },
  // Info (azul — apenas para status info, não cor de marca)
  info: {
    50:  '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
  },
  // Neutros slate — painel usa escala slate (cool), não gray (warm)
  neutral: {
    50:  '#f8fafc',  // surface-soft — fundo da página
    100: '#f1f5f9',  // surface-muted
    200: '#e2e8f0',  // border-soft
    300: '#cbd5e1',  // border-strong
    400: '#94a3b8',  // text-soft — sidebar texto inativo
    500: '#64748b',  // text-muted — sidebar ícones inativos
    600: '#475569',
    700: '#334155',
    800: '#1e293b',  // slate-800 — sidebar borda interna
    900: '#0f172a',  // slate-900 — sidebar fundo
  },
  // Surfaces — espelham as variáveis CSS do web
  background: {
    primary:   '#ffffff',  // surface-base — cards, topbar
    secondary: '#f8fafc',  // surface-soft — fundo da página
    tertiary:  '#f1f5f9',  // surface-muted
    sidebar:   '#0f172a',  // slate-900 — sidebar fundo
  },
  // Texto — espelham text-primary / text-muted / text-soft
  text: {
    primary:   '#0f172a',  // slate-900
    secondary: '#64748b',  // slate-500
    tertiary:  '#94a3b8',  // slate-400
    inverse:   '#ffffff',
    sidebar:   '#94a3b8',  // texto inativo na sidebar
  },
};

export const typography = {
  fontFamily: {
    sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", "IBM Plex Mono", Consolas, "Courier New", monospace',
  },
  fontSize: {
    xs:   '12px',
    sm:   '14px',
    base: '16px',
    lg:   '18px',
    xl:   '20px',
    '2xl': '24px',
    '3xl': '30px',
    '4xl': '36px',
  },
  fontWeight: {
    normal:   400,
    medium:   500,
    semibold: 600,
    bold:     700,
  },
  lineHeight: {
    tight:   1.25,
    normal:  1.5,
    relaxed: 1.75,
  },
};

export const spacing = {
  xs:  '4px',
  sm:  '8px',
  md:  '12px',
  lg:  '16px',
  xl:  '24px',
  '2xl': '32px',
  '3xl': '48px',
};

export const borderRadius = {
  sm:   '6px',   // radius-sm
  md:   '10px',  // radius-md
  lg:   '12px',  // radius-lg
  xl:   '16px',  // radius-xl
  '2xl': '20px',
  full: '9999px',
};

export const shadows = {
  sm: '0 1px 2px 0 rgba(0,0,0,0.05)',
  md: '0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.04)',
  lg: '0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04)',
};

// Ícones SVG (lucide-compatible stroke style)
export const Icons = {
  Check: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  ),
  X: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  ),
  Alert: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
  ),
  Settings: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  ),
  Play: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>
  ),
  Stop: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12"></rect>
    </svg>
  ),
  Refresh: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path>
    </svg>
  ),
  Folder: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    </svg>
  ),
  Key: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
    </svg>
  ),
  Cloud: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
    </svg>
  ),
  Database: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
    </svg>
  ),
  ArrowRight: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"></line>
      <polyline points="12 5 19 12 12 19"></polyline>
    </svg>
  ),
  ArrowLeft: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"></line>
      <polyline points="12 19 5 12 12 5"></polyline>
    </svg>
  ),
  Download: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  ),
  Loader: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="6"></line>
      <line x1="12" y1="18" x2="12" y2="22"></line>
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
      <line x1="2" y1="12" x2="6" y2="12"></line>
      <line x1="18" y1="12" x2="22" y2="12"></line>
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
    </svg>
  ),
};

// Estilos de componentes reutilizáveis
export const components = {
  button: {
    primary: {
      backgroundColor: colors.primary[500],
      color: colors.text.inverse,
      padding: `${spacing.md} ${spacing.xl}`,
      borderRadius: borderRadius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      border: 'none',
      cursor: 'pointer',
      transition: 'background-color 0.15s',
      display: 'inline-flex',
      alignItems: 'center',
      gap: spacing.sm,
      fontFamily: typography.fontFamily.sans,
      minHeight: '40px',
    },
    secondary: {
      backgroundColor: colors.background.primary,
      color: colors.text.primary,
      padding: `${spacing.md} ${spacing.xl}`,
      borderRadius: borderRadius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      border: `1px solid ${colors.neutral[200]}`,
      cursor: 'pointer',
      transition: 'background-color 0.15s',
      display: 'inline-flex',
      alignItems: 'center',
      gap: spacing.sm,
      fontFamily: typography.fontFamily.sans,
      minHeight: '40px',
    },
    // success é alias de primary (verde = marca)
    success: {
      backgroundColor: colors.primary[500],
      color: colors.text.inverse,
      padding: `${spacing.md} ${spacing.xl}`,
      borderRadius: borderRadius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      border: 'none',
      cursor: 'pointer',
      transition: 'background-color 0.15s',
      display: 'inline-flex',
      alignItems: 'center',
      gap: spacing.sm,
      fontFamily: typography.fontFamily.sans,
      minHeight: '40px',
    },
    danger: {
      backgroundColor: colors.error[600],
      color: colors.text.inverse,
      padding: `${spacing.md} ${spacing.xl}`,
      borderRadius: borderRadius.md,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      border: 'none',
      cursor: 'pointer',
      transition: 'background-color 0.15s',
      display: 'inline-flex',
      alignItems: 'center',
      gap: spacing.sm,
      fontFamily: typography.fontFamily.sans,
      minHeight: '40px',
    },
  },
  card: {
    backgroundColor: colors.background.primary,
    borderRadius: borderRadius.lg,
    padding: spacing['2xl'],
    border: `1px solid ${colors.neutral[200]}`,
    boxShadow: shadows.sm,
  },
  badge: {
    online: {
      backgroundColor: colors.primary[50],
      color: colors.primary[700],
      padding: `${spacing.xs} ${spacing.md}`,
      borderRadius: borderRadius.full,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      border: `1px solid ${colors.primary[200]}`,
      display: 'inline-flex',
      alignItems: 'center',
      gap: spacing.xs,
    },
    offline: {
      backgroundColor: colors.error[50],
      color: colors.error[700],
      padding: `${spacing.xs} ${spacing.md}`,
      borderRadius: borderRadius.full,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      border: `1px solid ${colors.error[200]}`,
      display: 'inline-flex',
      alignItems: 'center',
      gap: spacing.xs,
    },
    warning: {
      backgroundColor: colors.warning[50],
      color: colors.warning[700],
      padding: `${spacing.xs} ${spacing.md}`,
      borderRadius: borderRadius.full,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      border: `1px solid ${colors.warning[200]}`,
      display: 'inline-flex',
      alignItems: 'center',
      gap: spacing.xs,
    },
  },
};
