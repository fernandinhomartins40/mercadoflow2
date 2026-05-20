import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import ServiceControl from './components/ServiceControl';
import OnboardingWizard from './components/OnboardingWizard';
import { colors, typography, spacing, borderRadius, Icons } from './styles/theme';

// ── Sidebar ───────────────────────────────────────────────────────────────
type NavItem = { id: string; label: string; icon: keyof typeof Icons };

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Painel',    icon: 'Database' },
  { id: 'service',   label: 'Serviço',   icon: 'Settings' },
];

const Sidebar: React.FC<{ active: string; onSelect: (id: string) => void }> = ({ active, onSelect }) => (
  <aside style={{
    width: '220px',
    minWidth: '220px',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: colors.background.sidebar,   // slate-900
    borderRight: `1px solid ${colors.neutral[800]}`,
    position: 'fixed',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 30,
  }}>
    {/* Brand */}
    <div style={{
      height: '56px',
      display: 'flex',
      alignItems: 'center',
      gap: spacing.md,
      padding: `0 ${spacing.lg}`,
      borderBottom: `1px solid ${colors.neutral[800]}`,
    }}>
      <div style={{
        width: '32px',
        height: '32px',
        borderRadius: borderRadius.md,
        backgroundColor: colors.primary[500],   // verde — igual ao logo mark do web
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff',
        fontSize: '13px',
        fontWeight: 700,
        fontFamily: typography.fontFamily.sans,
        flexShrink: 0,
      }}>
        MF
      </div>
      <div>
        <p style={{
          margin: 0,
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.semibold,
          color: '#ffffff',
          fontFamily: typography.fontFamily.sans,
          lineHeight: 1.2,
        }}>
          PDV2Cloud
        </p>
        <p style={{
          margin: 0,
          fontSize: '11px',
          color: colors.neutral[400],
          fontFamily: typography.fontFamily.sans,
          lineHeight: 1.2,
        }}>
          Coletor de Notas
        </p>
      </div>
    </div>

    {/* Nav */}
    <nav style={{ flex: 1, padding: `${spacing.md} ${spacing.sm}`, overflowY: 'auto' }}>
      <p style={{
        margin: `0 0 ${spacing.xs} ${spacing.md}`,
        fontSize: '10px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: colors.neutral[500],
        fontFamily: typography.fontFamily.sans,
      }}>
        Monitoramento
      </p>
      {NAV_ITEMS.map((item) => {
        const isActive = active === item.id;
        const IconComp = Icons[item.icon];
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: spacing.md,
              padding: `${spacing.sm} ${spacing.md}`,
              borderRadius: borderRadius.md,
              border: 'none',
              cursor: 'pointer',
              fontFamily: typography.fontFamily.sans,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              minHeight: '36px',
              marginBottom: '2px',
              transition: 'background-color 0.1s',
              backgroundColor: isActive ? colors.primary[500] : 'transparent',
              color: isActive ? '#ffffff' : colors.neutral[400],
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.backgroundColor = colors.neutral[800];
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span style={{
              display: 'flex',
              alignItems: 'center',
              color: isActive ? '#ffffff' : colors.neutral[500],
              flexShrink: 0,
            }}>
              <IconComp />
            </span>
            {item.label}
          </button>
        );
      })}
    </nav>
  </aside>
);

// ── Topbar ────────────────────────────────────────────────────────────────
const PAGE_TITLES: Record<string, { section: string; title: string }> = {
  dashboard: { section: 'Monitoramento', title: 'Painel' },
  service:   { section: 'Monitoramento', title: 'Controle do Serviço' },
};

