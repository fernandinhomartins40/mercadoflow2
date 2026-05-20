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
          <div className="flex flex-col gap-3">
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="secondary" onClick={fetchInstallerInfo}>Tentar novamente</Button>
          </div>
        ) : installerInfo ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
            <div className="flex min-w-0 flex-col gap-5">
              {/* Info do instalador */}
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2">
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-slate-400">PDV2Cloud Agent</p>
                    <h3 className="text-sm font-semibold text-slate-900">Instalador oficial</h3>
                  </div>
                  <Button onClick={handleDownload} disabled={downloading}>
                    {downloading ? 'Baixando...' : 'Baixar instalador'}
                  </Button>
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
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-slate-400">SHA256</p>
                    <div className="code-box">{installerInfo.sha256}</div>
                  </div>
                )}
              </div>

              {/* Requisitos */}
              <div className="flex flex-col gap-3">
                <div className="border-b border-slate-100 pb-2">
                  <h3 className="text-sm font-semibold text-slate-900">Requisitos do sistema</h3>
                </div>
                <div className="settings-stack">
                  <div className="settings-line-card"><strong>✓ Windows 10/11 ou Windows Server 2016+</strong></div>
                  <div className="settings-line-card"><strong>✓ 100 MB de espaço em disco</strong></div>
                  <div className="settings-line-card"><strong>✓ Conexão estável com a internet</strong></div>
                  <div className="settings-line-card"><strong>✓ Permissões de administrador</strong></div>
                </div>
              </div>
            </div>

            <aside className="flex flex-col gap-3">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-sm font-semibold text-slate-900">Instruções</h3>
              </div>
              <div className="grid gap-3">
                <div><strong>1.</strong> Baixe o instalador e salve no servidor local.</div>
                <div><strong>2.</strong> Execute como administrador.</div>
                <div><strong>3.</strong> Informe a chave da API gerada em Configurações.</div>
                <div><strong>4.</strong> Valide o status de sincronização.</div>
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </Layout>
  );
};

export default AgentDownload;
