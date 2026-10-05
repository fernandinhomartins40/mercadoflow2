import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban, Building2, CheckCircle2, ClipboardList, Eye, Factory, FileSignature, History, Package, Play, Plus, Receipt, Save, ShieldCheck,
  UserPlus, XCircle,
} from 'lucide-react';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import { ActionHub, Card, Chip, Forest, PageHero, PanelTitle, PillTabs, brl } from '../components/flow/Flow';
import { confirmDialog, promptDialog } from '../components/common/Dialogs';
import {
  FEATURE_LABEL, cents, dateBr, errorText, industryAdmin, num, pct,
  type AdminPortfolioItem, type Contract, type Feature, type IndustryDetail, type IndustryRow, type MapResult, type Overview, type Plan,
} from '../services/industry.service';

/**
 * MercadoFlow Indústria no superadmin: quem entra, quais produtos cada
 * indústria pode ver (com a prova de que são dela), o contrato, a prévia do que
 * ela verá e o registro de cada consulta.
 */

const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'gray'> = { ATIVA: 'green', EM_ANALISE: 'amber', SUSPENSA: 'red', ENCERRADA: 'gray' };
const STATUS_LABEL: Record<string, string> = { ATIVA: 'Ativa', EM_ANALISE: 'Em análise', SUSPENSA: 'Suspensa', ENCERRADA: 'Encerrada' };
const CONTRACT_LABEL: Record<string, string> = { RASCUNHO: 'Rascunho', ATIVO: 'Ativo', SUSPENSO: 'Suspenso', ENCERRADO: 'Encerrado' };
const COLOR_TONE: Record<string, 'green' | 'amber' | 'red'> = { VERDE: 'green', AMARELO: 'amber', VERMELHO: 'red' };
const REASON_LABEL: Record<string, string> = {
  PUBLICADA: 'Publicadas', POUCAS_LOJAS: 'Poucas lojas', DOMINANCIA: 'Uma loja domina', SECUNDARIA: 'Proteção do resto da região',
  TEMPORAL: 'Proteção entre períodos', PAI_OCULTO: 'Região maior oculta', DESLIGADO: 'Bairro desligado',
};

type Tab = 'empresa' | 'carteira' | 'contratos' | 'previa' | 'auditoria';

const field = (label: string, input: React.ReactNode, hint?: string) => (
  <label className="fx-field">{label}{input}{hint && <span className="fx-field-hint">{hint}</span>}</label>
);

