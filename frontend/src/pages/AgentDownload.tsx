import React, { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import Card from '../components/common/Card';
import Button from '../components/common/Button';

interface InstallerInfo {
  filename: string;
  size: number;
  sizeFormatted: string;
  lastModified: string;
  lastModifiedTimestamp: number;
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
      <div className="page">
        <div className="page-header">
          <div>
            <span className="pill">Agente desktop</span>
            <h1 className="page-title">Download do agente PDV2Cloud</h1>
            <p className="page-subtitle">
              Baixe e instale o agente para coletar dados automaticamente do seu PDV e manter o painel atualizado.
            </p>
          </div>
          <div className="page-actions">
            <Button variant="secondary" onClick={fetchInstallerInfo} disabled={loading}>
              Atualizar status
            </Button>
          </div>
        </div>

        <div className="page-grid">
          <Card>
            <div className="page">
              <div>
                <h2 style={{ marginTop: 0 }}>PDV2Cloud Agent</h2>
                <p style={{ color: 'var(--muted)', marginTop: 6 }}>
                  Instalador oficial com atualização automática e logs locais de saúde.
                </p>
              </div>

              {loading ? (
                <div className="card soft">
                  <strong>Carregando informações...</strong>
                  <p style={{ color: 'var(--muted)', marginTop: 6 }}>
                    Verificando a versão mais recente do instalador.
                  </p>
                </div>
              ) : error ? (
                <div className="card soft">
                  <strong>Instalador indisponível</strong>
                  <p style={{ color: 'var(--muted)', marginTop: 6 }}>{error}</p>
                  <div className="page-actions" style={{ marginTop: 12 }}>
                    <Button variant="secondary" onClick={fetchInstallerInfo}>
                      Tentar novamente
                    </Button>
                  </div>
                </div>
              ) : installerInfo ? (
                <>
                  <div className="page-actions">
                    <Button onClick={handleDownload} disabled={downloading}>
                      {downloading ? 'Baixando...' : 'Baixar instalador'}
                    </Button>
                    <Button variant="secondary" onClick={fetchInstallerInfo}>
                      Verificar atualização
                    </Button>
                  </div>

                  <div className="card soft">
                    <div className="info-table">
                      <div className="info-row">
                        <span>Arquivo</span>
                        <strong>{installerInfo.filename}</strong>
                      </div>
                      <div className="info-row">
                        <span>Tamanho</span>
                        <strong>{installerInfo.sizeFormatted}</strong>
                      </div>
                      <div className="info-row">
                        <span>Última atualização</span>
                        <strong>{installerInfo.lastModified}</strong>
                      </div>
                    </div>
                    {installerInfo.sha256 && (
                      <div style={{ marginTop: 12 }}>
                        <span style={{ color: 'var(--muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          SHA256
                        </span>
                        <div className="code-box" style={{ marginTop: 6 }}>
                          {installerInfo.sha256}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </Card>

          <div className="page">
            <Card>
              <h3 style={{ marginTop: 0 }}>Instruções de instalação</h3>
              <div className="list">
                <div className="list-item">
                  <div className="list-index">1</div>
                  <div>
                    <strong>Baixe o instalador</strong>
                    <p style={{ color: 'var(--muted)', margin: '6px 0 0' }}>
                      Clique no botão de download e salve o arquivo no servidor local.
                    </p>
                  </div>
                </div>
                <div className="list-item">
                  <div className="list-index">2</div>
                  <div>
                    <strong>Execute como administrador</strong>
                    <p style={{ color: 'var(--muted)', margin: '6px 0 0' }}>
                      Garanta permissões de gravação para monitorar pastas e serviços.
                    </p>
                  </div>
                </div>
                <div className="list-item">
                  <div className="list-index">3</div>
                  <div>
                    <strong>Informe a chave da API</strong>
                    <p style={{ color: 'var(--muted)', margin: '6px 0 0' }}>
                      Use a chave gerada em Configurações para vincular o supermercado.
                    </p>
                  </div>
                </div>
                <div className="list-item">
                  <div className="list-index">4</div>
                  <div>
                    <strong>Valide o monitoramento</strong>
                    <p style={{ color: 'var(--muted)', margin: '6px 0 0' }}>
                      Confira o status de sincronização e o envio dos XMLs.
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <h3 style={{ marginTop: 0 }}>Requisitos do sistema</h3>
              <div className="list">
                <div className="list-item">
                  <div className="list-index">✓</div>
                  <div>Windows 10/11 ou Windows Server 2016+</div>
                </div>
                <div className="list-item">
                  <div className="list-index">✓</div>
                  <div>100 MB de espaço em disco</div>
                </div>
                <div className="list-item">
                  <div className="list-index">✓</div>
                  <div>Conexão estável com a internet</div>
                </div>
                <div className="list-item">
                  <div className="list-index">✓</div>
                  <div>Permissões de administrador</div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <Card>
          <h3 style={{ marginTop: 0 }}>O que é o PDV2Cloud Agent?</h3>
          <p style={{ color: 'var(--muted)' }}>
            O agente é um serviço Windows que monitora automaticamente as pastas onde o seu sistema de PDV gera
            XMLs de NF-e/NFC-e. Quando novos arquivos são detectados, o agente valida, processa e transmite os dados
            para a nuvem, mantendo o painel do MercadoFlow atualizado em tempo real.
          </p>
          <div className="list" style={{ marginTop: 12 }}>
            <div className="list-item">
              <div className="list-index">✓</div>
              <div>Validação e deduplicação de XMLs</div>
            </div>
            <div className="list-item">
              <div className="list-index">✓</div>
              <div>Transmissão segura com criptografia HTTPS</div>
            </div>
            <div className="list-item">
              <div className="list-index">✓</div>
              <div>Logs locais para auditoria e diagnóstico</div>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default AgentDownload;
