import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Factory, LayoutDashboard, Network, PackageCheck, Plus, Save, Search, ShieldCheck, Store, Truck, UserPlus, XCircle,
} from 'lucide-react';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import { Card, Chip, Forest, Kpi, PageHero, PanelTitle, PillTabs } from '../components/flow/Flow';
import { confirmDialog, promptDialog } from '../components/common/Dialogs';
import {
  brlCents, brlPrice, cnpjLabel, commerceAdminService as svc, type AdminSellerDetail,
} from '../services/commerce.service';
import { Drawer, dateOnly, dateTime, field, grid, tableStyle, tdStyle, thStyle, useAction, useLoad } from './vendas/ui';

/** MercadoFlow Vendas no superadmin (docs/PROPOSTA-MERCADOFLOW-VENDAS.md). */

type Tab = 'visao' | 'vendedores' | 'produtos' | 'canais';

const SELLER_STATUS: Record<string, { label: string; tone: 'green' | 'amber' | 'red' | 'gray' }> = {
  EM_ANALISE: { label: 'Em análise', tone: 'amber' }, ATIVO: { label: 'Ativo', tone: 'green' },
  SUSPENSO: { label: 'Suspenso', tone: 'red' }, ENCERRADO: { label: 'Encerrado', tone: 'gray' },
};

const Page: React.FC = () => {
  const [tab, setTab] = useState<Tab>('visao');
  return (
    <>
      <PageHero title={<>MercadoFlow <mark>Vendas</mark></>}
        subtitle="Indústrias e distribuidores vendendo às lojas dentro da plataforma: quem vende, de quem é cada produto e se os contratos de distribuição estão sendo respeitados." />
      <PillTabs label="Vendas" value={tab} onChange={setTab} tabs={[
        { key: 'visao', label: 'Visão geral', icon: LayoutDashboard }, { key: 'vendedores', label: 'Vendedores', icon: Store },
        { key: 'produtos', label: 'Titularidade', icon: PackageCheck }, { key: 'canais', label: 'Canais', icon: Network },
      ]} />
      {tab === 'visao' && <Overview />}
      {tab === 'vendedores' && <Sellers />}
      {tab === 'produtos' && <Pending />}
      {tab === 'canais' && <Channels />}
    </>
  );
};