const SuperAdminIndustries: React.FC = () => {
  const [rows, setRows] = useState<IndustryRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<IndustryDetail | null>(null);
  const [tab, setTab] = useState<Tab>('empresa');
  const [creating, setCreating] = useState(false);
  const [mrr, setMrr] = useState<number | null>(null);
  const [previewContract, setPreviewContract] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const list = await industryAdmin.list();
    setRows(list);
    setSelected((s) => s ?? list[0]?.id ?? null);
  }, []);
  const loadDetail = useCallback(async () => {
    if (!selected) return;
    setDetail(await industryAdmin.get(selected));
  }, [selected]);

  useEffect(() => { loadList(); industryAdmin.revenue().then((r) => setMrr(r.monthlyRecurringCents)).catch(() => {}); }, [loadList]);
  useEffect(() => { setDetail(null); loadDetail(); }, [loadDetail]);

  const refresh = async () => { await Promise.all([loadList(), loadDetail()]); };
  const active = rows?.filter((r) => r.contract_status === 'ATIVO').length ?? 0;
  const pendingTotal = rows?.reduce((s, r) => s + Number(r.pending), 0) ?? 0;

  return (
    <SuperAdminLayout>
      <PageHero
        title={<><mark>{rows?.length ?? 0} {rows?.length === 1 ? 'indústria' : 'indústrias'}</mark>, {active} com contrato ativo{mrr != null ? `, ${cents(mrr)} por mês.` : '.'}</>}
        subtitle={pendingTotal > 0 ? `${pendingTotal} ${pendingTotal === 1 ? 'produto espera' : 'produtos esperam'} a análise da carteira.` : 'Nenhum produto esperando análise.'}
        side={<ActionHub icon={Factory} actions={[
          { label: 'Nova indústria', icon: Plus, onClick: () => { setCreating(true); setSelected(null); } },
          { label: 'Privacidade e dados', icon: ShieldCheck, to: '/super-admin/industria/dados' },
          { label: 'Cobrança', icon: Receipt, to: '/super-admin/industria/cobranca' },
        ]} />} />

      <div className="fx-split">
        <Card aria-label="Indústrias">
          <PanelTitle icon={Factory} title="Indústrias" sub="Cadastros em análise aparecem primeiro" />
          {!rows ? <p className="fx-muted" style={{ marginTop: 12 }}>Carregando…</p> : rows.length === 0 ? (
            <p className="fx-muted" style={{ marginTop: 12 }}>Nenhuma indústria ainda. Use "Nova indústria".</p>
          ) : (
            <ul className="fx-stack" style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, gap: 8 }}>
              {rows.map((r) => (
                <li key={r.id}>
                  <button type="button" className={`fx-row ${r.id === selected ? 'selected' : ''}`} aria-current={r.id === selected || undefined}
                    onClick={() => { setSelected(r.id); setCreating(false); setTab('empresa'); }}>
                    <span className="fx-icon-tile" style={{ width: 42, height: 42 }}><Factory size={19} aria-hidden="true" /></span>
                    <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                      <b style={{ display: 'block', fontSize: 15 }}>{r.trade_name || r.legal_name}</b>
                      <span className="fx-muted" style={{ fontSize: 13 }}>
                        {r.approved} {Number(r.approved) === 1 ? 'liberado' : 'liberados'}{Number(r.pending) > 0 ? ` · ${r.pending} em análise` : ''}{r.plan ? ` · ${r.plan.toLowerCase()}` : ''}
                      </span>
                    </span>
                    <Chip tone={STATUS_TONE[r.status] ?? 'gray'}>{STATUS_LABEL[r.status] ?? r.status}</Chip>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {creating && <NewIndustry onDone={async (id) => { setCreating(false); await loadList(); if (id) setSelected(id); }} />}
          {!creating && detail && (
            <>
              <IndustryHeader d={detail} onChanged={refresh} />
              <PillTabs<Tab> label="Partes do cadastro" value={tab} onChange={setTab} tabs={[
                { key: 'empresa', label: 'Empresa', icon: Building2 },
                { key: 'carteira', label: 'Carteira', icon: Package, count: detail.portfolioSummary.filter((s) => s.status === 'PEDIDO').reduce((a, s) => a + Number(s.n), 0) },
                { key: 'contratos', label: 'Contratos', icon: FileSignature },
                { key: 'previa', label: 'Prévia', icon: Eye },
                { key: 'auditoria', label: 'Auditoria', icon: History },
              ]} />
              {tab === 'empresa' && <CompanyTab d={detail} onSaved={(d) => { setDetail(d); loadList(); }} />}
              {tab === 'carteira' && <PortfolioTab d={detail} onChanged={refresh} />}
              {tab === 'contratos' && <ContractsTab d={detail} onChanged={refresh} onPreview={(cid) => { setPreviewContract(cid); setTab('previa'); }} />}
              {tab === 'previa' && <PreviewTab d={detail} contractId={previewContract} onChanged={refresh} />}
              {tab === 'auditoria' && <AuditTab d={detail} />}
            </>
          )}
          {!creating && !detail && selected && <p className="fx-muted">Carregando…</p>}
        </div>
      </div>
    </SuperAdminLayout>
  );
};

// ── Cabeçalho: situação e o botão de emergência ───────────────────────────

const IndustryHeader: React.FC<{ d: IndustryDetail; onChanged: () => Promise<void> }> = ({ d, onChanged }) => {
  const [msg, setMsg] = useState<string | null>(null);
  const contract = d.contracts.find((c) => c.status === 'ATIVO' || c.status === 'SUSPENSO');
  const setStatus = async (status: string, ask?: string) => {
    let reason: string | null | undefined;
    if (ask) {
      reason = await promptDialog(ask, '', { inputLabel: 'Motivo', confirmLabel: status === 'SUSPENSA' ? 'Suspender agora' : 'Encerrar', danger: true });
      if (!reason) return;
    }
    try {
      await industryAdmin.status(d.id, status, reason ?? undefined);
      setMsg(null);
      await onChanged();
    } catch (e) { setMsg(errorText(e)); }
  };
  return (
    <Forest as="section" aria-label="Situação da indústria">
      <PanelTitle icon={Factory} title={d.trade_name || d.legal_name}
        sub={`${d.legal_name} · CNPJ ${d.cnpj}${contract ? ` · contrato ${contract.number} (${CONTRACT_LABEL[contract.status]})` : ' · sem contrato vigente'}`}
        right={<Chip tone={STATUS_TONE[d.status] ?? 'gray'}>{STATUS_LABEL[d.status] ?? d.status}</Chip>} />
      {d.status_reason && <p style={{ margin: '10px 0 0', opacity: 0.85 }}>Motivo: {d.status_reason}</p>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        {d.status !== 'ATIVA' && <button type="button" className="fx-btn lime small" onClick={() => setStatus('ATIVA')}><CheckCircle2 aria-hidden="true" />{d.status === 'EM_ANALISE' ? 'Aprovar cadastro' : 'Reativar'}</button>}
        {d.status === 'ATIVA' && <button type="button" className="fx-btn ghost small" onClick={() => setStatus('SUSPENSA', 'Suspender o acesso da indústria agora? Ela perde o acesso aos dados na hora.')}><Ban aria-hidden="true" />Suspender acesso</button>}
        {d.status !== 'ENCERRADA' && <button type="button" className="fx-btn ghost small" onClick={() => setStatus('ENCERRADA', 'Encerrar o cadastro desta indústria?')}><XCircle aria-hidden="true" />Encerrar cadastro</button>}
      </div>
      {msg && <p role="alert" style={{ marginTop: 10 }}>{msg}</p>}
    </Forest>
  );
};

// ── Nova indústria e dados da empresa ─────────────────────────────────────

const emptyCompany = { cnpj: '', legalName: '', tradeName: '', gs1Prefixes: '', brands: '', contactName: '', contactEmail: '', contactPhone: '', notes: '' };

const CompanyFields: React.FC<{ v: typeof emptyCompany; set: (v: typeof emptyCompany) => void; withCnpj: boolean }> = ({ v, set, withCnpj }) => (
  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 14 }}>
    {withCnpj && field('CNPJ', <input value={v.cnpj} onChange={(e) => set({ ...v, cnpj: e.target.value })} inputMode="numeric" required />)}
    {field('Razão social', <input value={v.legalName} onChange={(e) => set({ ...v, legalName: e.target.value })} required />)}
    {field('Nome fantasia', <input value={v.tradeName} onChange={(e) => set({ ...v, tradeName: e.target.value })} />)}
    {field('Prefixos GS1', <input value={v.gs1Prefixes} onChange={(e) => set({ ...v, gs1Prefixes: e.target.value })} placeholder="7891234, 7891235" />, 'Do certificado GS1 da empresa; decide o que é verde na carteira.')}
    {field('Marcas', <input value={v.brands} onChange={(e) => set({ ...v, brands: e.target.value })} placeholder="ACME, ACME KIDS" />)}
    {field('Contato', <input value={v.contactName} onChange={(e) => set({ ...v, contactName: e.target.value })} />)}
    {field('E-mail de cobrança', <input type="email" value={v.contactEmail} onChange={(e) => set({ ...v, contactEmail: e.target.value })} />)}
    {field('Telefone', <input value={v.contactPhone} onChange={(e) => set({ ...v, contactPhone: e.target.value })} />)}
  </div>
);

const toBody = (v: typeof emptyCompany) => ({ ...v, gs1Prefixes: v.gs1Prefixes, brands: v.brands });

const NewIndustry: React.FC<{ onDone: (id?: string) => void }> = ({ onDone }) => {
  const [v, setV] = useState(emptyCompany);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await industryAdmin.create(toBody(v));
      onDone(d.id);
    } catch (err) { setMsg(errorText(err)); } finally { setBusy(false); }
  };
  return (
    <Card as="section" aria-label="Nova indústria">
      <PanelTitle icon={Plus} title="Nova indústria" sub="O cadastro nasce em análise: aprove depois de conferir o CNPJ e o contato." />
      <form onSubmit={submit}>
        <CompanyFields v={v} set={setV} withCnpj />
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button type="submit" className="fx-btn primary" disabled={busy}><Save aria-hidden="true" />Cadastrar</button>
          <button type="button" className="fx-btn ghost" onClick={() => onDone()}>Cancelar</button>
        </div>
        {msg && <p role="alert">{msg}</p>}
      </form>
    </Card>
  );
};

