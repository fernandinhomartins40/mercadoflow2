import React, { useEffect, useState } from 'react';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import Button from '../components/common/Button';
import api from '../services/api';

interface CrawlerSource {
  id?: string;
  name: string;
  provider: string;
  sourceLicense?: string;
  seeds: string[];
  allowedDomains: string[];
  productPathHints: string[];
  maxPages: number;
  maxRecords: number;
  rateLimitMs: number;
  requestTimeoutSec: number;
  enabled: boolean;
}

interface CrawlerConfig {
  userAgent: string;
  intervalMinutes: number;
  enabled: boolean;
  sources: CrawlerSource[];
}

const DEFAULT_SOURCE: CrawlerSource = {
  name: '',
  provider: '',
  sourceLicense: 'Public website data (respect provider terms and robots)',
  seeds: [''],
  allowedDomains: [''],
  productPathHints: ['/produto', '/product', '/p/', '/sitemap'],
  maxPages: 250,
  maxRecords: 2500,
  rateLimitMs: 1000,
  requestTimeoutSec: 20,
  enabled: true,
};

const SuperAdminCrawlerConfig: React.FC = () => {
  const [config, setConfig] = useState<CrawlerConfig>({
    userAgent: 'MercadoFlowCatalogBot/1.0 (+https://mercadoflow.com/catalog-bot)',
    intervalMinutes: 360,
    enabled: true,
    sources: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await api.get('/v1/super-admin/catalog/crawler/config');
      setConfig(response.data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar configuracao do crawler');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    setSuccess(null);
    try {
      await api.put('/v1/super-admin/catalog/crawler/config', config);
      setSuccess('Configuracao salva com sucesso');
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Falha ao salvar configuracao');
    } finally {
      setSaving(false);
    }
  };

  const updateSource = (index: number, partial: Partial<CrawlerSource>) => {
    const next = [...config.sources];
    next[index] = { ...next[index], ...partial };
    setConfig({ ...config, sources: next });
  };

  const removeSource = (index: number) => {
    const next = config.sources.filter((_, idx) => idx !== index);
    setConfig({ ...config, sources: next });
  };

  const updateStringList = (sourceIndex: number, field: 'seeds' | 'allowedDomains' | 'productPathHints', value: string) => {
    const items = value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    updateSource(sourceIndex, { [field]: items } as Partial<CrawlerSource>);
  };

  return (
    <SuperAdminLayout>
      <div className="super-admin-page">
        <section className="analytics-hero compact reveal">
          <div className="analytics-hero-copy">
            <span className="pill">Crawler Python</span>
            <h1 className="analytics-hero-title">Configuracao das fontes web</h1>
            <p className="analytics-hero-text">
              Defina quais mercados, links e regras de coleta o job automatico deve seguir para atualizar o catalogo global.
            </p>
          </div>
        </section>

        {error ? <div className="card" style={{ color: 'var(--danger)' }}>{error}</div> : null}
        {success ? <div className="card" style={{ color: 'var(--success)' }}>{success}</div> : null}

        {loading ? (
          <div className="card">Carregando configuracao...</div>
        ) : (
          <>
            <section className="analytics-panel reveal">
              <div className="analytics-panel-head">
                <div>
                  <span className="section-kicker">Parametros globais</span>
                  <h3>Execucao automatica</h3>
                </div>
              </div>
              <div className="filter-bar-controls super-admin-form-grid">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  />
                  <span>Crawler habilitado</span>
                </label>
                <input
                  className="input"
                  placeholder="User agent"
                  value={config.userAgent}
                  onChange={(e) => setConfig({ ...config, userAgent: e.target.value })}
                />
                <input
                  className="input"
                  type="number"
                  min={5}
                  placeholder="Intervalo em minutos"
                  value={config.intervalMinutes}
                  onChange={(e) => setConfig({ ...config, intervalMinutes: Number(e.target.value) || 360 })}
                />
              </div>
            </section>

            <section className="analytics-panel reveal">
              <div className="analytics-panel-head">
                <div>
                  <span className="section-kicker">Fontes</span>
                  <h3>Mercados e links monitorados</h3>
                </div>
                <Button variant="secondary" onClick={() => setConfig({ ...config, sources: [...config.sources, { ...DEFAULT_SOURCE }] })}>
                  Adicionar fonte
                </Button>
              </div>

              <div className="super-admin-source-list">
                {config.sources.map((source, index) => (
                  <div className="card super-admin-source-card" key={`${source.provider}-${index}`}>
                    <div className="super-admin-source-head">
                      <strong>Fonte {index + 1}</strong>
                      <Button variant="secondary" onClick={() => removeSource(index)}>Remover</Button>
                    </div>
                    <div className="filter-bar-controls super-admin-form-grid">
                      <input className="input" placeholder="Nome" value={source.name} onChange={(e) => updateSource(index, { name: e.target.value })} />
                      <input className="input" placeholder="Provider (unico)" value={source.provider} onChange={(e) => updateSource(index, { provider: e.target.value })} />
                      <input className="input" placeholder="Licenca da fonte" value={source.sourceLicense || ''} onChange={(e) => updateSource(index, { sourceLicense: e.target.value })} />
                      <textarea
                        className="input"
                        rows={4}
                        placeholder="Seeds (1 URL por linha)"
                        value={source.seeds.join('\n')}
                        onChange={(e) => updateStringList(index, 'seeds', e.target.value)}
                      />
                      <textarea
                        className="input"
                        rows={4}
                        placeholder="Dominios permitidos (1 por linha)"
                        value={source.allowedDomains.join('\n')}
                        onChange={(e) => updateStringList(index, 'allowedDomains', e.target.value)}
                      />
                      <textarea
                        className="input"
                        rows={4}
                        placeholder="Hints de caminho (1 por linha)"
                        value={(source.productPathHints || []).join('\n')}
                        onChange={(e) => updateStringList(index, 'productPathHints', e.target.value)}
                      />
                      <input className="input" type="number" min={1} value={source.maxPages} onChange={(e) => updateSource(index, { maxPages: Number(e.target.value) || 250 })} />
                      <input className="input" type="number" min={1} value={source.maxRecords} onChange={(e) => updateSource(index, { maxRecords: Number(e.target.value) || 2500 })} />
                      <input className="input" type="number" min={100} value={source.rateLimitMs} onChange={(e) => updateSource(index, { rateLimitMs: Number(e.target.value) || 1000 })} />
                      <input className="input" type="number" min={5} value={source.requestTimeoutSec} onChange={(e) => updateSource(index, { requestTimeoutSec: Number(e.target.value) || 20 })} />
                      <label className="checkbox">
                        <input type="checkbox" checked={source.enabled} onChange={(e) => updateSource(index, { enabled: e.target.checked })} />
                        <span>Fonte habilitada</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="super-admin-actions">
              <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar configuracao do crawler'}</Button>
            </div>
          </>
        )}
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminCrawlerConfig;
