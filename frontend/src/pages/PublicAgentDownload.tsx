import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';

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

const PublicAgentDownload: React.FC = () => {
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
      setInstallerInfo(null);
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
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="landing" style={{ gap: 42 }}>
      <header className="landing-header reveal">
        <div className="brand">
          <span className="brand-mark">MF</span>
          <div>
            <p className="brand-name">MercadoFlow</p>
            <p className="brand-subtitle">Download do coletor PDV2Cloud</p>
          </div>
        </div>
        <nav className="landing-nav">
          <Link to="/">Voltar</Link>
          <Link className="button secondary" to="/login">
            Entrar
          </Link>
        </nav>
      </header>

      <section className="hero reveal stagger-1">
        <div className="hero-text">
          <span className="eyebrow">Agente Windows</span>
          <h1>
            Baixe o instalador do <span className="accent-text">PDV2Cloud Agent</span>.
          </h1>
          <p>
            Instale no servidor/PC que recebe os XMLs do seu PDV. O serviço monitora as pastas, faz fila offline e
            envia os dados para o MercadoFlow com integridade (HMAC) e HTTPS.
          </p>

          <div className="hero-actions">
            <Button onClick={handleDownload} disabled={downloading || loading || !installerInfo}>
              {downloading ? 'Baixando...' : 'Baixar instalador'}
            </Button>
            <Button variant="secondary" onClick={fetchInstallerInfo} disabled={loading}>
              Atualizar status
            </Button>
          </div>

          {loading ? (
            <p style={{ color: 'var(--muted)' }}>Carregando informações...</p>
          ) : error ? (
            <p style={{ color: 'var(--danger)' }}>{error}</p>
          ) : null}
        </div>

        <div className="hero-board">
          <Card>
            <div className="page" style={{ gap: 14 }}>
              <div>
                <span className="pill">Download</span>
                <h2 style={{ marginTop: 10, marginBottom: 6, fontFamily: 'Fraunces, serif' }}>Versão disponível</h2>
                <p style={{ color: 'var(--muted)', margin: 0 }}>
                  Informações do instalador publicado no servidor.
                </p>
              </div>

              {installerInfo ? (
                <div className="card soft" style={{ marginTop: 6 }}>
                  <div className="info-table">
                    <div className="info-row">
                      <span>Arquivo</span>
                      <strong>{installerInfo.filename}</strong>
                    </div>
                    {installerInfo.version && (
                      <div className="info-row">
                        <span>Versão</span>
                        <strong>{installerInfo.version}</strong>
                      </div>
                    )}
                    <div className="info-row">
                      <span>Tamanho</span>
                      <strong>{installerInfo.sizeFormatted}</strong>
                    </div>
                    <div className="info-row">
                      <span>Atualização</span>
                      <strong>{installerInfo.lastModified}</strong>
                    </div>
                  </div>
                  {installerInfo.sha256 && (
                    <div style={{ marginTop: 12 }}>
                      <span
                        style={{
                          color: 'var(--muted)',
                          fontSize: 12,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                        }}
                      >
                        SHA256
                      </span>
                      <div className="code-box" style={{ marginTop: 6 }}>
                        {installerInfo.sha256}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="card soft">
                  <strong>Instalador indisponível</strong>
                  <p style={{ color: 'var(--muted)', marginTop: 6, marginBottom: 0 }}>
                    Se você é do time técnico, envie o novo instalador para o servidor e atualize esta página.
                  </p>
                </div>
              )}
            </div>
          </Card>
          <div className="hero-glow" />
        </div>
      </section>

      <section className="section reveal stagger-2">
        <h2>Como instalar</h2>
        <div className="feature-grid">
          <div className="feature-card">
            <h3>1. Baixe e execute</h3>
            <p>Execute como administrador no Windows 10/11 ou Windows Server.</p>
          </div>
          <div className="feature-card">
            <h3>2. Configure a chave</h3>
            <p>Use a chave gerada no painel (Configurações) para autenticar o agente.</p>
          </div>
          <div className="feature-card">
            <h3>3. Aponte as pastas</h3>
            <p>Selecione as pastas onde o PDV salva os XMLs e valide o healthcheck.</p>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <span>MercadoFlow - PDV2Cloud Suite</span>
        <span>contato@mercadoflow.com</span>
      </footer>
    </div>
  );
};

export default PublicAgentDownload;