const CompanyTab: React.FC<{ d: IndustryDetail; onSaved: (d: IndustryDetail) => void }> = ({ d, onSaved }) => {
  const [v, setV] = useState({ ...emptyCompany, legalName: d.legal_name, tradeName: d.trade_name ?? '', gs1Prefixes: d.gs1_prefixes.join(', '),
    brands: d.brands.join(', '), contactName: d.contact_name ?? '', contactEmail: d.contact_email ?? '', contactPhone: d.contact_phone ?? '', notes: d.notes ?? '' });
  const [user, setUser] = useState({ email: '', name: '', password: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try { onSaved(await industryAdmin.update(d.id, toBody(v))); setMsg('Dados salvos.'); } catch (err) { setMsg(errorText(err)); }
  };
  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try { onSaved(await industryAdmin.createUser(d.id, user)); setUser({ email: '', name: '', password: '' }); setMsg('Acesso criado. Envie a senha provisória por um canal seguro.'); }
    catch (err) { setMsg(errorText(err)); }
  };
  return (
    <>
      <Card as="section" aria-label="Dados da empresa">
        <PanelTitle icon={Building2} title="Dados da empresa" />
        <form onSubmit={save}>
          <CompanyFields v={v} set={setV} withCnpj={false} />
          {field('Observações internas', <textarea className="fx-input" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />)}
          <button type="submit" className="fx-btn primary" style={{ marginTop: 14 }}><Save aria-hidden="true" />Salvar</button>
        </form>
      </Card>
      <Card as="section" aria-label="Acessos">
        <PanelTitle icon={UserPlus} title="Acessos ao portal" sub="Quem da indústria entra em industria.mercadoflow.com" />
        <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 6 }}>
          {d.users.length === 0 && <li className="fx-muted">Nenhum acesso ainda.</li>}
          {d.users.map((u) => (
            <li key={u.id} style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--fx-line)' }}>
              <span><b>{u.name}</b> <span className="fx-muted">{u.email} · último acesso {dateBr(u.last_login_at)}</span></span>
              <button type="button" className="fx-btn ghost small" onClick={async () => onSaved(await industryAdmin.userActive(d.id, u.id, !u.is_active))}>
                {u.is_active ? 'Bloquear' : 'Liberar'}
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={addUser} style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: 14, alignItems: 'end' }}>
          {field('Nome', <input value={user.name} onChange={(e) => setUser({ ...user, name: e.target.value })} required />)}
          {field('E-mail', <input type="email" value={user.email} onChange={(e) => setUser({ ...user, email: e.target.value })} required />)}
          {field('Senha provisória', <input value={user.password} onChange={(e) => setUser({ ...user, password: e.target.value })} minLength={10} required />, 'Pelo menos 10 caracteres.')}
          <button type="submit" className="fx-btn primary"><UserPlus aria-hidden="true" />Criar acesso</button>
        </form>
        {msg && <p role="status" style={{ marginTop: 10 }}>{msg}</p>}
      </Card>
    </>
  );
};

