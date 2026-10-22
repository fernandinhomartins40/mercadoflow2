import React, { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import PageHeader from '../components/layout/PageHeader';
import ButtonLink from '../components/common/ButtonLink';
import ConnectCashierSteps, { PAIRING_PATH } from '../components/activation/ConnectCashierSteps';
import { Link } from 'react-router-dom';
import { alertDialog } from '../components/common/Dialogs';

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
      void alertDialog('Erro ao iniciar o download');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Layout>
      <div className="page analytics-page">
        <PageHeader
          title="Instale no computador do caixa para as vendas chegarem aqui." 
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
          <div className="flex flex-col gap-5">
            {/* Três passos em palavras do dia a dia: o código do programa é o caminho ensinado; a chave fica no avançado. */}
            <ConnectCashierSteps />
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleDownload} disabled={downloading}>
                {downloading ? 'Baixando...' : 'Baixar o programa do caixa'}
              </Button>
              <ButtonLink variant="secondary" to={PAIRING_PATH}>Digitar o código</ButtonLink>
            </div>

            <details className="fx-more">
              <summary>Avançado: ligar com chave<small>Só para quem já usa a chave do caixa</small></summary>
              <p className="fx-muted" style={{ marginTop: 12 }}>
                Se o programa já está ligado por chave, não precisa mudar nada. Para gerar ou excluir uma chave, abra{' '}
                <Link to="/app/pdvs?aba=ligar#chave-manual">Caixas e ERP › Ligar um caixa › Avançado</Link>. No programa do caixa, clique
                em "Configurar" e cole a chave no campo "API Key".
              </p>
            </details>

            <details className="fx-more">
              <summary>Detalhes técnicos<small>Para quem cuida da informática da loja</small></summary>
              <div className="settings-stack" style={{ marginTop: 12 }}>
                <div className="settings-line-card"><div><strong>Arquivo</strong></div><strong>{installerInfo.filename}</strong></div>
                {installerInfo.version && <div className="settings-line-card"><div><strong>Versão</strong></div><strong>{installerInfo.version}</strong></div>}
                <div className="settings-line-card"><div><strong>Tamanho</strong></div><strong>{installerInfo.sizeFormatted}</strong></div>
                <div className="settings-line-card"><div><strong>Última atualização</strong></div><strong>{installerInfo.lastModified}</strong></div>
                <div className="settings-line-card"><div><strong>Precisa de</strong></div><strong>Windows 10/11 ou Server 2016+, 100 MB livres, internet e permissão de administrador</strong></div>
                {installerInfo.sha256 && <div className="settings-line-card"><div><strong>Código de verificação do arquivo (SHA-256)</strong></div><span className="code-box" style={{ wordBreak: 'break-all' }}>{installerInfo.sha256}</span></div>}
              </div>
            </details>
          </div>
        ) : null}
      </div>
    </Layout>
  );
};

export default AgentDownload;
