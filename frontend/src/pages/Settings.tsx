import React from 'react';
import Layout from '../components/layout/Layout';

const Settings: React.FC = () => {
  return (
    <Layout>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Configuracoes</h3>
        <p>Controle de conta, preferencia e integracoes.</p>
      </div>
    </Layout>
  );
};

export default Settings;