// ── Carteira ──────────────────────────────────────────────────────────────

const PortfolioTab: React.FC<{ d: IndustryDetail; onChanged: () => Promise<void> }> = ({ d, onChanged }) => {
  const [filter, setFilter] = useState<'PEDIDO' | 'APROVADO' | 'TODOS'>('PEDIDO');
  const [items, setItems] = useState<AdminPortfolioItem[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [evidence, setEvidence] = useState({ type: '', ref: '', note: '' });
  const [codes, setCodes] = useState('');
  const [brand, setBrand] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(await industryAdmin.portfolio(d.id, filter === 'TODOS' ? undefined : filter));
    setChecked(new Set());
  }, [d.id, filter]);
  useEffect(() => { load(); }, [load]);

  const pick = (g: string) => setChecked((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const greens = items?.filter((i) => i.status === 'PEDIDO' && i.classification === 'VERDE').map((i) => i.gtin) ?? [];

  const decide = async (decision: string, gtins = [...checked]) => {
    if (gtins.length === 0) return;
    if (decision === 'REVOGADO' && !(await confirmDialog(`Retirar ${gtins.length} produto(s) da carteira? A indústria deixa de ver os dados na hora.`, { danger: true, confirmLabel: 'Retirar' }))) return;
    try {
      const r = await industryAdmin.decide(d.id, { gtins, decision, evidenceType: evidence.type || undefined, evidenceRef: evidence.ref || undefined, note: evidence.note || undefined });
      setMsg(`${r.done} ${decision === 'APROVADO' ? 'liberado(s)' : decision === 'NEGADO' ? 'negado(s)' : 'retirado(s)'}.${r.errors.length ? ` Não feitos: ${r.errors.join('; ')}` : ''}`);
      await load();
      await onChanged();
    } catch (e) { setMsg(errorText(e)); }
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await industryAdmin.request(d.id, brand.trim() ? { brand } : { gtins: codes.split(/[\s,;]+/).filter(Boolean) });
      setMsg(`${r.received} código(s) na carteira para análise.${r.invalid.length ? ` Não reconhecidos: ${r.invalid.join(', ')}.` : ''}`);
      setCodes(''); setBrand('');
      setFilter('PEDIDO');
      await load();
      await onChanged();
    } catch (err) { setMsg(errorText(err)); }
  };

  return (
    <>
      <Card as="section" aria-label="Carteira de produtos">
        <PanelTitle icon={Package} title="Carteira de produtos"
          sub="Verde: prefixo GS1 da empresa. Amarelo: só a marca confere, exige documento. Vermelho: de outra empresa ou nada confere, só com licença." />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
          <PillTabs label="Filtrar carteira" value={filter} onChange={setFilter} tabs={[{ key: 'PEDIDO', label: 'Em análise' }, { key: 'APROVADO', label: 'Liberados' }, { key: 'TODOS', label: 'Todos' }]} />
          {greens.length > 0 && <button type="button" className="fx-btn lime small" onClick={() => decide('APROVADO', greens)}><CheckCircle2 aria-hidden="true" />Liberar os {greens.length} verdes</button>}
        </div>
        {!items ? <p className="fx-muted">Carregando…</p> : items.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Nada nesta lista.</p> : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--fx-muted)' }}>
                <th scope="col"><span className="sr-only">Escolher</span></th><th scope="col">Produto</th><th scope="col">Conferência</th><th scope="col">Situação</th>
              </tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} style={{ borderTop: '1px solid var(--fx-line)' }}>
                    <td style={{ padding: '8px 6px' }}><input type="checkbox" aria-label={`Escolher ${i.product_name ?? i.gtin}`} checked={checked.has(i.gtin)} onChange={() => pick(i.gtin)} /></td>
                    <td><b>{i.product_name ?? '(sem nome no catálogo)'}</b><br /><span className="fx-muted">{i.gtin}{i.brand ? ` · ${i.brand}` : ''}</span></td>
                    <td><Chip tone={COLOR_TONE[i.classification] ?? 'gray'}>{i.classification?.toLowerCase()}</Chip><br /><small className="fx-muted">{i.classification_reason}</small></td>
                    <td>{i.status.toLowerCase()}{i.evidence_type ? <><br /><small className="fx-muted">{i.evidence_type}{i.evidence_ref ? `: ${i.evidence_ref}` : ''}</small></> : null}
                      {i.owned_by && <><br /><small style={{ color: 'var(--fx-red)' }}>Já é de {i.owned_by}</small></>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: 16, alignItems: 'end' }}>
          {field('Evidência', <select value={evidence.type} onChange={(e) => setEvidence({ ...evidence, type: e.target.value })}>
            <option value="">Prefixo GS1 (verdes)</option><option value="DOCUMENTO">Documento de titularidade</option><option value="LICENCA">Licença do titular</option>
          </select>)}
          {field('Referência do documento', <input value={evidence.ref} onChange={(e) => setEvidence({ ...evidence, ref: e.target.value })} placeholder="Nº, link ou pasta" />)}
          {field('Observação', <input value={evidence.note} onChange={(e) => setEvidence({ ...evidence, note: e.target.value })} />)}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <button type="button" className="fx-btn primary small" disabled={checked.size === 0} onClick={() => decide('APROVADO')}><CheckCircle2 aria-hidden="true" />Liberar {checked.size || ''}</button>
          <button type="button" className="fx-btn ghost small" disabled={checked.size === 0} onClick={() => decide('NEGADO')}><XCircle aria-hidden="true" />Negar</button>
          <button type="button" className="fx-btn ghost small" disabled={checked.size === 0} onClick={() => decide('REVOGADO')}><Ban aria-hidden="true" />Retirar liberados</button>
        </div>
        {msg && <p role="status" style={{ marginTop: 10 }}>{msg}</p>}
      </Card>
      <Card as="section" aria-label="Incluir produtos">
        <PanelTitle icon={Plus} title="Incluir produtos para análise" sub="Por códigos de barras ou por marca do catálogo. Entram como pedido e são conferidos acima." />
        <form onSubmit={add} style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 12, alignItems: 'end' }}>
          {field('Códigos de barras', <textarea className="fx-input" rows={2} value={codes} onChange={(e) => setCodes(e.target.value)} />)}
          {field('Ou a marca inteira', <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="ACME" />)}
          <button type="submit" className="fx-btn primary small" disabled={!codes.trim() && !brand.trim()}><Plus aria-hidden="true" />Incluir</button>
        </form>
      </Card>
    </>
  );
};