const Topbar: React.FC<{
  page: string;
  onOpenOnboarding: () => void;
}> = ({ page, onOpenOnboarding }) => {
  const meta = PAGE_TITLES[page] || PAGE_TITLES.dashboard;
  return (
    <header style={{
      position: 'fixed',
      top: 0,
      left: '220px',
      right: 0,
      height: '56px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: `0 ${spacing.xl}`,
      backgroundColor: colors.background.primary,     // branco — igual ao WorkspaceTopbar web
      borderBottom: `1px solid ${colors.neutral[200]}`,  // border-soft
      zIndex: 20,
      gap: spacing.lg,
    }}>
      <div>
        <span style={{
          display: 'block',
          fontSize: '10px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: colors.neutral[400],                  // text-soft
          fontFamily: typography.fontFamily.sans,
          lineHeight: 1,
          marginBottom: '2px',
        }}>
          {meta.section}
        </span>
        <h2 style={{
          margin: 0,
          fontSize: typography.fontSize.base,
          fontWeight: typography.fontWeight.semibold,
          color: colors.text.primary,
          fontFamily: typography.fontFamily.sans,
          lineHeight: 1,
        }}>
          {meta.title}
        </h2>
      </div>

      <button
        onClick={onOpenOnboarding}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: spacing.sm,
          padding: `${spacing.sm} ${spacing.lg}`,
          backgroundColor: colors.background.primary,
          color: colors.text.primary,
          border: `1px solid ${colors.neutral[200]}`,
          borderRadius: borderRadius.md,
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.medium,
          cursor: 'pointer',
          fontFamily: typography.fontFamily.sans,
          minHeight: '36px',
          transition: 'background-color 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.neutral[100])}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = colors.background.primary)}
      >
        <Icons.Settings />
        Configurar
      </button>
    </header>
  );
};

// ── Loading screen ────────────────────────────────────────────────────────
const LoadingScreen: React.FC = () => (
  <div style={{
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.secondary,
    fontFamily: typography.fontFamily.sans,
  }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: '40px', height: '40px', margin: '0 auto 16px', color: colors.primary[500] }}>
        <Icons.Loader />
      </div>
      <p style={{ margin: 0, fontSize: typography.fontSize.sm, color: colors.text.secondary }}>
        Carregando...
      </p>
    </div>
  </div>
);

// ── App root ──────────────────────────────────────────────────────────────
const App: React.FC = () => {
  const [activePage, setActivePage] = useState<'dashboard' | 'service'>('dashboard');
  const [serviceInstalled, setServiceInstalled] = useState<boolean>(true);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [onboardingChecked, setOnboardingChecked] = useState<boolean>(false);

  const checkServiceStatus = useCallback(async () => {
    try {
      await (window as any).pdv2cloud.serviceStatus();
      setServiceInstalled(true);
    } catch (err) {
      const errorMsg = String(err);
      setServiceInstalled(!errorMsg.includes('SERVICE_NOT_INSTALLED'));
    }
  }, []);

  useEffect(() => {
    checkServiceStatus();
  }, [checkServiceStatus, refreshKey]);

  useEffect(() => {
    const checkFirstRun = async () => {
      try {
        const config = await (window as any).electron.invoke('config:load');
        const isConfigured = Boolean(
          config && (config.api_key || config.api_key_encrypted || config.api_token || config.api_token_encrypted)
        );
        setShowOnboarding(!isConfigured);
      } catch {
        setShowOnboarding(true);
      } finally {
        setOnboardingChecked(true);
      }
    };
    checkFirstRun();
  }, []);

  const handleServiceInstalled = () => setRefreshKey((k) => k + 1);
  const handleOnboardingComplete = () => { setShowOnboarding(false); setRefreshKey((k) => k + 1); };
  const handleOnboardingSkip = () => setShowOnboarding(false);

  if (!onboardingChecked) return <LoadingScreen />;

  if (showOnboarding) {
    return (
      <OnboardingWizard
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
      />
    );
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      backgroundColor: colors.background.secondary,  // surface-soft
      fontFamily: typography.fontFamily.sans,
    }}>
      <Sidebar active={activePage} onSelect={(id) => setActivePage(id as any)} />

      {/* Main shell */}
      <div style={{
        marginLeft: '220px',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        minWidth: 0,
      }}>
        <Topbar page={activePage} onOpenOnboarding={() => setShowOnboarding(true)} />

        {/* Content */}
        <main style={{
          flex: 1,
          padding: spacing.xl,
          paddingTop: `calc(56px + ${spacing.xl})`,  // topbar height + gap
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.xl,
          maxWidth: '1200px',
          width: '100%',
          margin: '0 auto',
          alignSelf: 'stretch',
        }}>
          {activePage === 'dashboard' && (
            <Dashboard key={refreshKey} serviceInstalled={serviceInstalled} />
          )}
          {activePage === 'service' && (
            <ServiceControl
              serviceInstalled={serviceInstalled}
              onServiceInstalled={handleServiceInstalled}
              onServiceStatusChanged={handleServiceInstalled}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
