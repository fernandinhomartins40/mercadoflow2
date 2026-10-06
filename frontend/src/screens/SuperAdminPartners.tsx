import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, Circle, Copy, KeyRound, Loader2, Plug, Plus } from 'lucide-react';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import { ActionHub, Card, Chip, PageHero, PanelTitle } from '../components/flow/Flow';
import { partnersAdmin, type AdminPartner, type PartnerCredentials } from '../services/integrations.service';
import { apiError } from './copilot/shared';

/**
 * Programa de parceiros: cadastrar o ERP (o segredo aparece uma vez), ver o
 * roteiro de homologação medido no que ele de fato fez na API, homologar,
 * pôr na lista pública ou suspender.
 */

const STATUS_TONE: Record<AdminPartner['status'], 'lime' | 'gray' | 'red'> = { HOMOLOGADO: 'lime', REGISTRADO: 'gray', SUSPENSO: 'red' };
const STATUS_LABEL: Record<AdminPartner['status'], string> = { HOMOLOGADO: 'Homologado', REGISTRADO: 'Em teste', SUSPENSO: 'Suspenso' };

const SuperAdminPartners: React.FC = () => {
  const [rows, setRows] = useState<AdminPartner[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', contactEmail: '', website: '' });
  const [creds, setCreds] = useState<PartnerCredentials | null>(null);

  const load = useCallback(async () => {
    try { setRows(await partnersAdmin.list()); } catch (e) { setError(apiError(e, 'Não foi possível carregar os parceiros.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setError(null);
    try { await fn(); await load(); } catch (e) { setError(apiError(e, 'Não foi possível concluir.')); } finally { setBusy(null); }
  };

  return (
    <SuperAdminLayout>
      <PageHero title={<>ERPs que <mark>trabalham com a gente.</mark></>}
        subtitle="Cada parceiro recebe client_id e segredo; homologa quando passa pelo roteiro na própria API."
        side={<ActionHub icon={Plug} actions={[{ label: 'Documentação pública', icon: BookOpen, to: '/desenvolvedores' }]} />} />

      {error && <p role="alert" className="fx-chip red" style={{ whiteSpace: 'normal', padding: '10px 14px' }}>{error}</p>}

      {creds && (
        <Card style={{ borderColor: 'var(--fx-lime-line)', background: 'var(--fx-lime-soft)' }}>
          <PanelTitle icon={KeyRound} title="Credenciais do parceiro" sub={creds.aviso} />
          <div className="fx-stack" style={{ gap: 8, marginTop: 12, fontFamily: 'ui-monospace, monospace', fontSize: 14, wordBreak: 'break-all' }}>
            <span>client_id: <b>{creds.clientId}</b></span>
            <span>client_secret: <b>{creds.clientSecret}</b></span>
          </div>
          <div className="fx-actions" style={{ marginTop: 12 }}>
            <button type="button" className="fx-btn dark small" onClick={() => { void navigator.clipboard?.writeText(`client_id=${creds.clientId}\nclient_secret=${creds.clientSecret}`); }}>
              <Copy aria-hidden="true" />Copiar
            </button>
            <button type="button" className="fx-btn ghost small" onClick={() => setCreds(null)}>Já guardei</button>
          </div>
        </Card>
      )}

      <Card>
        <PanelTitle icon={Plus} title="Cadastrar ERP" />
        <form style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }} onSubmit={(e) => {
          e.preventDefault();
          void run('create', async () => { setCreds(await partnersAdmin.create(form)); setForm({ name: '', contactEmail: '', website: '' }); });
        }}>
          <label className="fx-field" style={{ flex: '1 1 200px' }}>Nome do ERP<input className="fx-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="fx-field" style={{ flex: '1 1 200px' }}>E-mail técnico<input className="fx-input" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></label>
          <label className="fx-field" style={{ flex: '1 1 200px' }}>Site<input className="fx-input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
          <button type="submit" className="fx-btn dark" disabled={busy === 'create' || !form.name.trim()}>
            {busy === 'create' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}Cadastrar
          </button>
        </form>
      </Card>

      {!rows ? <Card><Loader2 className="animate-spin" aria-label="Carregando" /></Card> : rows.length === 0 ? (
        <Card><p className="fx-muted" style={{ margin: 0 }}>Nenhum ERP cadastrado ainda.</p></Card>
      ) : rows.map((p) => {
        const done = Object.values(p.checklist).filter(Boolean).length;
        const total = Object.keys(p.checklist).length;
        return (
          <Card key={p.id}>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: 18 }}>{p.name}</h3>
                  <Chip tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Chip>
                  {p.publicListing && <Chip tone="green">Na lista pública</Chip>}
                </div>
                <p className="fx-muted" style={{ margin: '4px 0 0', fontSize: 13.5 }}>
                  {p.clientId} · {p.markets} {p.markets === 1 ? 'loja' : 'lojas'} · última chamada {p.lastCallAt ? new Date(p.lastCallAt).toLocaleString('pt-BR') : 'nunca'}
                  {p.contactEmail ? ` · ${p.contactEmail}` : ''}{p.webhook ? ' · avisos ligados' : ''}
                </p>
              </div>
              <div className="fx-actions">
                {p.status !== 'HOMOLOGADO' && (
                  <button type="button" className="fx-btn dark small" disabled={!!busy} onClick={() => run(p.id, () => partnersAdmin.status(p.id, 'HOMOLOGADO', true))}>
                    <CheckCircle2 aria-hidden="true" />Homologar
                  </button>
                )}
                {p.status === 'HOMOLOGADO' && (
                  <button type="button" className="fx-btn ghost small" disabled={!!busy} onClick={() => run(p.id, () => partnersAdmin.status(p.id, 'HOMOLOGADO', !p.publicListing))}>
                    {p.publicListing ? 'Tirar da lista' : 'Pôr na lista pública'}
                  </button>
                )}
                {p.status !== 'SUSPENSO' ? (
                  <button type="button" className="fx-btn ghost small" disabled={!!busy} onClick={() => { if (window.confirm(`Suspender ${p.name}? Os tokens deixam de valer na hora.`)) void run(p.id, () => partnersAdmin.status(p.id, 'SUSPENSO')); }}>Suspender</button>
                ) : (
                  <button type="button" className="fx-btn ghost small" disabled={!!busy} onClick={() => run(p.id, () => partnersAdmin.status(p.id, 'REGISTRADO'))}>Reativar</button>
                )}
                <button type="button" className="fx-btn ghost small" disabled={!!busy} onClick={() => { if (window.confirm('Gerar segredo novo? O atual para de funcionar.')) void run(p.id, async () => setCreds(await partnersAdmin.rotate(p.id))); }}>
                  <KeyRound aria-hidden="true" />Novo segredo
                </button>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <b style={{ fontSize: 14 }}>Roteiro de homologação: {done} de {total}</b>
              <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6 }}>
                {Object.entries(p.checklist).map(([k, ok]) => (
                  <li key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: ok ? 'var(--fx-ink)' : 'var(--fx-muted)' }}>
                    {ok ? <CheckCircle2 size={16} style={{ color: 'var(--fx-green)' }} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}{k}
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        );
      })}
    </SuperAdminLayout>
  );
};

export default SuperAdminPartners;