// ── Contratos ─────────────────────────────────────────────────────────────

const ContractsTab: React.FC<{ d: IndustryDetail; onChanged: () => Promise<void>; onPreview: (cid: string) => void }> = ({ d, onChanged, onPreview }) => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editing, setEditing] = useState<Contract | 'novo' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { industryAdmin.plans().then(setPlans).catch(() => {}); }, []);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); setMsg(ok); await onChanged(); } catch (e) { setMsg(errorText(e)); }
  };
  const statusChange = async (c: Contract, status: 'SUSPENSO' | 'ENCERRADO') => {
    const reason = await promptDialog(status === 'SUSPENSO' ? `Suspender o contrato ${c.number}?` : `Encerrar o contrato ${c.number}?`, '',
      { inputLabel: 'Motivo', danger: true, confirmLabel: status === 'SUSPENSO' ? 'Suspender' : 'Encerrar' });
    if (reason) await act(() => industryAdmin.contractStatus(c.id, status, reason), status === 'SUSPENSO' ? 'Contrato suspenso.' : 'Contrato encerrado.');
  };

  return (
    <>
      <Card as="section" aria-label="Contratos">
        <PanelTitle icon={FileSignature} title="Contratos" sub="Rascunho → prévia aprovada → contrato assinado registrado → ativo"
          right={<button type="button" className="fx-btn primary small" onClick={() => setEditing('novo')}><Plus aria-hidden="true" />Novo contrato</button>} />
        <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'grid', gap: 10 }}>
          {d.contracts.length === 0 && <li className="fx-muted">Nenhum contrato.</li>}
          {d.contracts.map((c) => (
            <li key={c.id} className="fx-card fx-card-pad" style={{ boxShadow: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span><b>{c.number}</b> · {c.plan.toLowerCase()} · {dateBr(c.starts_on)} a {dateBr(c.ends_on)}</span>
                <Chip tone={c.status === 'ATIVO' ? 'green' : c.status === 'RASCUNHO' ? 'amber' : c.status === 'SUSPENSO' ? 'red' : 'gray'}>{CONTRACT_LABEL[c.status]}</Chip>
              </div>
              <p className="fx-muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
                Área: {c.scope_ufs.length || c.scope_cities.length ? [c.scope_ufs.join(', '), c.scope_cities.length ? `${c.scope_cities.length} cidade(s)` : ''].filter(Boolean).join(' e ') : 'Brasil'}
                {' '}· até {c.gtin_limit} produtos · {cents(c.base_fee_cents)} + {cents(c.price_per_gtin_cents)} por produto{Number(c.discount_pct) > 0 ? ` · ${c.discount_pct}% de desconto` : ''}
                {' '}· {c.features.map((f) => FEATURE_LABEL[f as Feature]).join(', ')}
              </p>
              <p className="fx-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                Prévia: {c.preview_approved_at ? `aprovada em ${dateBr(c.preview_approved_at)} por ${c.preview_approved_by}` : 'não aprovada'} · Contrato assinado: {c.signed_document_ref ?? 'não registrado'}
                {c.status_reason ? ` · Motivo: ${c.status_reason}` : ''}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <button type="button" className="fx-btn ghost small" onClick={() => onPreview(c.id)}><Eye aria-hidden="true" />Ver prévia</button>
                {c.status === 'RASCUNHO' && <button type="button" className="fx-btn ghost small" onClick={() => setEditing(c)}>Editar</button>}
                {(c.status === 'RASCUNHO' || c.status === 'SUSPENSO') && <button type="button" className="fx-btn lime small" onClick={() => act(() => industryAdmin.activate(c.id), 'Contrato ativo. A indústria já vê os dados.')}><Play aria-hidden="true" />Ativar</button>}
                {c.status === 'ATIVO' && <button type="button" className="fx-btn ghost small" onClick={() => statusChange(c, 'SUSPENSO')}><Ban aria-hidden="true" />Suspender</button>}
                {c.status !== 'ENCERRADO' && <button type="button" className="fx-btn ghost small" onClick={() => statusChange(c, 'ENCERRADO')}><XCircle aria-hidden="true" />Encerrar</button>}
              </div>
            </li>
          ))}
        </ul>
        {msg && <p role="status" style={{ marginTop: 10 }}>{msg}</p>}
      </Card>
      {editing && <ContractForm d={d} plans={plans} contract={editing === 'novo' ? null : editing}
        onDone={async (m) => { setEditing(null); if (m) setMsg(m); await onChanged(); }} />}
    </>
  );
};

