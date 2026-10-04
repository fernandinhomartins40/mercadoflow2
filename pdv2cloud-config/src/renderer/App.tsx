import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import ServiceControl from './components/ServiceControl';
import OnboardingWizard from './components/OnboardingWizard';
import { colors, flow, typography, spacing, Icons } from './styles/theme';

// ── Topo (visual Flow, igual aos painéis web) ─────────────────────────────
type NavItem = { id: 'dashboard' | 'service'; label: string; icon: keyof typeof Icons };

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Painel',  icon: 'Database' },
  { id: 'service',   label: 'Serviço', icon: 'Settings' },
];

const TopBar: React.FC<{
  active: string;
  onSelect: (id: 'dashboard' | 'service') => void;
  onOpenOnboarding: () => void;
}> = ({ active, onSelect, onOpenOnboarding }) => {
  const current = NAV_ITEMS.find((i) => i.id === active) ?? NAV_ITEMS[0];
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg,
      padding: `10px ${spacing.xl}`,
      background: 'rgba(238, 243, 239, 0.9)', backdropFilter: 'blur(10px)',
      borderBottom: `1px solid ${flow.line}`,
      fontFamily: typography.fontFamily.sans,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, minWidth: 0 }}>
        <span style={{
          width: 36, height: 36, borderRadius: '50%', background: flow.green, color: '#fff',
          display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0,
        }}>MF</span>
        <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', color: flow.ink, whiteSpace: 'nowrap' }}>
          Mercado<span style={{ fontWeight: 600 }}>Flow</span>
        </span>
        <span style={{ width: 1, height: 22, background: flow.line2, margin: '0 4px' }} aria-hidden="true" />
        <span style={{ fontSize: 14, color: flow.muted, whiteSpace: 'nowrap' }}>
          Agente do caixa <span aria-hidden="true">/</span> <b style={{ color: flow.ink }}>{current.label}</b>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
        <nav aria-label="Seções do agente" style={{
          display: 'flex', gap: 4, padding: 5, borderRadius: 999, background: '#fff',
          border: `1px solid ${flow.line}`, boxShadow: flow.shadow,
        }}>
          {NAV_ITEMS.map((item) => {
            const on = active === item.id;
            const IconComp = Icons[item.icon];
            return (
              <button key={item.id} type="button" onClick={() => onSelect(item.id)} aria-current={on ? 'page' : undefined}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 38, padding: '0 16px',
                  borderRadius: 999, border: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14.5, fontWeight: 650,
                  background: on ? flow.forest : 'transparent', color: on ? '#fff' : flow.muted,
                }}>
                <span style={{ display: 'flex', width: 18, height: 18 }}><IconComp /></span>{item.label}
              </button>
            );
          })}
        </nav>
        <button type="button" onClick={onOpenOnboarding} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 18px',
          borderRadius: 999, border: `1px solid ${flow.line2}`, background: '#fff', color: flow.ink,
          fontFamily: 'inherit', fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
        }}>
          <span style={{ display: 'flex', width: 18, height: 18 }}><Icons.Settings /></span>Configurar
        </button>
      </div>
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
      minHeight: '100vh',
      background: `radial-gradient(1000px 460px at 85% -10%, rgba(215, 242, 107, 0.18), transparent 60%), ${flow.ground}`,
      fontFamily: typography.fontFamily.sans,
      color: flow.ink,
    }}>
      <TopBar active={activePage} onSelect={setActivePage} onOpenOnboarding={() => setShowOnboarding(true)} />
      <main style={{
        padding: `${spacing.xl} ${spacing.xl} ${spacing['2xl']}`,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.xl,
        maxWidth: '1200px',
        margin: '0 auto',
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
  );
};

export default App;
