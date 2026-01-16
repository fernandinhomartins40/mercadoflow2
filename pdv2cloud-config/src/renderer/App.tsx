import React from 'react';
import Dashboard from './components/Dashboard';
import Configuration from './components/Configuration';
import LogViewer from './components/LogViewer';
import ServiceControl from './components/ServiceControl';

const App: React.FC = () => {
  return (
    <div className="min-h-screen p-6">
      <h2 className="text-2xl font-semibold mb-4">PDV2Cloud Collector Agent</h2>
      <div className="grid">
        <Dashboard />
        <ServiceControl />
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