const ContractForm: React.FC<{ d: IndustryDetail; plans: Plan[]; contract: Contract | null; onDone: (msg?: string) => void }> = ({ d, plans, contract, onDone }) => {
  const [plan, setPlan] = useState(contract?.plan ?? 'REGIONAL');
  const p = plans.find((x) => x.code === plan);
  const [v, setV] = useState({
    ufs: contract?.scope_ufs.join(', ') ?? '', cities: contract?.scope_cities.join(', ') ?? '', limit: String(contract?.gtin_limit ?? 50),
    base: '', per: '', discount: String(contract?.discount_pct ?? 0), billingDay: String(contract?.billing_day ?? 10),
    start: contract?.starts_on ?? new Date().toISOString().slice(0, 10), end: contract?.ends_on ?? '', doc: contract?.signed_document_ref ?? '',
    nb: contract?.allow_neighborhood ?? true, features: (contract?.features ?? []) as Feature[],
  });
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!p || contract) return;
    setV((s) => ({ ...s, base: (p.base_fee_cents / 100).toFixed(2).replace('.', ','), per: (p.price_per_gtin_cents / 100).toFixed(2).replace('.', ','), features: p.features }));
  }, [p, contract]);
  useEffect(() => {
    if (contract) setV((s) => ({ ...s, base: (contract.base_fee_cents / 100).toFixed(2).replace('.', ','), per: (contract.price_per_gtin_cents / 100).toFixed(2).replace('.', ',') }));
  }, [contract]);

  const toCents = (s: string) => Math.round(Number(s.replace(/\./g, '').replace(',', '.')) * 100);
  const estimate = useMemo(() => {
    const n = Math.max(0, Number(v.limit) || 0);
    const per = toCents(v.per || '0') * (n > 500 ? 0.7 : n > 100 ? 0.85 : 1);
    return (toCents(v.base || '0') + n * per) * (1 - (Number(v.discount) || 0) / 100);
  }, [v]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      plan, scopeUfs: v.ufs, scopeCities: v.cities, gtinLimit: Number(v.limit), baseFeeCents: toCents(v.base), pricePerGtinCents: toCents(v.per),
      discountPct: v.discount, billingDay: Number(v.billingDay), startsOn: v.start, endsOn: v.end || undefined, signedDocumentRef: v.doc,
      allowNeighborhood: v.nb, features: v.features,
    };
    try {
      if (contract) await industryAdmin.updateContract(contract.id, body); else await industryAdmin.createContract(d.id, body);
      onDone(contract ? 'Contrato salvo. Aprove a prévia de novo antes de ativar.' : 'Contrato criado em rascunho.');
    } catch (err) { setMsg(errorText(err)); }
  };

  return (
    <Card as="section" aria-label={contract ? `Editar ${contract.number}` : 'Novo contrato'}>
      <PanelTitle icon={FileSignature} title={contract ? `Editar ${contract.number}` : 'Novo contrato'} sub={p?.description} />
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginTop: 14 }}>
          {field('Pacote', <select value={plan} onChange={(e) => setPlan(e.target.value)} disabled={!!contract}>{plans.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select>)}
          {field('UFs', <input value={v.ufs} onChange={(e) => setV({ ...v, ufs: e.target.value })} placeholder="PR, SC" />, p?.max_ufs === 0 ? 'Este pacote é por cidade.' : p?.max_ufs ? `Até ${p.max_ufs}.` : 'Vazio = Brasil inteiro.')}
          {field('Cidades (código IBGE)', <input value={v.cities} onChange={(e) => setV({ ...v, cities: e.target.value })} placeholder="4106902" />, p?.max_cities ? `Até ${p.max_cities}.` : undefined)}
          {field('Produtos no contrato', <input type="number" min={1} value={v.limit} onChange={(e) => setV({ ...v, limit: e.target.value })} />)}
          {field('Taxa base por mês (R$)', <input inputMode="decimal" value={v.base} onChange={(e) => setV({ ...v, base: e.target.value })} />)}
          {field('Preço por produto por mês (R$)', <input inputMode="decimal" value={v.per} onChange={(e) => setV({ ...v, per: e.target.value })} />, 'Cai 15% acima de 100 produtos e 30% acima de 500.')}
          {field('Desconto do contrato (%)', <input inputMode="decimal" value={v.discount} onChange={(e) => setV({ ...v, discount: e.target.value })} />)}
          {field('Dia de vencimento', <input type="number" min={1} max={28} value={v.billingDay} onChange={(e) => setV({ ...v, billingDay: e.target.value })} />)}
          {field('Início', <input type="date" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} />)}
          {field('Fim', <input type="date" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} />, 'Vazio = um ano.')}
          {field('Contrato assinado', <input value={v.doc} onChange={(e) => setV({ ...v, doc: e.target.value })} placeholder="Nº ou link do documento" />, 'Obrigatório para ativar.')}
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: '14px 0 0' }}>
          <legend className="fx-muted" style={{ fontSize: 13.5, marginBottom: 6 }}>Recursos</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
            {(Object.keys(FEATURE_LABEL) as Feature[]).map((f) => (
              <label key={f} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
                <input type="checkbox" checked={v.features.includes(f)} disabled={f === 'SELLOUT'}
                  onChange={() => setV({ ...v, features: v.features.includes(f) ? v.features.filter((x) => x !== f) : [...v.features, f] })} />{FEATURE_LABEL[f]}
              </label>
            ))}
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
              <input type="checkbox" checked={v.nb} onChange={() => setV({ ...v, nb: !v.nb })} />Detalhe por bairro
            </label>
          </div>
        </fieldset>
        <p style={{ margin: '14px 0 0' }}>Estimativa com a carteira cheia: <b>{cents(Math.round(estimate))}</b> por mês.</p>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button type="submit" className="fx-btn primary"><Save aria-hidden="true" />{contract ? 'Salvar' : 'Criar rascunho'}</button>
          <button type="button" className="fx-btn ghost" onClick={() => onDone()}>Cancelar</button>
        </div>
        {msg && <p role="alert">{msg}</p>}
      </form>
    </Card>
  );
};

