import React, { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import PageHeader from '../components/layout/PageHeader';

interface InstallerInfo {
  filename: string;
  size: number;
  sizeFormatted: string;
  lastModified: string;
  lastModifiedTimestamp: number;
  version?: string;
  sha256?: string;
  downloadUrl: string;
}

const AgentDownload: React.FC = () => {
  const [installerInfo, setInstallerInfo] = useState<InstallerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const fetchInstallerInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/downloads/agent-installer/info');
      if (!response.ok) {
        throw new Error('Instalador não disponível no momento');
      }
      const data = await response.json();
      setInstallerInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar informações do instalador');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstallerInfo();
  }, []);

  const handleDownload = async () => {
    if (!installerInfo) return;

    setDownloading(true);
    try {
      const link = document.createElement('a');
      link.href = '/api/v1/downloads/agent-installer';
      link.download = installerInfo.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      alert('Erro ao iniciar o download');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Layout>
      <div className="page analytics-page">
        <PageHeader
          title="Download do agente"
          subtitle="Baixe e instale o coletor PDV2Cloud."
          actions={
            <Button variant="secondary" onClick={fetchInstallerInfo} disabled={loading}>
              Verificar atualização
            </Button>
          }
        />

        {loading ? (
          <div className="panel-empty">Carregando informações...</div>
        ) : error ? (
          <div className="analytics-panel">
            <div className="panel-empty" style={{ color: 'var(--danger)' }}>{error}</div>
            <div className="panel-actions" style={{ marginTop: 12 }}>
              <Button variant="secondary" onClick={fetchInstallerInfo}>Tentar novamente</Button>
            </div>
          </div>
        ) : installerInfo ? (
          <div className="layout-split">
            <div className="layout-main">
              {/* Info do instalador */}
              <section className="analytics-panel reveal">
                <div className="analytics-panel-head compact">
                  <div>
                    <span className="section-kicker">PDV2Cloud Agent</span>
                    <h3>Instalador oficial</h3>
                  </div>
                  <div className="page-header-actions">
                    <Button onClick={handleDownload} disabled={downloading}>
                      {downloading ? 'Baixando...' : 'Baixar instalador'}
                    </Button>
                  </div>
                </div>

                <div className="settings-stack">
                  <div className="settings-line-card">
                    <div><strong>Arquivo</strong></div>
                    <strong>{installerInfo.filename}</strong>
                  </div>
                  {installerInfo.version && (
                    <div className="settings-line-card">
                      <div><strong>Versão</strong></div>
                      <strong>{installerInfo.version}</strong>
                    </div>
                  )}
                  <div className="settings-line-card">
                    <div><strong>Tamanho</strong></div>
                    <strong>{installerInfo.sizeFormatted}</strong>
                  </div>
                  <div className="settings-line-card">
                    <div><strong>Última atualização</strong></div>
                    <strong>{installerInfo.lastModified}</strong>
                  </div>
                </div>

                {installerInfo.sha256 && (
                  <div style={{ marginTop: 16 }}>
                    <span className="section-kicker">SHA256</span>
                    <div className="code-box" style={{ marginTop: 6 }}>{installerInfo.sha256}</div>
                  </div>
                )}
              </section>

              {/* Requisitos */}
              <section className="analytics-panel reveal">
                <div className="analytics-panel-head compact">
                  <h3>Requisitos do sistema</h3>
                </div>
                <div className="settings-stack">
                  <div className="settings-line-card"><strong>✓ Windows 10/11 ou Windows Server 2016+</strong></div>
                  <div className="settings-line-card"><strong>✓ 100 MB de espaço em disco</strong></div>
                  <div className="settings-line-card"><strong>✓ Conexão estável com a internet</strong></div>
                  <div className="settings-line-card"><strong>✓ Permissões de administrador</strong></div>
                </div>
              </section>
            </div>

            <aside className="layout-aside">
              <section className="analytics-panel reveal">
                <div className="analytics-panel-head compact">
                  <h3>Instruções</h3>
                </div>
                <div className="dashboard-form-stack" style={{ gap: 12 }}>
                  <div><strong>1.</strong> Baixe o instalador e salve no servidor local.</div>
                  <div><strong>2.</strong> Execute como administrador.</div>
                  <div><strong>3.</strong> Informe a chave da API gerada em Configurações.</div>
                  <div><strong>4.</strong> Valide o status de sincronização.</div>
                </div>
              </section>
            </aside>
          </div>
        ) : null}
      </div>
    </Layout>
  );
};

export default AgentDownload;
