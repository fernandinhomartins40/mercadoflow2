// Design tokens alinhados aos painéis do MercadoFlow (visual Flow, out/2026).

import React from 'react';

// Visual Flow (out/2026), o mesmo dos painéis web: fundo menta, verde-floresta
// para o que importa, limão para destacar e a doca escura.
export const flow = {
  ground: '#EEF3EF', card: '#FFFFFF', card2: '#F6F9F6', line: '#E1E8E2', line2: '#CCD8CF',
  ink: '#0B1F16', ink2: '#2F4339', muted: '#5F7067', forest: '#0F3A29', forest2: '#164A35', dock: '#0D2E21',
  onForest: '#F2F8F3', onForestMuted: '#A9C2B4', forestLine: 'rgba(255, 255, 255, 0.1)',
  lime: '#D7F26B', limeStrong: '#C9EA45', limeSoft: '#F4FBDD', limeLine: '#CFE57A', limeInk: '#142400',
  green: '#157A3D', red: '#C2362B', redSoft: '#FDE4E1', amber: '#9A5B00', amberSoft: '#FFF3D6',
  shadow: '0 1px 0 rgba(11, 31, 22, 0.03), 0 10px 30px -18px rgba(11, 31, 22, 0.28)',
};

export const colors = {
  // Marca: verde do Flow, escurecendo até o verde-floresta.
  primary: {
    50:  '#F4FBDD',
    100: '#E9F6C4',
    200: '#CFE57A',
    300: '#A9D17A',
    400: '#3F9A62',
    500: '#157A3D',
    600: '#0F6332',
    700: '#0F3A29',
    800: '#0B2E20',
    900: '#0D2E21',
  },
  success: {
    50:  '#E2F3E7',
    100: '#CDEBD6',
    200: '#A9D9B6',
    300: '#7EC495',
    400: '#3F9A62',
    500: '#157A3D',
    600: '#0F6332',
    700: '#0F3A29',
    800: '#0B2E20',
  },
  warning: {
    50:  '#FFF3D6',
    100: '#FDE9BC',
    200: '#F2D9A4',
    300: '#E9C27A',
    400: '#D9A441',
    500: '#B97A12',
    600: '#9A5B00',
    700: '#7C4900',
    800: '#5E3700',
  },
  error: {
    50:  '#FDE4E1',
    100: '#FBD3CE',
    200: '#F5C2BC',
    300: '#EC9B92',
    400: '#DE6A5E',
    500: '#C2362B',
    600: '#C2362B',
    700: '#A92D23',
    800: '#8A241C',
    900: '#6B1C16',
  },
  info: {
    50:  '#EEF5F8',
    100: '#DCEAF1',
    200: '#BDD7E4',
    300: '#93BED3',
    400: '#5E9DBC',
    500: '#2F7EA3',
    600: '#226588',
    700: '#1B506C',
    800: '#163F55',
  },
  // Neutros no tom menta do Flow.
  neutral: {
    50:  '#F6F9F6',
    100: '#EEF3EF',
    200: '#E1E8E2',
    300: '#CCD8CF',
    400: '#7D8C84',
    500: '#5F7067',
    600: '#2F4339',
    700: '#2F4339',
    800: '#164A35',
    900: '#0F3A29',
  },
  background: {
    primary:   '#FFFFFF',
    secondary: '#EEF3EF',
    tertiary:  '#F6F9F6',
    sidebar:   '#0F3A29',
  },
  text: {
    primary:   '#0B1F16',
    secondary: '#5F7067',
    tertiary:  '#7D8C84',
    inverse:   '#FFFFFF',
    sidebar:   '#A9C2B4',
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
    semibold: 650,
    bold:     800,
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
  sm:   '8px',
  md:   '12px',
  lg:   '18px',
  xl:   '22px',
  '2xl': '26px',
  full: '9999px',
};

export const shadows = {
  sm: '0 1px 0 rgba(11, 31, 22, 0.03)',
  md: '0 1px 0 rgba(11, 31, 22, 0.03), 0 10px 30px -18px rgba(11, 31, 22, 0.28)',
  lg: '0 24px 60px -28px rgba(11, 31, 22, 0.45)',
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
