import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import ButtonLink from '../components/common/ButtonLink';
import {
  Check, CheckCircle2, Copy, Download, Monitor, Plus, RefreshCw,
  Shield, Trash2, Wifi, WifiOff, X,
} from 'lucide-react';

/* ── Types ── */
interface PDVItem {
  id: string;
  name: string;
  serialNumber?: string | null;
  createdAt?: string | null;
}

interface AgentKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt?: string | null;
  lastHeartbeatAt?: string | null;
  isActive?: boolean | null;
}

interface InstallerInfo {
  version?: string;
  sizeFormatted?: string;
  lastModified?: string;
  downloadUrl?: string;
}

/* ── Helpers ── */
const fmtDate = (v?: string | null) => {
  if (!v) return '--';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '--' : d.toLocaleString('pt-BR');
};

const isHeartbeatFresh = (at?: string | null) => {
  if (!at) return false;
  return Date.now() - new Date(at).getTime() <= 1000 * 60 * 10;
};

type Tab = 'pdvs' | 'agente' | 'download';

const PDVs: React.FC = () => {
  const { marketId, role } = useAuth();
  const [tab, setTab] = useState<Tab>('pdvs');

  /* ── PDVs state ── */
  const [pdvs, setPdvs] = useState<PDVItem[]>([]);
  const [pdvsLoading, setPdvsLoading] = useState(true);
  const [pdvName, setPdvName] = useState('');
  const [pdvSerial, setPdvSerial] = useState('');
  const [pdvError, setPdvError] = useState<string | null>(null);
  const [pdvSaving, setPdvSaving] = useState(false);

  /* ── Agent keys state ── */
  const [keys, setKeys] = useState<AgentKeyRow[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keysLoaded, setKeysLoaded] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [keysMsg, setKeysMsg] = useState<string | null>(null);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);
  const [markets, setMarkets] = useState<Array<{ id: string; name: string }>>([]);
  const [manualMarketId, setManualMarketId] = useState('');

  /* ── Installer state ── */
  const [installer, setInstaller] = useState<InstallerInfo | null>(null);

  /* ── Clipboard ── */
  const [copied, setCopied] = useState<string | null>(null);
  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(c => c === label ? null : c), 1800);
    } catch { /* silent */ }
  };

  const resolvedMarketId = marketId || manualMarketId;

  const apiBaseUrl = useMemo(() => {
    const configured = (import.meta.env.VITE_API_URL || '/api').trim();
    if (configured.startsWith('http://') || configured.startsWith('https://')) {
      return configured.replace(/\/api\/?$/, '').replace(/\/+$/, '');
    }
    return window.location.origin.replace(/\/+$/, '');
  }, []);

  /* ── Load PDVs ── */
  const loadPdvs = async () => {
    if (!marketId) return;
    setPdvsLoading(true);
    try { setPdvs(await marketService.getPdvs(marketId) || []); setPdvError(null); }
    catch (e: any) { setPdvError(e?.message || 'Erro ao carregar PDVs'); }
    finally { setPdvsLoading(false); }
  };
  useEffect(() => { loadPdvs(); }, [marketId]);

  /* ── Load agent keys ── */
  const loadKeys = async () => {
    if (!resolvedMarketId) { setKeys([]); return; }
    setKeysLoading(true);
    try { setKeys((await api.get('/v1/agent-keys', { params: { marketId: resolvedMarketId } })).data || []); }
    catch { /* silent */ } finally { setKeysLoading(false); setKeysLoaded(true); }
  };
  useEffect(() => { if (tab === 'agente') loadKeys(); }, [tab, resolvedMarketId]);

  /* ── Load installer info ── */
  useEffect(() => {
    api.get('/v1/downloads/agent-installer/info').then(r => setInstaller(r.data || null)).catch(() => {});
  }, []);

  /* ── Load markets (admin without market) ── */
  useEffect(() => {
    if (role !== 'ADMIN' || marketId) return;
    api.get('/v1/markets').then(r => setMarkets(r.data || [])).catch(() => {});
  }, [role, marketId]);

  /* ── PDV create ── */
  const createPdv = async () => {
    if (!marketId || !pdvName.trim()) { setPdvError('Informe o nome do PDV'); return; }
    setPdvSaving(true); setPdvError(null);
    try {
      await marketService.createPdv(marketId, { name: pdvName.trim(), serialNumber: pdvSerial.trim() || undefined });
      setPdvName(''); setPdvSerial('');
      await loadPdvs();
    } catch (e: any) { setPdvError(e?.message || 'Erro ao criar PDV'); }
    finally { setPdvSaving(false); }
  };

  /* ── Key create ── */
  const createKey = async () => {
    if (!resolvedMarketId || !keyName.trim()) { setKeysMsg('Informe um nome para a chave.'); return; }
    try {
      const r = await api.post('/v1/agent-keys', { marketId: resolvedMarketId, name: keyName.trim() });
      setGeneratedKey(r.data.apiKey);
      setKeyName('');
      setKeysMsg('Chave criada. Copie agora — ela só aparece uma vez.');
      await loadKeys();
    } catch (e: any) { setKeysMsg(e?.message || 'Falha ao criar chave.'); }
  };

  /* ── Key revoke ── */
  const revokeKey = async (key: AgentKeyRow) => {
    if (!resolvedMarketId) return;
    if (!window.confirm(`Excluir a chave "${key.name}"? O agente perde acesso imediatamente.`)) return;
    setBusyKeyId(key.id);
    try {
      await api.delete(`/v1/agent-keys/${key.id}`, { params: { marketId: resolvedMarketId } });
      setKeysMsg(`Chave "${key.name}" revogada.`);
      if (generatedKey?.startsWith(key.keyPrefix)) setGeneratedKey(null);
      await loadKeys();
    } catch (e: any) { setKeysMsg(e?.message || 'Falha ao excluir.'); }
    finally { setBusyKeyId(null); }
  };

  const withSerial = useMemo(() => pdvs.filter(p => Boolean(p.serialNumber)).length, [pdvs]);
  const activeKeys = keys.filter(k => k.isActive !== false);
  const freshKeys = keys.filter(k => k.isActive !== false && isHeartbeatFresh(k.lastHeartbeatAt));

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: 'pdvs', label: `PDVs (${pdvs.length})` },
    { key: 'agente', label: `Agente (${activeKeys.length} chave${activeKeys.length !== 1 ? 's' : ''})` },
    { key: 'download', label: 'Download' },
  ];

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>PDVs e agente</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Caixas, chaves do coletor local e instalador
            </p>
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-soft)' }}>
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition"
              style={tab === t.key
                ? { background: 'var(--surface-base)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                : { color: 'var(--text-muted)' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── ABA: PDVs ── */}
        {tab === 'pdvs' && (
          <div className="flex flex-col gap-5">
            {/* Métricas */}
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Total de PDVs', value: pdvs.length, color: 'var(--text-primary)' },
                { label: 'Com serial', value: withSerial, color: 'var(--brand-700)' },
                { label: 'Sem serial', value: pdvs.length - withSerial, color: 'var(--text-muted)' },
              ].map(m => (
                <div key={m.label} className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{m.label}</p>
                  <p className="mt-1 text-2xl font-bold" style={{ color: m.color }}>{m.value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_300px] lg:items-start">
              {/* Lista */}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-soft)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>PDVs cadastrados</p>
                  <button type="button" onClick={loadPdvs} disabled={pdvsLoading}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition hover:opacity-80"
                    style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}>
                    <RefreshCw className={`h-3 w-3 ${pdvsLoading ? 'animate-spin' : ''}`} /> Atualizar
                  </button>
                </div>
                {pdvsLoading ? (
                  <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" /></div>
                ) : pdvs.length === 0 ? (
                  <div className="py-10 text-center">
                    <Monitor className="mx-auto mb-2 h-8 w-8 opacity-20" style={{ color: 'var(--text-muted)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum PDV cadastrado.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}>
                        {['Nome', 'Serial', 'Criado em'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pdvs.map((pdv, i) => (
                        <tr key={pdv.id} style={{ borderBottom: i < pdvs.length - 1 ? '1px solid var(--border-soft)' : undefined }}>
                          <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{pdv.name}</td>
                          <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-soft)' }}>{pdv.serialNumber || '—'}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-soft)' }}>{fmtDate(pdv.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {pdvError && <p className="px-4 pb-3 text-xs text-red-600">{pdvError}</p>}
              </div>

              {/* Formulário novo PDV */}
              <div className="rounded-xl p-4 flex flex-col gap-3" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Cadastrar PDV</p>
                <input
                  placeholder="Nome do PDV (ex: Caixa 1)"
                  value={pdvName} onChange={e => setPdvName(e.target.value)}
                  className="h-9 w-full rounded-lg px-3 text-sm outline-none"
                  style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
                <input
                  placeholder="Número de série (opcional)"
                  value={pdvSerial} onChange={e => setPdvSerial(e.target.value)}
                  className="h-9 w-full rounded-lg px-3 text-sm outline-none"
                  style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
                {pdvError && <p className="text-xs text-red-600">{pdvError}</p>}
                <button type="button" onClick={createPdv} disabled={pdvSaving || !pdvName.trim()}
                  className="flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'var(--brand-500)', color: '#fff' }}>
                  <Plus className="h-4 w-4" /> {pdvSaving ? 'Salvando...' : 'Criar PDV'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── ABA: AGENTE ── */}
        {tab === 'agente' && (
          <div className="flex flex-col gap-5">
            {/* Métricas */}
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Chaves ativas', value: activeKeys.length, color: 'var(--brand-700)' },
                { label: 'Online agora', value: freshKeys.length, color: freshKeys.length > 0 ? '#16a34a' : 'var(--text-muted)' },
                { label: 'Revogadas', value: keys.filter(k => k.isActive === false).length, color: '#dc2626' },
              ].map(m => (
                <div key={m.label} className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{m.label}</p>
                  <p className="mt-1 text-2xl font-bold" style={{ color: m.color }}>{m.value}</p>
                </div>
              ))}
            </div>

            {/* Endpoint info */}
            <div className="rounded-xl p-4 flex flex-col gap-3" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Configuração do agente</p>
              {[
                { label: 'URL da API', value: apiBaseUrl },
                { label: 'ID do mercado', value: resolvedMarketId || '—' },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5"
                  style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}>
                  <div>
                    <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>{row.label}</p>
                    <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-primary)' }}>{row.value}</p>
                  </div>
                  <button type="button" onClick={() => row.value !== '—' && copyText(row.value, row.label)}
                    disabled={row.value === '—'}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition hover:opacity-80 disabled:opacity-30"
                    style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>
                    {copied === row.label ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                    {copied === row.label ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              ))}
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_300px] lg:items-start">
              {/* Lista de chaves */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Chaves de API</p>
                  <button type="button" onClick={loadKeys} disabled={keysLoading}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition hover:opacity-80"
                    style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}>
                    <RefreshCw className={`h-3 w-3 ${keysLoading ? 'animate-spin' : ''}`} /> Atualizar
                  </button>
                </div>
                {keysLoading ? (
                  <div className="flex justify-center py-8"><div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" /></div>
                ) : keys.length === 0 ? (
                  <div className="rounded-xl py-10 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}>
                    <Shield className="mx-auto mb-2 h-8 w-8 opacity-20" style={{ color: 'var(--text-muted)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma chave cadastrada.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {keys.map(key => {
                      const fresh = isHeartbeatFresh(key.lastHeartbeatAt);
                      const revoked = key.isActive === false;
                      return (
                        <div key={key.id} className="rounded-xl p-4" style={{ border: `1px solid ${revoked ? '#fecaca' : 'var(--border-soft)'}`, background: revoked ? '#fff7f7' : 'var(--surface-base)', opacity: revoked ? 0.75 : 1 }}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{key.name}</p>
                                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                                  style={{ background: revoked ? '#fee2e2' : fresh ? '#dcfce7' : 'var(--surface-soft)', color: revoked ? '#b91c1c' : fresh ? '#15803d' : 'var(--text-muted)' }}>
                                  {revoked ? <WifiOff className="h-2.5 w-2.5" /> : fresh ? <Wifi className="h-2.5 w-2.5" /> : <Shield className="h-2.5 w-2.5" />}
                                  {revoked ? 'Revogada' : fresh ? 'Online' : 'Ativa'}
                                </span>
                              </div>
                              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]" style={{ color: 'var(--text-soft)' }}>
                                <span>Prefixo: <span className="font-mono font-semibold">{key.keyPrefix}</span></span>
                                <span>Criada: {fmtDate(key.createdAt)}</span>
                                <span>Último uso: {fmtDate(key.lastUsedAt)}</span>
                                <span>Heartbeat: {fmtDate(key.lastHeartbeatAt)}</span>
                              </div>
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                              <button type="button" onClick={() => copyText(key.keyPrefix, `prefix-${key.id}`)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:opacity-80"
                                style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}
                                title="Copiar prefixo">
                                {copied === `prefix-${key.id}` ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                              </button>
                              {!revoked && (
                                <button type="button" onClick={() => revokeKey(key)} disabled={busyKeyId === key.id}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:opacity-80 disabled:opacity-40"
                                  style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626' }}
                                  title="Revogar chave">
                                  {busyKeyId === key.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Formulário nova chave */}
              <div className="flex flex-col gap-3 rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Nova chave</p>
                {role === 'ADMIN' && !marketId && (
                  <select value={manualMarketId} onChange={e => setManualMarketId(e.target.value)}
                    className="h-9 w-full rounded-lg px-3 text-sm outline-none"
                    style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>
                    <option value="">Selecione o mercado</option>
                    {markets.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
                <input placeholder="Nome da chave (ex: Caixa Loja Centro)"
                  value={keyName} onChange={e => setKeyName(e.target.value)}
                  className="h-9 w-full rounded-lg px-3 text-sm outline-none"
                  style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
                <button type="button" onClick={createKey} disabled={!keyName.trim() || !resolvedMarketId}
                  className="flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'var(--brand-500)', color: '#fff' }}>
                  <Plus className="h-4 w-4" /> Gerar chave
                </button>
                {keysMsg && (
                  <div className="rounded-lg p-3 text-xs" style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}>
                    {keysMsg}
                  </div>
                )}
                {generatedKey && (
                  <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: '#fefce8', border: '1px solid #fde047' }}>
                    <p className="text-xs font-bold" style={{ color: '#713f12' }}>Copie agora — aparece só uma vez</p>
                    <div className="rounded-lg px-3 py-2 font-mono text-[11px] break-all select-all"
                      style={{ background: '#fff', border: '1px solid #fde047', color: '#1e293b' }}>
                      {generatedKey}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => copyText(generatedKey, 'generated')}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition hover:opacity-80"
                        style={{ background: 'var(--brand-500)', color: '#fff' }}>
                        {copied === 'generated' ? <><Check className="h-3 w-3" /> Copiado</> : <><Copy className="h-3 w-3" /> Copiar</>}
                      </button>
                      <button type="button" onClick={() => setGeneratedKey(null)}
                        className="flex items-center justify-center rounded-lg px-2.5 py-1.5 transition hover:opacity-80"
                        style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── ABA: DOWNLOAD ── */}
        {tab === 'download' && (
          <div className="flex flex-col gap-5 max-w-xl">
            <div className="rounded-xl p-5 flex flex-col gap-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--surface-soft)' }}>
                  <Download className="h-6 w-6" style={{ color: 'var(--brand-600)' }} />
                </div>
                <div>
                  <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Agente MercadoFlow</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Coletor local que lê as notas fiscais do PDV e envia dados em tempo real para a plataforma.
                  </p>
                  {installer && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs" style={{ color: 'var(--text-soft)' }}>
                      {installer.version && <span>Versão: <strong>{installer.version}</strong></span>}
                      {installer.sizeFormatted && <span>Tamanho: <strong>{installer.sizeFormatted}</strong></span>}
                      {installer.lastModified && <span>Atualizado em: <strong>{new Date(installer.lastModified).toLocaleDateString('pt-BR')}</strong></span>}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <ButtonLink to="/app/download-agente" variant="primary">
                  <Download className="h-4 w-4" /> Abrir página de download
                </ButtonLink>
              </div>
            </div>

            <div className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Como instalar</p>
              <ol className="flex flex-col gap-1.5 text-sm" style={{ color: 'var(--text-primary)' }}>
                {[
                  'Baixe e execute o instalador no computador do PDV',
                  'Gere uma chave de API na aba Agente',
                  'Configure a URL da API e a chave no agente instalado',
                  'O agente começa a enviar dados automaticamente',
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ background: 'var(--brand-500)', color: '#fff' }}>{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default PDVs;
