import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import ServiceControl from './components/ServiceControl';
import OnboardingWizard from './components/OnboardingWizard';
import { colors, typography, spacing, borderRadius, shadows, Icons } from './styles/theme';

const App: React.FC = () => {
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
      if (errorMsg.includes('SERVICE_NOT_INSTALLED')) {
        setServiceInstalled(false);
      } else {
        setServiceInstalled(true);
      }
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
      } catch (err) {
        setShowOnboarding(true);
      } finally {
        setOnboardingChecked(true);
      }
    };
    checkFirstRun();
  }, []);

  const handleServiceInstalled = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    setRefreshKey(prev => prev + 1);
  };

  const handleOnboardingSkip = () => {
    setShowOnboarding(false);
  };

  const handleRestartOnboarding = () => {
    setShowOnboarding(true);
  };

  if (!onboardingChecked) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background.tertiary,
        fontFamily: typography.fontFamily.sans
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '64px',
            height: '64px',
            margin: '0 auto 16px',
            color: colors.primary[600]
          }}>
            <Icons.Loader />
          </div>
          <div style={{
            fontSize: typography.fontSize.lg,
            color: colors.text.secondary,
            fontFamily: typography.fontFamily.sans
          }}>
            Carregando...
          </div>
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} onSkip={handleOnboardingSkip} />;
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.background.tertiary,
      padding: spacing.xl,
      fontFamily: typography.fontFamily.sans
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.xl,
        backgroundColor: colors.background.primary,
        padding: spacing.xl,
        borderRadius: borderRadius.lg,
        boxShadow: shadows.md,
        border: `1px solid ${colors.neutral[200]}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
          <div style={{
            width: '56px',
            height: '56px',
            background: `linear-gradient(135deg, ${colors.primary[600]} 0%, ${colors.primary[700]} 100%)`,
            borderRadius: borderRadius.lg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: colors.text.inverse
          }}>
            <Icons.Cloud />
          </div>
          <div>
            <h1 style={{
              fontSize: typography.fontSize['3xl'],
              fontWeight: typography.fontWeight.bold,
              color: colors.text.primary,
              margin: 0,
              marginBottom: spacing.xs,
              fontFamily: typography.fontFamily.sans
            }}>
              PDV2Cloud
            </h1>
            <p style={{
              fontSize: typography.fontSize.base,
              color: colors.text.secondary,
              margin: 0,
              fontFamily: typography.fontFamily.sans
            }}>
              Coletor Automático de Notas Fiscais
            </p>
          </div>
        </div>
        <button
          onClick={handleRestartOnboarding}
          style={{
            padding: `${spacing.md} ${spacing.xl}`,
            backgroundColor: colors.primary[600],
            color: colors.text.inverse,
            border: 'none',
            borderRadius: borderRadius.md,
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.semibold,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
            transition: 'background-color 0.2s',
            fontFamily: typography.fontFamily.sans
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.primary[700]}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = colors.primary[600]}
        >
          <Icons.Settings />
          Assistente de Configuração
        </button>
      </div>

      {/* Main Content */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: spacing.xl,
        maxWidth: '1400px',
        margin: '0 auto'
      }}>
        <Dashboard key={refreshKey} serviceInstalled={serviceInstalled} />
        <ServiceControl serviceInstalled={serviceInstalled} onServiceInstalled={handleServiceInstalled} />
      </div>
    </div>
  );
};

export default App;
