import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import Configuration from './components/Configuration';
import LogViewer from './components/LogViewer';
import ServiceControl from './components/ServiceControl';
import OnboardingWizard from './components/OnboardingWizard';

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
    // Check if this is first run
    const checkFirstRun = async () => {
      try {
        const config = await (window as any).electron.invoke('config:load');
        const isConfigured = config && config.api_key;
        setShowOnboarding(!isConfigured);
      } catch (err) {
        // No config file = first run
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
        backgroundColor: '#f3f4f6'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚙️</div>
          <div style={{ fontSize: '16px', color: '#6b7280' }}>Carregando...</div>
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} onSkip={handleOnboardingSkip} />;
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', padding: '24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        backgroundColor: '#ffffff',
        padding: '20px 24px',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#111827', margin: '0 0 4px 0' }}>
            PDV2Cloud
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
            Coletor Automático de Notas Fiscais
          </p>
        </div>
        <button
          onClick={handleRestartOnboarding}
          style={{
            padding: '12px 20px',
            backgroundColor: '#3b82f6',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
        >
          <span>🧭</span>
          Assistente de Configuração
        </button>
      </div>

      {/* Main Content - Single Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', maxWidth: '1200px', margin: '0 auto' }}>
        <Dashboard key={refreshKey} serviceInstalled={serviceInstalled} />
        <ServiceControl serviceInstalled={serviceInstalled} onServiceInstalled={handleServiceInstalled} />
      </div>

      {/* Configuration and Logs hidden for simplified UX - accessible via wizard */}
    </div>
  );
};

export default App;
