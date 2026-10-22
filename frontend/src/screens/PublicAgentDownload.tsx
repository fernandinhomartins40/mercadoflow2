import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import ButtonLink from '../components/common/ButtonLink';
import { CONNECT_STEPS, PAIRING_PATH } from '../components/activation/ConnectCashierSteps';

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
            <p className="brand-subtitle">Programa do caixa</p>
          </div>
        </div>
        <nav className="landing-nav">
          <Link to="/">Voltar</Link>
          <ButtonLink variant="secondary" to="/login">Entrar</ButtonLink>
        </nav>
      </header>

      <section className="hero reveal stagger-1">
        <div className="hero-text">
          <span className="eyebrow">Para Windows 10 e 11</span>
          <h1>
            Ligue o caixa ao <span className="accent-text">MercadoFlow</span> em 3 passos.
          </h1>
          <p>
            Instale no computador do caixa, o que emite as notas fiscais. O programa acha as notas sozinho, guarda tudo
            se a internet cair e manda as vendas para o MercadoFlow.
          </p>

          <div className="hero-actions">
            <Button onClick={handleDownload} disabled={downloading || loading || !installerInfo}>
              {downloading ? 'Baixando...' : 'Baixar o programa do caixa'}
            </Button>
            <ButtonLink variant="secondary" to={PAIRING_PATH}>Digitar o código</ButtonLink>
          </div>

          {loading ? (
            <p style={{ color: 'var(--muted)' }}>Carregando informações...</p>
          ) : error ? (
            <p style={{ color: 'var(--danger)' }}>
              {error}{' '}
              <button type="button" onClick={fetchInstallerInfo} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}>Tentar de novo</button>
            </p>
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
                        Código de verificação do arquivo (SHA-256)
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
        <h2>Como ligar o caixa</h2>
        <div className="feature-grid">
          {CONNECT_STEPS.map((step, i) => (
            <div key={step.title} className="feature-card">
              <h3>{i + 1}. {step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
        {/* Caminho antigo por chave: continua valendo, mas fica recolhido. */}
        <details style={{ marginTop: 18 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Avançado: já usa a chave do caixa?</summary>
          <p style={{ color: 'var(--muted)', marginTop: 8 }}>
            No programa do caixa, clique em "Configurar" e cole a chave no campo "API Key". A chave fica no painel, em
            Caixas e ERP › Ligar um caixa › Avançado. Caixas já ligados por chave continuam funcionando.
          </p>
        </details>
      </section>

      <footer className="landing-footer">
        <span>MercadoFlow - Inteligência de Vendas</span>
        <span>contato@mercadoflow.com</span>
      </footer>
    </div>
  );
};

export default PublicAgentDownload;
