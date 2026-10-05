import React, { useCallback, useEffect, useState } from 'react';
import { Database, Factory, MapPin, Receipt, RefreshCw, Save, ShieldCheck, Store } from 'lucide-react';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import { ActionHub, Card, Chip, PageHero, PanelTitle } from '../components/flow/Flow';
import { promptDialog } from '../components/common/Dialogs';
import { dateBr, errorText, industryAdmin, num, type Policy } from '../services/industry.service';

/**
 * Privacidade e dados da indústria: as regras de anonimato (com histórico e
 * confirmação para afrouxar), a localização das lojas que alimenta os
 * agregados e o recálculo.
 */

type Status = Awaited<ReturnType<typeof industryAdmin.dataStatus>>;

const SuperAdminIndustryData: React.FC = () => {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof industryAdmin.policy>>['history']>([]);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [status, setStatus] = useState<Status | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [loc, setLoc] = useState({ neighborhood: '', city: '', cityCode: '', uf: '' });

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([industryAdmin.policy(), industryAdmin.dataStatus()]);
    setPolicy(p.policy);
    setHistory(p.history);
    setDraft({
      minStoresPerCell: String(p.policy.minStoresPerCell), maxStoreShare: String(Math.round(p.policy.maxStoreShare * 100)),
      publishDelayMinutes: String(p.policy.publishDelayMinutes), categoryMinBrands: String(p.policy.categoryMinBrands),
      categoryMaxBrandShare: String(Math.round(p.policy.categoryMaxBrandShare * 100)), maxQueriesPerDay: String(p.policy.maxQueriesPerDay),
      secondarySuppression: p.policy.secondarySuppression, neighborhoodEnabled: p.policy.neighborhoodEnabled, hourlyEnabled: p.policy.hourlyEnabled,
    });
    setStatus(s);
  }, []);
  useEffect(() => { load().catch((e) => setMsg(errorText(e))); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = {
      ...draft,
      maxStoreShare: Number(draft.maxStoreShare) / 100,
      categoryMaxBrandShare: Number(draft.categoryMaxBrandShare) / 100,
    };
    try {
      await industryAdmin.savePolicy(body);
      setMsg('Regras salvas. Valem a partir do próximo recálculo.');
      await load();
    } catch (err) {
      const text = errorText(err);
      if (/AFROUXAR/.test(text)) {
        const typed = await promptDialog('Esta mudança deixa a proteção mais fraca: fica mais fácil deduzir qual loja vendeu. Digite AFROUXAR para confirmar.', '',
          { inputLabel: 'Confirmação', danger: true, confirmLabel: 'Afrouxar a regra' });
        if (typed !== 'AFROUXAR') return;
        try { await industryAdmin.savePolicy({ ...body, confirm: 'AFROUXAR' }); setMsg('Regras afrouxadas e registradas no histórico.'); await load(); }
        catch (e2) { setMsg(errorText(e2)); }
      } else setMsg(text);
    }
  };

  const rebuild = async (weeks: number, backfill = false) => {
    setBusy(true);
    setMsg(backfill ? 'Agregando o histórico dos produtos novos…' : `Recalculando as últimas ${weeks} semanas…`);
    try {
      const r = await industryAdmin.rebuild(weeks, backfill);
      setMsg(`Pronto em ${(r.millis / 1000).toFixed(1)} s: ${num(r.published)} células publicadas e ${num(r.suppressed)} ocultas, ${r.gtins} produtos, ${r.stores} lojas.`);
      await load();
    } catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  };

  const saveLocation = async (marketId: string) => {
    try { await industryAdmin.setLocation(marketId, loc); setEditing(null); await load(); } catch (e) { setMsg(errorText(e)); }
  };
  const fromCnpj = async (marketId: string) => {
    try { await industryAdmin.locationFromCnpj(marketId); await load(); setMsg('Endereço preenchido pela Receita.'); } catch (e) { setMsg(errorText(e)); }
  };

  const missing = status?.stores.filter((s) => !s.city_code) ?? [];
  const num$ = (k: string, label: string, hint: string, min: number, max: number) => (
    <label className="fx-field">{label}
      <input type="number" min={min} max={max} value={String(draft[k] ?? '')} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
      <span className="fx-field-hint">{hint}</span>
    </label>
  );
  const check = (k: string, label: string) => (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14.5 }}>
      <input type="checkbox" checked={!!draft[k]} onChange={() => setDraft({ ...draft, [k]: !draft[k] })} />{label}
    </label>
  );

  return (
    <SuperAdminLayout>
      <PageHero
        title={status ? <><mark>{status.stores.length - missing.length} de {status.stores.length} lojas</mark> localizadas alimentam os dados da indústria.</> : <>Privacidade e <mark>dados.</mark></>}
        subtitle={policy ? `Cada número publicado soma pelo menos ${policy.minStoresPerCell} lojas, e nenhuma loja passa de ${Math.round(policy.maxStoreShare * 100)}% dele.` : undefined}
        side={<ActionHub icon={ShieldCheck} actions={[
          { label: 'Indústrias', icon: Factory, to: '/super-admin/industria' },
          { label: 'Cobrança', icon: Receipt, to: '/super-admin/industria/cobranca' },
        ]} />} />
      {msg && <Card role="status">{msg}</Card>}

      <div className="fx-split" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <Card as="section" aria-label="Regras de anonimato">
          <PanelTitle icon={ShieldCheck} title="Regras de anonimato" sub={policy ? `Última mudança em ${dateBr(policy.updatedAt)}${policy.updatedBy ? ` por ${policy.updatedBy}` : ''}.` : undefined} />
          {policy && (
            <form onSubmit={save} style={{ display: 'grid', gap: 12, marginTop: 14 }}>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
                {num$('minStoresPerCell', 'Mínimo de lojas por número', 'Menos que isso, o número fica oculto.', 2, 50)}
                {num$('maxStoreShare', 'Participação máxima de uma loja (%)', 'Acima disso, uma loja domina e o número fica oculto.', 30, 95)}
                {num$('publishDelayMinutes', 'Atraso da venda por hora (min)', 'A hora só aparece depois deste tempo.', 30, 1440)}
                {num$('categoryMinBrands', 'Marcas mínimas na categoria', 'Para mostrar a participação na categoria.', 3, 30)}
                {num$('categoryMaxBrandShare', 'Marca dominante na categoria (%)', 'Acima disso, a participação fica oculta.', 30, 90)}
                {num$('maxQueriesPerDay', 'Consultas por dia por indústria', 'Limite contra varredura.', 100, 100000)}
              </div>
              {check('secondarySuppression', 'Proteger o resto da região (supressão secundária no espaço e no tempo)')}
              {check('neighborhoodEnabled', 'Publicar por bairro')}
              {check('hourlyEnabled', 'Publicar venda por hora (só cidade e estado)')}
              <button type="submit" className="fx-btn primary" style={{ justifySelf: 'start' }}><Save aria-hidden="true" />Salvar regras</button>
            </form>
          )}
          {history.length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary>Histórico de mudanças</summary>
              <ul style={{ fontSize: 13, paddingLeft: 18 }}>
                {history.map((h, i) => <li key={i}>{new Date(h.changed_at).toLocaleString('pt-BR')} · {h.changed_by} {h.loosened && <Chip tone="red">afrouxou</Chip>}<br /><code style={{ fontSize: 12 }}>{h.after}</code></li>)}
              </ul>
            </details>
          )}
        </Card>

        <Card as="section" aria-label="Agregados">
          <PanelTitle icon={Database} title="Agregados" sub="O job recalcula a semana em curso a cada hora e as últimas 6 semanas de madrugada." />
          {status && (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 12 }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--fx-muted)' }}><th scope="col">Período</th><th scope="col" style={{ textAlign: 'right' }}>Publicadas</th><th scope="col" style={{ textAlign: 'right' }}>Ocultas</th></tr></thead>
                <tbody>{status.cells.map((c) => <tr key={c.grain} style={{ borderTop: '1px solid var(--fx-line)' }}><td style={{ padding: '6px 0' }}>{c.grain}</td><td style={{ textAlign: 'right' }}>{num(c.published)}</td><td style={{ textAlign: 'right' }}>{num(c.suppressed)}</td></tr>)}</tbody>
              </table>
              <p className="fx-muted" style={{ fontSize: 13.5 }}>{status.pendingBackfill > 0 ? `${status.pendingBackfill} produtos novos esperam o histórico.` : 'Nenhum produto esperando histórico.'}</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="fx-btn primary small" disabled={busy} onClick={() => rebuild(2)}><RefreshCw aria-hidden="true" />Recalcular 2 semanas</button>
                <button type="button" className="fx-btn ghost small" disabled={busy} onClick={() => rebuild(56, true)}><RefreshCw aria-hidden="true" />Histórico dos produtos novos</button>
              </div>
              <h3 style={{ fontSize: 15, margin: '16px 0 6px' }}>Últimos recálculos</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13, display: 'grid', gap: 4 }}>
                {status.runs.map((r) => (
                  <li key={r.id}>{new Date(r.started_at).toLocaleString('pt-BR')} · {dateBr(r.from_day)} a {dateBr(r.to_day)} · {r.error ? <span style={{ color: 'var(--fx-red)' }}>falhou: {r.error}</span>
                    : r.finished_at ? `${num(r.published)} publicadas, ${num(r.suppressed)} ocultas` : 'rodando…'}</li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <Card as="section" aria-label="Lojas">
        <PanelTitle icon={Store} title={missing.length ? `${missing.length} ${missing.length === 1 ? 'loja sem endereço' : 'lojas sem endereço'}` : 'Todas as lojas têm endereço'}
          sub="Sem cidade e bairro a loja não entra nos dados da indústria. O agente preenche sozinho pela NFC-e; aqui dá para buscar pelo CNPJ ou digitar." />
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--fx-muted)' }}><th scope="col">Loja</th><th scope="col">Endereço</th><th scope="col">Participa</th><th scope="col">Última venda</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{status?.stores.map((s) => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--fx-line)' }}>
                <td style={{ padding: '8px 0' }}><b>{s.name}</b><br /><span className="fx-muted">{s.plan_type ?? 'FREE'}{s.cnpj ? ` · ${s.cnpj}` : ''}</span></td>
                <td>{editing === s.id ? (
                  <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(2, minmax(110px, 1fr))' }}>
                    <input className="fx-input" aria-label="Bairro" placeholder="Bairro" value={loc.neighborhood} onChange={(e) => setLoc({ ...loc, neighborhood: e.target.value })} />
                    <input className="fx-input" aria-label="Cidade" placeholder="Cidade" value={loc.city} onChange={(e) => setLoc({ ...loc, city: e.target.value })} />
                    <input className="fx-input" aria-label="Código IBGE do município" placeholder="Código IBGE" value={loc.cityCode} onChange={(e) => setLoc({ ...loc, cityCode: e.target.value })} />
                    <input className="fx-input" aria-label="UF" placeholder="UF" maxLength={2} value={loc.uf} onChange={(e) => setLoc({ ...loc, uf: e.target.value })} />
                  </div>
                ) : s.city_code ? <>{s.neighborhood ? `${s.neighborhood}, ` : ''}{s.city} ({s.uf})<br /><span className="fx-muted" style={{ fontSize: 12 }}>{s.source}</span></>
                  : <Chip tone="amber" icon={MapPin}>sem endereço</Chip>}</td>
                <td>{s.participation === 'SAIU' ? <Chip tone="gray">saiu</Chip> : <Chip tone="green">sim</Chip>}</td>
                <td>{dateBr(s.last_sale)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {editing === s.id ? (
                    <>
                      <button type="button" className="fx-btn primary small" onClick={() => saveLocation(s.id)}>Salvar</button>{' '}
                      <button type="button" className="fx-btn ghost small" onClick={() => setEditing(null)}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      {s.cnpj && <button type="button" className="fx-btn ghost small" onClick={() => fromCnpj(s.id)}>Pelo CNPJ</button>}{' '}
                      <button type="button" className="fx-btn ghost small" onClick={() => { setEditing(s.id); setLoc({ neighborhood: s.neighborhood ?? '', city: s.city ?? '', cityCode: s.city_code ?? '', uf: s.uf ?? '' }); }}>Digitar</button>
                    </>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </SuperAdminLayout>
  );
};

export default SuperAdminIndustryData;