// ── Prévia ────────────────────────────────────────────────────────────────

const PreviewTab: React.FC<{ d: IndustryDetail; contractId: string | null; onChanged: () => Promise<void> }> = ({ d, contractId, onChanged }) => {
  const [cid, setCid] = useState(contractId ?? d.contracts.find((c) => c.status !== 'ENCERRADO')?.id ?? '');
  const [ov, setOv] = useState<Overview | null>(null);
  const [map, setMap] = useState<MapResult | null>(null);
  const [nb, setNb] = useState<MapResult | null>(null);
  const [hidden, setHidden] = useState<Awaited<ReturnType<typeof industryAdmin.suppressed>> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const contract = d.contracts.find((c) => c.id === cid);

  useEffect(() => {
    setOv(null); setMap(null); setNb(null); setMsg(null);
    industryAdmin.suppressed(d.id, 28).then(setHidden).catch(() => {});
    if (!cid) return;
    industryAdmin.previewOverview(cid).then(setOv).catch((e) => setMsg(errorText(e)));
    industryAdmin.previewMap(cid, { level: 'CIDADE', days: 28 }).then(setMap).catch(() => {});
    industryAdmin.previewMap(cid, { level: 'BAIRRO', days: 28 }).then(setNb).catch(() => {});
  }, [cid, d.id]);

  const approve = async () => {
    try { await industryAdmin.approvePreview(cid); setMsg('Prévia aprovada. Agora o contrato pode ser ativado.'); await onChanged(); }
    catch (e) { setMsg(errorText(e)); }
  };

  return (
    <>
      <Card as="section" aria-label="Prévia">
        <PanelTitle icon={Eye} title="O que a indústria vai ver" sub="A mesma consulta do portal, com as mesmas travas do banco, para o contrato escolhido."
          right={d.contracts.length > 0 ? (
            <label className="fx-field" style={{ minWidth: 220 }}>Contrato
              <select value={cid} onChange={(e) => setCid(e.target.value)}>{d.contracts.map((c) => <option key={c.id} value={c.id}>{c.number} ({CONTRACT_LABEL[c.status]})</option>)}</select>
            </label>) : undefined} />
        {!cid && <p className="fx-muted" style={{ marginTop: 12 }}>Crie um contrato para ver a prévia.</p>}
        {cid && !ov && !msg && <p className="fx-muted" style={{ marginTop: 12 }}>Carregando…</p>}
        {ov && (
          <>
            <div className="fx-kpis" style={{ marginTop: 14 }}>
              <div className="fx-kpi"><span>Unidades em 7 dias</span><b>{num(ov.week.units)}</b>{ov.weekGrowthPercent != null && <small>{pct(ov.weekGrowthPercent)}</small>}</div>
              <div className="fx-kpi"><span>Faturamento em 7 dias</span><b>{brl(ov.week.revenue)}</b></div>
              <div className="fx-kpi"><span>Produtos com venda</span><b>{ov.products.length}</b></div>
              <div className="fx-kpi"><span>Cidades publicadas</span><b>{map?.places.length ?? '…'}</b></div>
              <div className="fx-kpi"><span>Bairros publicados</span><b>{nb?.places.length ?? '…'}</b></div>
            </div>
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginTop: 14 }}>
              <div>
                <h3 style={{ fontSize: 15, margin: '0 0 6px' }}>Cidades que ela verá</h3>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.8 }}>
                  {(map?.places ?? []).slice(0, 10).map((p) => <li key={p.city_code}>{p.city} ({p.uf}): {num(p.units)} un.</li>)}
                  {map && map.places.length === 0 && <li className="fx-muted">Nenhuma.</li>}
                </ul>
              </div>
              <div>
                <h3 style={{ fontSize: 15, margin: '0 0 6px' }}>Bairros que ela verá</h3>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.8 }}>
                  {(nb?.places ?? []).slice(0, 10).map((p) => <li key={`${p.city_code}-${p.neighborhood}`}>{p.neighborhood}, {p.city}: {num(p.units)} un.</li>)}
                  {nb && nb.places.length === 0 && <li className="fx-muted">Nenhum.</li>}
                </ul>
              </div>
            </div>
          </>
        )}
        {contract && contract.status !== 'ENCERRADO' && ov && (
          <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="fx-btn lime" onClick={approve}><CheckCircle2 aria-hidden="true" />Aprovar esta prévia</button>
            {contract.preview_approved_at && <span className="fx-muted">Aprovada em {dateBr(contract.preview_approved_at)} por {contract.preview_approved_by}.</span>}
          </div>
        )}
        {msg && <p role="status" style={{ marginTop: 10 }}>{msg}</p>}
      </Card>
      {hidden && (
        <Card as="section" aria-label="O que ficou escondido">
          <PanelTitle icon={ShieldCheck} title="O que a regra de anonimato escondeu" sub="Últimos 28 dias, nos produtos desta carteira. Só o superadmin vê esta parte." />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 12 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--fx-muted)' }}><th scope="col">Nível</th><th scope="col">Motivo</th><th scope="col" style={{ textAlign: 'right' }}>Células</th></tr></thead>
            <tbody>{hidden.byReason.map((r) => (
              <tr key={`${r.level}-${r.reason}`} style={{ borderTop: '1px solid var(--fx-line)' }}>
                <td style={{ padding: '6px 0' }}>{r.level.toLowerCase()}</td><td>{REASON_LABEL[r.reason] ?? r.reason}</td><td style={{ textAlign: 'right' }}>{num(r.cells)}</td>
              </tr>
            ))}</tbody>
          </table>
          {hidden.noData.length > 0 && <p className="fx-muted" style={{ marginTop: 10 }}>Sem venda agregada: {hidden.noData.map((x) => x.product_name ?? x.gtin).slice(0, 8).join(', ')}{hidden.noData.length > 8 ? '…' : ''}</p>}
        </Card>
      )}
    </>
  );
};

