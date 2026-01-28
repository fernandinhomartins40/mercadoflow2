import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import Configuration from './components/Configuration';
import LogViewer from './components/LogViewer';
import ServiceControl from './components/ServiceControl';

const App: React.FC = () => {
  const [serviceInstalled, setServiceInstalled] = useState<boolean>(true);
  const [refreshKey, setRefreshKey] = useState<number>(0);

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

  const handleServiceInstalled = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen p-6">
      <h2 className="text-2xl font-semibold mb-4">PDV2Cloud Collector Agent</h2>
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
