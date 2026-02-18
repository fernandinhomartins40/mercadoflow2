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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-spin">⚙️</div>
          <div className="text-gray-600">Carregando...</div>
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} onSkip={handleOnboardingSkip} />;
  }

  return (
    <div className="min-h-screen p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold">PDV2Cloud Collector Agent</h2>
        <button
          onClick={handleRestartOnboarding}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm font-semibold"
        >
          🧭 Assistente de Configuração
        </button>
      </div>
      <div className="grid">
        <Dashboard key={refreshKey} serviceInstalled={serviceInstalled} />
        <ServiceControl serviceInstalled={serviceInstalled} onServiceInstalled={handleServiceInstalled} />
      </div>
      <div style={{ marginTop: 16 }}>
        <Configuration />
      </div>
      <div style={{ marginTop: 16 }}>
        <LogViewer />
      </div>
    </div>
  );
};

export default App;