// ── Auditoria ─────────────────────────────────────────────────────────────

const AuditTab: React.FC<{ d: IndustryDetail }> = ({ d }) => {
  const [data, setData] = useState<Awaited<ReturnType<typeof industryAdmin.audit>> | null>(null);
  useEffect(() => { industryAdmin.audit(d.id).then(setData).catch(() => {}); }, [d.id]);
  if (!data) return <p className="fx-muted">Carregando…</p>;
  const flagged = data.days.filter((x) => x.flags.length > 0);
  return (
    <>
      <Card as="section" aria-label="Consultas por dia">
        <PanelTitle icon={ClipboardList} title={flagged.length ? `${flagged.length} ${flagged.length === 1 ? 'dia pede' : 'dias pedem'} atenção` : 'Nenhum sinal de tentativa de triangular'}
          sub="Consultas da indústria nos últimos 30 dias. Muitas consultas por bairro ou muitos recortes diferentes num dia podem ser tentativa de isolar uma loja." />
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 12 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--fx-muted)' }}><th scope="col">Dia</th><th scope="col" style={{ textAlign: 'right' }}>Consultas</th><th scope="col" style={{ textAlign: 'right' }}>Por bairro</th><th scope="col" style={{ textAlign: 'right' }}>Recortes</th><th scope="col">Sinais</th></tr></thead>
          <tbody>{data.days.map((x) => (
            <tr key={x.day} style={{ borderTop: '1px solid var(--fx-line)' }}>
              <td style={{ padding: '6px 0' }}>{dateBr(x.day)}</td><td style={{ textAlign: 'right' }}>{x.queries}</td><td style={{ textAlign: 'right' }}>{x.neighborhood_queries}</td><td style={{ textAlign: 'right' }}>{x.distinct_filters}</td>
              <td>{x.flags.length ? x.flags.map((f) => <Chip key={f} tone="red">{f}</Chip>) : <span className="fx-muted">—</span>}</td>
            </tr>
          ))}</tbody>
        </table>
        {data.days.length === 0 && <p className="fx-muted">Nenhuma consulta ainda.</p>}
      </Card>
      <Card as="section" aria-label="Últimas consultas">
        <PanelTitle icon={History} title="Últimas consultas" />
        <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, fontSize: 13.5, display: 'grid', gap: 4 }}>
          {data.recent.map((r, i) => (
            <li key={i} style={{ borderBottom: '1px solid var(--fx-line)', padding: '5px 0' }}>
              {new Date(r.at).toLocaleString('pt-BR')} · {r.preview ? 'prévia do superadmin' : r.user_email} · <b>{r.endpoint}</b> {r.filters !== '{}' ? r.filters : ''} · {r.cells_returned} linhas
            </li>
          ))}
        </ul>
      </Card>
      <Card as="section" aria-label="Histórico do cadastro">
        <PanelTitle icon={History} title="Histórico do cadastro" />
        <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, fontSize: 13.5, display: 'grid', gap: 4 }}>
          {d.events.map((e, i) => <li key={i}>{new Date(e.at).toLocaleString('pt-BR')} · {e.actor} · <b>{e.action.replace(/_/g, ' ').toLowerCase()}</b> {e.detail !== '{}' ? e.detail : ''}</li>)}
        </ul>
      </Card>
    </>
  );
};

export default SuperAdminIndustries;