const Overview: React.FC = () => {
  const ov = useLoad(() => svc.overview());
  const d = ov.data;
  if (!d) return <p className="fx-muted">Carregando…</p>;
  const sum = (k: 'n' | 'cents' | 'fee_cents', st?: string[]) => d.orders.filter((o) => !st || st.includes(o.status)).reduce((s, o) => s + Number(o[k]), 0);
  const sellers = (status: string) => d.sellers.filter((s) => s.status === status).reduce((n, s) => n + Number(s.n), 0);
  return (
    <>
      <div className="fx-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Kpi label="Vendedores ativos" value={sellers('ATIVO')} hint={`${sellers('EM_ANALISE')} em análise`} icon={Store} />
        <Kpi label="Pedidos" value={sum('n')} hint={`${brlCents(sum('cents', ['CONFIRMADO', 'FATURADO', 'ENTREGUE']))} confirmados`} icon={Truck} />
        <Kpi label="Taxas sobre entregues" value={brlCents(sum('fee_cents'))} icon={CheckCircle2} />
        <Kpi label="Mensalidades" value={brlCents(d.monthlyFeesCents)} hint="por mês, vendedores ativos" icon={Factory} />
        <Kpi label="Produtos a conferir" value={d.pendingProducts} icon={PackageCheck} />
      </div>
      <Card>
        <PanelTitle icon={AlertTriangle} title="Pedidos parados" sub="Enviados há mais de 2 dias sem o vendedor responder." />
        {d.stuckOrders.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Nenhum pedido parado.</p> : (
          <table style={{ ...tableStyle, marginTop: 12 }}>
            <thead><tr><th style={thStyle}>Pedido</th><th style={thStyle}>Loja</th><th style={thStyle}>Vendedor</th><th style={thStyle}>Valor</th></tr></thead>
            <tbody>{d.stuckOrders.map((o) => (
              <tr key={o.number}><td style={tdStyle}>{o.number}<br /><small className="fx-muted">{dateTime(o.created_at)}</small></td><td style={tdStyle}>{o.market_name}</td><td style={tdStyle}>{o.seller_name}</td><td style={tdStyle}>{brlCents(o.total_cents)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </>
  );
};

// ── Vendedores ────────────────────────────────────────────────────────────

const emptySeller = { kind: 'DISTRIBUIDOR', cnpj: '', legalName: '', tradeName: '', contactName: '', contactEmail: '', contactPhone: '', monthlyFee: '', orderFeePct: '', notes: '' };
const feeBody = (v: typeof emptySeller) => ({
  ...v, monthlyFeeCents: v.monthlyFee ? Math.round(Number(v.monthlyFee.replace(/\./g, '').replace(',', '.')) * 100) : 0, orderFeePct: v.orderFeePct.replace(',', '.') || '0',
});

const Sellers: React.FC = () => {
  const list = useLoad(() => svc.sellers());
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <Card>
      <PanelTitle icon={Store} title="Vendedores" sub="Indústrias e distribuidores. Só vende quem estiver ativo."
        right={<button type="button" className="fx-btn primary small" onClick={() => setCreating(true)}><Plus aria-hidden="true" />Novo vendedor</button>} />
      {!list.data ? <p className="fx-muted">Carregando…</p> : list.data.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Nenhum vendedor cadastrado.</p> : (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={tableStyle}>
            <thead><tr><th style={thStyle}>Vendedor</th><th style={thStyle}>Tipo</th><th style={thStyle}>Produtos</th><th style={thStyle}>Pedidos</th><th style={thStyle}>Cobrança</th><th style={thStyle}>Situação</th><th style={thStyle} /></tr></thead>
            <tbody>
              {list.data.map((s) => (
                <tr key={s.id}>
                  <td style={tdStyle}><b>{s.trade_name ?? s.legal_name}</b><br /><small className="fx-muted">{cnpjLabel(s.cnpj)}</small></td>
                  <td style={tdStyle}>{s.kind === 'INDUSTRIA' ? 'Indústria' : 'Distribuidor'}{s.industry_id && <><br /><small className="fx-muted">com portal de dados</small></>}</td>
                  <td style={tdStyle}>{s.products}{s.pending_products > 0 && <><br /><Chip tone="amber">{s.pending_products} a conferir</Chip></>}</td>
                  <td style={tdStyle}>{s.orders}</td>
                  <td style={tdStyle}>{brlCents(s.monthly_fee_cents)}/mês<br /><small className="fx-muted">{Number(s.order_fee_pct).toLocaleString('pt-BR')}% por pedido</small></td>
                  <td style={tdStyle}><Chip tone={SELLER_STATUS[s.status].tone}>{SELLER_STATUS[s.status].label}</Chip></td>
                  <td style={tdStyle}><button type="button" className="fx-btn ghost small" onClick={() => setOpen(s.id)}>Abrir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <NewSeller onClose={() => setCreating(false)} onDone={(id) => { setCreating(false); setOpen(id); void list.reload(); }} />}
      {open && <SellerDrawer id={open} onClose={() => { setOpen(null); void list.reload(); }} />}
    </Card>
  );
};

const NewSeller: React.FC<{ onClose: () => void; onDone: (id: string) => void }> = ({ onClose, onDone }) => {
  const [v, setV] = useState(emptySeller);
  const act = useAction();
  return (
    <Drawer title="Novo vendedor" onClose={onClose}>
      <form style={{ display: 'grid', gap: 12 }} onSubmit={async (e) => { e.preventDefault(); const r = await act.run(() => svc.create(feeBody(v))); if (r) onDone(r.id); }}>
        {field('Tipo', <select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}><option value="DISTRIBUIDOR">Distribuidor ou atacadista</option><option value="INDUSTRIA">Indústria</option></select>)}
        {field('CNPJ', <input value={v.cnpj} onChange={(e) => setV({ ...v, cnpj: e.target.value })} inputMode="numeric" required />)}
        {field('Razão social', <input value={v.legalName} onChange={(e) => setV({ ...v, legalName: e.target.value })} required />)}
        {field('Nome fantasia', <input value={v.tradeName} onChange={(e) => setV({ ...v, tradeName: e.target.value })} />)}
        <div style={grid(160)}>
          {field('Mensalidade (R$)', <input value={v.monthlyFee} onChange={(e) => setV({ ...v, monthlyFee: e.target.value })} inputMode="decimal" />)}
          {field('Taxa por pedido (%)', <input value={v.orderFeePct} onChange={(e) => setV({ ...v, orderFeePct: e.target.value })} inputMode="decimal" />)}
        </div>
        <div style={grid(160)}>
          {field('Contato', <input value={v.contactName} onChange={(e) => setV({ ...v, contactName: e.target.value })} />)}
          {field('E-mail', <input type="email" value={v.contactEmail} onChange={(e) => setV({ ...v, contactEmail: e.target.value })} />)}
        </div>
        <p className="fx-muted" style={{ margin: 0 }}>O vendedor nasce em análise. Indústria que já tem o portal de dados ganha o vendedor ligado a ela automaticamente pelo CNPJ.</p>
        <button type="submit" className="fx-btn primary" disabled={act.busy} style={{ justifySelf: 'start' }}><Save aria-hidden="true" />Cadastrar</button>
        {act.msg}
      </form>
    </Drawer>
  );
};

const SellerDrawer: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const [d, setD] = useState<AdminSellerDetail | null>(null);
  const [v, setV] = useState(emptySeller);
  const [user, setUser] = useState({ email: '', name: '', password: '' });
  const act = useAction();
  const load = (r: AdminSellerDetail) => {
    setD(r);
    setV({ ...emptySeller, kind: r.kind, legalName: r.legal_name, tradeName: r.trade_name ?? '', contactName: r.contact_name ?? '', contactEmail: r.contact_email ?? '',
      contactPhone: r.contact_phone ?? '', monthlyFee: r.monthly_fee_cents ? String(r.monthly_fee_cents / 100).replace('.', ',') : '', orderFeePct: String(r.order_fee_pct ?? '').replace('.', ','), notes: r.notes ?? '' });
  };
  useEffect(() => { svc.seller(id).then(load).catch(() => onClose());   // Só ao trocar de registro: onClose é recriado a cada render e recarregaria (apagando o que se digitou).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!d) return <Drawer title="Vendedor" onClose={onClose}><p className="fx-muted">Carregando…</p></Drawer>;
  const status = async (s: string, ask?: string) => {
    let reason: string | undefined;
    if (ask) { const r = await promptDialog(ask, '', { confirmLabel: 'Confirmar' }); if (!r) return; reason = r; }
    const r = await act.run(() => svc.status(d.id, s, reason)); if (r) load(r);
  };

  return (
    <Drawer title={d.name} onClose={onClose} wide>
      <Forest>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip tone={SELLER_STATUS[d.status].tone}>{SELLER_STATUS[d.status].label}</Chip>
          <span>{d.kind === 'INDUSTRIA' ? 'Indústria' : 'Distribuidor'} · CNPJ {cnpjLabel(d.cnpj)}</span>
        </div>
        {d.status_reason && <p style={{ margin: '8px 0 0' }}>Motivo: {d.status_reason}</p>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          {d.status !== 'ATIVO' && <button type="button" className="fx-btn lime small" disabled={act.busy} onClick={() => status('ATIVO')}><CheckCircle2 aria-hidden="true" />Liberar vendas</button>}
          {d.status === 'ATIVO' && <button type="button" className="fx-btn ghost small" disabled={act.busy} onClick={() => status('SUSPENSO', 'Motivo da suspensão (o vendedor vai ler):')}><XCircle aria-hidden="true" />Suspender</button>}
          {d.status !== 'ENCERRADO' && <button type="button" className="fx-btn ghost small" disabled={act.busy} onClick={() => status('ENCERRADO', 'Motivo do encerramento:')}>Encerrar</button>}
        </div>
      </Forest>

      <Card>
        <PanelTitle icon={Store} title="Dados e cobrança" />
        <form style={{ display: 'grid', gap: 12, marginTop: 12 }} onSubmit={async (e) => { e.preventDefault(); const r = await act.run(() => svc.update(d.id, feeBody(v)), 'Dados salvos.'); if (r) load(r); }}>
          <div style={grid(200)}>
            {field('Razão social', <input value={v.legalName} onChange={(e) => setV({ ...v, legalName: e.target.value })} required />)}
            {field('Nome fantasia', <input value={v.tradeName} onChange={(e) => setV({ ...v, tradeName: e.target.value })} />)}
          </div>
          <div style={grid(160)}>
            {field('Mensalidade (R$)', <input value={v.monthlyFee} onChange={(e) => setV({ ...v, monthlyFee: e.target.value })} inputMode="decimal" />)}
            {field('Taxa por pedido (%)', <input value={v.orderFeePct} onChange={(e) => setV({ ...v, orderFeePct: e.target.value })} inputMode="decimal" />, 'Vale para os pedidos novos.')}
          </div>
          <div style={grid(160)}>
            {field('Contato', <input value={v.contactName} onChange={(e) => setV({ ...v, contactName: e.target.value })} />)}
            {field('E-mail', <input type="email" value={v.contactEmail} onChange={(e) => setV({ ...v, contactEmail: e.target.value })} />)}
            {field('Telefone', <input value={v.contactPhone} onChange={(e) => setV({ ...v, contactPhone: e.target.value })} />)}
          </div>
          {field('Observações internas', <textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />)}
          <button type="submit" className="fx-btn primary" disabled={act.busy} style={{ justifySelf: 'start' }}><Save aria-hidden="true" />Salvar</button>
        </form>
      </Card>

      <Card>
        <PanelTitle icon={UserPlus} title="Acessos ao portal de vendas" sub={d.kind === 'INDUSTRIA' && d.industry_id ? 'Os acessos do portal de dados desta indústria também entram nas vendas.' : undefined} />
        <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 6 }}>
          {d.users.length === 0 && <li className="fx-muted">Nenhum acesso próprio.</li>}
          {d.users.map((u) => (
            <li key={u.id} style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--fx-line)' }}>
              <span><b>{u.name}</b> <span className="fx-muted">{u.email} · último acesso {u.last_login_at ? dateTime(u.last_login_at) : 'nunca'}</span></span>
              <button type="button" className="fx-btn ghost small" onClick={async () => { const r = await act.run(() => svc.userActive(d.id, u.id, !u.is_active)); if (r) load(r); }}>{u.is_active ? 'Bloquear' : 'Liberar'}</button>
            </li>
          ))}
        </ul>
        <form style={{ ...grid(170), marginTop: 12 }} onSubmit={async (e) => {
          e.preventDefault();
          const r = await act.run(() => svc.createUser(d.id, user), 'Acesso criado. Envie a senha provisória por um canal seguro.');
          if (r) { load(r); setUser({ email: '', name: '', password: '' }); }
        }}>
          {field('Nome', <input value={user.name} onChange={(e) => setUser({ ...user, name: e.target.value })} required />)}
          {field('E-mail', <input type="email" value={user.email} onChange={(e) => setUser({ ...user, email: e.target.value })} required />)}
          {field('Senha provisória', <input value={user.password} onChange={(e) => setUser({ ...user, password: e.target.value })} minLength={10} required />)}
          <button type="submit" className="fx-btn primary" disabled={act.busy}><UserPlus aria-hidden="true" />Criar acesso</button>
        </form>
      </Card>

      {d.agreements.length > 0 && (
        <Card>
          <PanelTitle icon={Network} title="Acordos de distribuição declarados" sub={d.attested_at ? `Termo aceito em ${dateOnly(d.attested_at)}` : undefined} />
          <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
            {d.agreements.map((a) => <li key={a.id}>{a.distributor_name} ({cnpjLabel(a.distributor_cnpj)}) · {a.exclusivity === 'EXCLUSIVO' ? 'exclusivo' : 'não exclusivo'} · {a.scope_ufs.join(', ') || 'Brasil'}{a.status === 'ENCERRADO' ? ' · encerrado' : ''}</li>)}
          </ul>
        </Card>
      )}
      <Card>
        <PanelTitle icon={PackageCheck} title={`Catálogo (${d.products.length})`} />
        <table style={{ ...tableStyle, marginTop: 10 }}>
          <tbody>{d.products.slice(0, 50).map((p) => (
            <tr key={p.id}><td style={tdStyle}><b>{p.name}</b><br /><small className="fx-muted">{p.gtin}{p.owner ? ' · da própria indústria' : ''}</small></td><td style={tdStyle}>{brlPrice(p.base_price)}</td><td style={tdStyle}>{p.status.toLowerCase()}</td></tr>
          ))}</tbody>
        </table>
      </Card>
      <Card>
        <PanelTitle title="Auditoria" />
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 4, fontSize: 13 }}>
          {d.events.map((e, i) => <li key={i}><span className="fx-muted">{dateTime(e.at)}</span> · {e.action} · {e.actor}</li>)}
        </ul>
      </Card>
      {act.msg}
    </Drawer>
  );
};

// ── Titularidade ──────────────────────────────────────────────────────────

const Pending: React.FC = () => {
  const list = useLoad(() => svc.pendingProducts());
  const act = useAction();
  const decide = async (id: string, approve: boolean) => {
    let note: string | undefined;
    if (!approve) { const r = await promptDialog('Motivo da recusa (a indústria vai ler):', '', { confirmLabel: 'Recusar' }); if (!r) return; note = r; }
    await act.run(() => svc.decideProduct(id, approve, note));
    await list.reload();
  };
  return (
    <Card>
      <PanelTitle icon={PackageCheck} title="Produtos de indústria a conferir"
        sub="Uma indústria só vende como dona o produto que é dela: é sobre a dona que valem os acordos de distribuição. Produtos já liberados na carteira do portal de dados entram direto." />
      {!list.data ? <p className="fx-muted">Carregando…</p> : list.data.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Nada a conferir.</p> : (
        <table style={{ ...tableStyle, marginTop: 12 }}>
          <thead><tr><th style={thStyle}>Produto</th><th style={thStyle}>Indústria</th><th style={thStyle}>Preço base</th><th style={thStyle} /></tr></thead>
          <tbody>{list.data.map((p) => (
            <tr key={p.id}>
              <td style={tdStyle}><b>{p.name}</b><br /><small className="fx-muted">{p.gtin}{p.brand ? ` · ${p.brand}` : ''}</small>
                {p.claimed_by && <><br /><small style={{ color: 'var(--fx-red)' }}>Já é de {p.claimed_by}</small></>}</td>
              <td style={tdStyle}>{p.seller_name}</td>
              <td style={tdStyle}>{brlPrice(p.base_price)}</td>
              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                <button type="button" className="fx-btn primary small" disabled={act.busy} onClick={() => decide(p.id, true)}><CheckCircle2 aria-hidden="true" />É dela</button>{' '}
                <button type="button" className="fx-btn ghost small" disabled={act.busy} onClick={() => decide(p.id, false)}><XCircle aria-hidden="true" />Recusar</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {act.msg}
    </Card>
  );
};

// ── Canais ────────────────────────────────────────────────────────────────

const Channels: React.FC = () => {
  const agreements = useLoad(() => svc.agreements());
  const alerts = useLoad(() => svc.alerts());
  const stores = useLoad(() => svc.stores());
  const [sim, setSim] = useState({ marketId: '', gtin: '' });
  const [result, setResult] = useState<Awaited<ReturnType<typeof svc.simulate>> | null>(null);
  const act = useAction();

  return (
    <>
      <Card>
        <PanelTitle icon={Search} title="Por que esta loja vê (ou não vê) este produto" sub="A decisão do motor de canal para cada vendedor que tem o produto." />
        <form style={{ ...grid(220), marginTop: 12 }} onSubmit={async (e) => { e.preventDefault(); const r = await act.run(() => svc.simulate(sim.marketId, sim.gtin)); if (r) setResult(r); }}>
          {field('Loja', <select value={sim.marketId} onChange={(e) => setSim({ ...sim, marketId: e.target.value })} required>
            <option value="">Escolha</option>
            {(stores.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` · ${s.city} (${s.uf})` : ' · sem endereço'}</option>)}
          </select>)}
          {field('Código de barras', <input value={sim.gtin} onChange={(e) => setSim({ ...sim, gtin: e.target.value })} inputMode="numeric" required />)}
          <button type="submit" className="fx-btn primary" disabled={act.busy}><Search aria-hidden="true" />Simular</button>
        </form>
        {act.msg}
        {result && (
          <div style={{ marginTop: 14 }}>
            <p style={{ margin: 0 }}><b>{result.store.name}</b> · {result.store.located ? `${result.store.city} (${result.store.uf})` : 'sem endereço'}{!result.store.receiveCampaigns ? ' · não recebe campanhas' : ''}</p>
            {result.decisions.length === 0 ? <p className="fx-muted">Nenhum vendedor tem este produto.</p> : (
              <table style={{ ...tableStyle, marginTop: 8 }}>
                <thead><tr><th style={thStyle}>Vendedor</th><th style={thStyle}>Resultado</th><th style={thStyle}>Por quê</th></tr></thead>
                <tbody>{result.decisions.map((x, i) => (
                  <tr key={i}>
                    <td style={tdStyle}><b>{x.seller}</b><br /><small className="fx-muted">{x.kind === 'INDUSTRIA' ? 'Indústria' : 'Distribuidor'}{x.owner ? ' · dona do produto' : ''} · produto {x.productStatus.toLowerCase()}</small></td>
                    <td style={tdStyle}>{!x.allowed ? <Chip tone="red">não chega</Chip> : x.channel === 'DISTRIBUIDOR' ? <Chip tone="amber">via {x.distributor}</Chip> : <Chip tone="green">direto</Chip>}</td>
                    <td style={tdStyle}>{x.reason}<br /><small className="fx-muted">{x.code}</small></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
      </Card>

      <Card>
        <PanelTitle icon={AlertTriangle} title="Alertas pelas notas de entrada" sub="Comparação entre o que as indústrias declararam e quem de fato abastece as lojas (NF-e do Bipaê, 180 dias)." />
        {!alerts.data ? <p className="fx-muted">Carregando…</p> : alerts.data.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Nenhuma divergência.</p> : (
          <table style={{ ...tableStyle, marginTop: 12 }}>
            <thead><tr><th style={thStyle}>Indústria</th><th style={thStyle}>Alerta</th><th style={thStyle}>Fornecedor</th><th style={thStyle}>Alcance</th></tr></thead>
            <tbody>{alerts.data.map((a, i) => (
              <tr key={i}>
                <td style={tdStyle}>{a.industry_name}</td>
                <td style={tdStyle}>{a.kind === 'NAO_DECLARADO' ? <Chip tone="amber">distribuidor não declarado</Chip> : <Chip tone="red">exclusivo sem evidência</Chip>}</td>
                <td style={tdStyle}>{a.supplier_name ?? '—'}<br /><small className="fx-muted">{cnpjLabel(a.supplier_cnpj)}</small></td>
                <td style={tdStyle}>{a.kind === 'NAO_DECLARADO' ? `${a.stores} loja(s), ${a.products} produto(s) · última nota ${dateOnly(a.last_at)}` : `acordo desde ${dateOnly(a.starts_on)}, nenhuma nota`}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>

      <Card>
        <PanelTitle icon={Network} title="Acordos de distribuição" />
        {!agreements.data ? <p className="fx-muted">Carregando…</p> : agreements.data.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Nenhum acordo declarado.</p> : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={tableStyle}>
              <thead><tr><th style={thStyle}>Indústria</th><th style={thStyle}>Distribuidor</th><th style={thStyle}>Tipo</th><th style={thStyle}>Área</th><th style={thStyle}>Vigência</th></tr></thead>
              <tbody>{agreements.data.map((a) => (
                <tr key={a.id} style={a.status === 'ENCERRADO' ? { opacity: 0.55 } : undefined}>
                  <td style={tdStyle}><b>{a.industry_name}</b><br /><small className="fx-muted">vende {a.sales_mode === 'DIRETO' ? 'direto' : a.sales_mode === 'DISTRIBUIDOR' ? 'só por distribuidor' : 'direto e por distribuidor'}</small></td>
                  <td style={tdStyle}>{a.distributor_name}<br /><small className="fx-muted">{cnpjLabel(a.distributor_cnpj)}{a.distributor_seller_id ? ' · na plataforma' : ''}</small></td>
                  <td style={tdStyle}>{a.exclusivity === 'EXCLUSIVO' ? 'Exclusivo' : 'Não exclusivo'}{a.block_other_sellers ? ' · bloqueia outros' : ''}</td>
                  <td style={tdStyle}>{a.scope_ufs.join(', ') || (a.scope_cities.length ? `${a.scope_cities.length} cidade(s)` : 'Brasil')}</td>
                  <td style={tdStyle}>{dateOnly(a.starts_on)} a {a.ends_on ? dateOnly(a.ends_on) : 'sem fim'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="fx-muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><ShieldCheck size={16} aria-hidden="true" />As regras valem no servidor: o portal de vendas e o painel da loja só mostram o que o motor de canal libera.</p>
    </>
  );
};

const SuperAdminCommerce: React.FC = () => <SuperAdminLayout><Page /></SuperAdminLayout>;
export default SuperAdminCommerce;
