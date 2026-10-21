import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Factory, Megaphone, Minus, Network, Package, Plus, Search, ShoppingBag, ShoppingCart, Store, Truck, XCircle } from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { Card, Chip, Forest, PageHero, PanelTitle, PillTabs, Thumb } from '../../components/flow/Flow';
import { promptDialog } from '../../components/common/Dialogs';
import { useAuth } from '../../context/AuthContext';
import {
  brlCents, brlPrice, marketCommerceService as svc, qtyLabel, type CatalogItem, type InboxCampaign, type MarketSeller, type Order,
} from '../../services/commerce.service';
import { Drawer, OrderChip, dateOnly, dateTime, tableStyle, tdStyle, thStyle, useAction, useLoad } from '../vendas/ui';

/**
 * Compras digitais da loja: catálogo de cada indústria e distribuidor que
 * atende a loja (com o preço que vale para ela), campanhas recebidas e os
 * pedidos. Cada pedido também aparece em Comprar → Pedidos.
 */

type Tab = 'comprar' | 'campanhas' | 'pedidos';

const step = (i: { min_quantity: number; multiple_of: number }) => Math.max(Number(i.multiple_of) || 1, 1);
const firstQty = (i: { min_quantity: number; multiple_of: number }) => {
  const m = step(i);
  return Math.ceil(Number(i.min_quantity) / m) * m;
};

const DigitalSuppliersPage: React.FC = () => {
  const { marketId } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('aba') as Tab) || 'comprar';
  const setTab = (t: Tab) => { params.set('aba', t); setParams(params, { replace: true }); };
  const inbox = useLoad(() => (marketId ? svc.campaigns(marketId) : Promise.resolve([])), [marketId]);
  const fresh = (inbox.data ?? []).filter((c) => c.open && (c.status === 'ENTREGUE' || c.status === 'VISTA')).length;
  if (!marketId) return <Card><p>Abra o painel de uma loja para comprar.</p></Card>;

  return (
    <>
      <PageHero title="Catálogos de quem atende a sua loja, com o preço que vale para você."
        subtitle="O pedido vai para o fornecedor e também aparece em Pedidos." />
      <PillTabs label="Compras digitais" value={tab} onChange={setTab} tabs={[
        { key: 'comprar', label: 'Fornecedores', icon: Store },
        { key: 'campanhas', label: 'Campanhas recebidas', icon: Megaphone, count: fresh },
        { key: 'pedidos', label: 'Pedidos digitais', icon: ShoppingBag },
      ]} />
      {tab === 'comprar' && <Buy marketId={marketId} onOrdered={() => setTab('pedidos')} />}
      {tab === 'campanhas' && <Inbox marketId={marketId} list={inbox.data} reload={inbox.reload} onOrdered={() => setTab('pedidos')} />}
      {tab === 'pedidos' && <MyOrders marketId={marketId} />}
    </>
  );
};

// ── Fornecedores e catálogo ───────────────────────────────────────────────

const Buy: React.FC<{ marketId: string; onOrdered: () => void }> = ({ marketId, onOrdered }) => {
  const sellers = useLoad(() => svc.sellers(marketId), [marketId]);
  const [seller, setSeller] = useState<MarketSeller | null>(null);
  const available = (sellers.data ?? []).filter((s) => s.products > 0 && s.consent !== 'BLOQUEADA');

  if (seller) return <SellerCatalog marketId={marketId} seller={seller} onBack={() => setSeller(null)} onOrdered={onOrdered} />;
  return (
    <Card>
      <PanelTitle icon={Store} title="Quem atende a sua loja" sub="Só aparecem os vendedores com produtos que podem ser vendidos para a sua loja, respeitando os contratos de distribuição." />
      {!sellers.data ? <p className="fx-muted">Carregando…</p> : available.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Ainda nenhum vendedor atende a sua região pela plataforma.</p> : (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', marginTop: 14 }}>
          {available.map((s) => (
            <button key={s.id} type="button" className="fx-row" style={{ textAlign: 'left', alignItems: 'flex-start' }} onClick={() => setSeller(s)}>
              <span className="fx-icon-tile">{s.kind === 'INDUSTRIA' ? <Factory aria-hidden="true" /> : <Truck aria-hidden="true" />}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: 'block' }}>{s.name}</b>
                <small className="fx-muted">{s.kind === 'INDUSTRIA' ? 'Indústria' : 'Distribuidor'} · {s.products} produto(s)
                  {s.min_order_cents ? ` · mínimo ${brlCents(s.min_order_cents)}` : ''}</small>
                {s.payment_terms && <small className="fx-muted" style={{ display: 'block' }}>{s.payment_terms}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
};

const SellerCatalog: React.FC<{ marketId: string; seller: MarketSeller; onBack: () => void; onOrdered: () => void }> = ({ marketId, seller, onBack, onOrdered }) => {
  const [q, setQ] = useState('');
  const catalog = useLoad(() => svc.catalog(marketId, seller.id), [marketId, seller.id]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const act = useAction();
  const items = useMemo(() => (catalog.data ?? []).filter((i) => !q || `${i.name} ${i.gtin} ${i.brand ?? ''}`.toLowerCase().includes(q.toLowerCase())), [catalog.data, q]);
  const byGtin = useMemo(() => Object.fromEntries((catalog.data ?? []).map((i) => [i.gtin, i])), [catalog.data]);
  const price = (i: CatalogItem, qty: number) => {
    let p = Number(i.unit_price);
    let best = 0;
    for (const t of i.tiers) if (qty >= Number(t.minQty) && Number(t.minQty) >= best) { best = Number(t.minQty); p = Number(t.unitPrice); }
    return p;
  };
  const lines = Object.entries(cart).filter(([, n]) => n > 0).map(([g, n]) => ({ item: byGtin[g], qty: n })).filter((l) => l.item);
  const total = lines.reduce((s, l) => s + Math.round(price(l.item, l.qty) * l.qty * 100), 0);
  const change = (i: CatalogItem, dir: 1 | -1) => setCart((c) => {
    const cur = c[i.gtin] ?? 0;
    const next = dir > 0 ? (cur === 0 ? firstQty(i) : cur + step(i)) : (cur - step(i) < Number(i.min_quantity) ? 0 : cur - step(i));
    return { ...c, [i.gtin]: next };
  });

  return (
    <div style={{ display: 'grid', gap: 'clamp(14px, 1.6vw, 22px)', gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))', alignItems: 'start' }}>
      <Card>
        <PanelTitle icon={seller.kind === 'INDUSTRIA' ? Factory : Truck} title={seller.name}
          sub={[seller.payment_terms, seller.delivery_terms, seller.min_order_cents ? `pedido mínimo ${brlCents(seller.min_order_cents)}` : ''].filter(Boolean).join(' · ') || undefined}
          right={<button type="button" className="fx-btn ghost small" onClick={onBack}>Outros vendedores</button>} />
        <label className="fx-field" style={{ marginTop: 12 }}>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Search size={15} aria-hidden="true" />Procurar no catálogo</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, marca ou código" />
        </label>
        {!catalog.data ? <p className="fx-muted">Carregando…</p> : items.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Nada encontrado.</p> : (
          <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'grid', gap: 8 }}>
            {items.map((i) => {
              const qty = cart[i.gtin] ?? 0;
              return (
                <li key={i.gtin} className="fx-row" style={{ cursor: 'default', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Thumb name={i.name} src={i.image_url} size={48} info={`${brlPrice(i.unit_price)} · ${i.unit_type}${i.units_per_pack ? ` com ${qtyLabel(i.units_per_pack)}` : ''}`} />
                  <span style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <b style={{ display: 'block' }}>{i.name}</b>
                    <small className="fx-muted">{i.gtin} · {i.unit_type}{i.units_per_pack ? ` c/ ${qtyLabel(i.units_per_pack)}` : ''} · mínimo {qtyLabel(i.min_quantity)}</small>
                    {i.tiers.length > 0 && <small className="fx-muted" style={{ display: 'block' }}>{i.tiers.map((t) => `a partir de ${t.minQty}: ${brlPrice(t.unitPrice)}`).join(' · ')}</small>}
                    {!i.in_stock && <small style={{ color: 'var(--fx-red)', display: 'block' }}>Sem estoque no vendedor</small>}
                  </span>
                  <span style={{ textAlign: 'right', marginLeft: 'auto' }}>
                    <b className="fx-num" style={{ display: 'block' }}>{brlPrice(qty ? price(i, qty) : i.unit_price)}</b>
                    {i.price_source === 'TABELA' && <small className="fx-muted">sua tabela</small>}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button type="button" className="fx-btn ghost small" aria-label={`Menos ${i.name}`} disabled={qty === 0} onClick={() => change(i, -1)}><Minus aria-hidden="true" /></button>
                    <b style={{ minWidth: 34, textAlign: 'center' }} aria-live="polite">{qty}</b>
                    <button type="button" className="fx-btn ghost small" aria-label={`Mais ${i.name}`} disabled={!i.in_stock} onClick={() => change(i, 1)}><Plus aria-hidden="true" /></button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Forest as="aside" aria-label="Seu pedido">
        <PanelTitle icon={ShoppingCart} title="Seu pedido" sub={lines.length === 0 ? 'Escolha os produtos ao lado.' : `${lines.length} produto(s)`} />
        {lines.length > 0 && (
          <div className="fx-white" style={{ marginTop: 14 }}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {lines.map((l) => (
                <li key={l.item.gtin} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span>{qtyLabel(l.qty)} × {l.item.name}</span><b className="fx-num">{brlCents(Math.round(price(l.item, l.qty) * l.qty * 100))}</b>
                </li>
              ))}
            </ul>
            <p style={{ margin: '12px 0 0', display: 'flex', justifyContent: 'space-between' }}><span>Total</span><b className="fx-num" style={{ fontSize: 20 }}>{brlCents(total)}</b></p>
            {seller.min_order_cents > 0 && total < seller.min_order_cents && <p style={{ margin: '6px 0 0', color: 'var(--fx-red)' }}>Faltam {brlCents(seller.min_order_cents - total)} para o pedido mínimo.</p>}
          </div>
        )}
        <label className="fx-field" style={{ marginTop: 12, color: 'inherit' }}>Observação para o vendedor
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button type="button" className="fx-btn lime" style={{ marginTop: 12, width: '100%' }} disabled={act.busy || lines.length === 0 || total < seller.min_order_cents}
          onClick={async () => {
            const r = await act.run(() => svc.createOrder(marketId, { sellerId: seller.id, items: lines.map((l) => ({ gtin: l.item.gtin, quantity: l.qty })), notes }));
            if (r) { setCart({}); onOrdered(); }
          }}><ShoppingBag aria-hidden="true" />Enviar pedido</button>
        <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.85 }}>O preço é conferido de novo na hora do pedido. Pagamento e entrega seguem as condições do vendedor.</p>
        {act.msg}
      </Forest>
    </div>
  );
};

// ── Campanhas recebidas ───────────────────────────────────────────────────

const Inbox: React.FC<{ marketId: string; list: InboxCampaign[] | null; reload: () => Promise<void>; onOrdered: () => void }> = ({ marketId, list, reload, onOrdered }) => {
  const [open, setOpen] = useState<InboxCampaign | null>(null);
  if (!list) return <p className="fx-muted">Carregando…</p>;
  return (
    <Card>
      <PanelTitle icon={Megaphone} title="Campanhas para a sua loja" sub="Condições especiais das indústrias e distribuidores. Você só é identificado se fizer o pedido." />
      {list.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Nenhuma campanha por enquanto.</p> : (
        <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'grid', gap: 8 }}>
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" className="fx-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => { setOpen(c); if (c.status === 'ENTREGUE') void svc.seen(marketId, c.id); }}>
                <span className="fx-icon-tile">{c.seller_kind === 'INDUSTRIA' ? <Factory aria-hidden="true" /> : <Truck aria-hidden="true" />}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block' }}>{c.title}</b>
                  <small className="fx-muted">{c.seller_name}{c.channel === 'DISTRIBUIDOR' ? ` · atendida por ${c.fulfilled_by ?? c.distributor_name}` : ''} · até {dateOnly(c.valid_until)}</small>
                </span>
                {c.status === 'PEDIDO' ? <Chip tone="green">Pedido feito</Chip> : c.status === 'RECUSADA' ? <Chip tone="gray">Recusada</Chip>
                  : !c.open ? <Chip tone="gray">Encerrada</Chip> : c.status === 'ENTREGUE' ? <Chip tone="lime">Nova</Chip> : <Chip tone="amber">Vista</Chip>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <CampaignOrder marketId={marketId} c={open} onClose={() => { setOpen(null); void reload(); }} onOrdered={() => { setOpen(null); void reload(); onOrdered(); }} />}
    </Card>
  );
};

const CampaignOrder: React.FC<{ marketId: string; c: InboxCampaign; onClose: () => void; onOrdered: () => void }> = ({ marketId, c, onClose, onOrdered }) => {
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(c.items.map((i) => [i.gtin, ''])));
  const act = useAction();
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const canOrder = c.open && (c.status === 'ENTREGUE' || c.status === 'VISTA');
  const total = c.items.reduce((s, i) => s + Math.round(Number(i.unit_price) * (Number((qty[i.gtin] || '0').replace(',', '.')) || 0) * 100), 0);

  return (
    <Drawer title={c.title} onClose={onClose} wide>
      <p style={{ margin: 0 }}><b>{c.seller_name}</b> · válida de {dateOnly(c.valid_from)} a {dateOnly(c.valid_until)}</p>
      {c.message && <p style={{ margin: 0 }}>{c.message}</p>}
      <Card>
        <PanelTitle icon={c.channel === 'DISTRIBUIDOR' ? Network : Factory}
          title={c.channel === 'DISTRIBUIDOR' ? `Atendida por ${c.fulfilled_by ?? c.distributor_name}` : `Direto de ${c.seller_name}`} sub={c.channel_reason} />
        {c.channel === 'DISTRIBUIDOR' && !c.fulfilled_by && (
          <p className="fx-muted" style={{ margin: '10px 0 0' }}>Este distribuidor ainda não vende pela plataforma: o pedido fica pronto em Comprar → Pedidos, com os preços da campanha, para você enviar a ele.</p>
        )}
      </Card>
      <Card>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Produto</th><th style={thStyle}>Preço</th><th style={thStyle}>Mínimo</th>{canOrder && <th style={thStyle}>Quantidade</th>}</tr></thead>
          <tbody>
            {c.items.map((i) => (
              <tr key={i.gtin}>
                <td style={tdStyle}><b>{i.name ?? i.gtin}</b><br /><small className="fx-muted">{i.gtin}{i.unit_type ? ` · ${i.unit_type}` : ''}{i.units_per_pack ? ` c/ ${qtyLabel(i.units_per_pack)}` : ''}</small></td>
                <td style={tdStyle}><b>{brlPrice(i.unit_price)}</b></td>
                <td style={tdStyle}>{qtyLabel(i.min_quantity)}</td>
                {canOrder && <td style={tdStyle}><input className="fx-input" style={{ width: 90 }} inputMode="decimal" aria-label={`Quantidade de ${i.name ?? i.gtin}`}
                  value={qty[i.gtin]} onChange={(e) => setQty({ ...qty, [i.gtin]: e.target.value })} placeholder={String(i.min_quantity)} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {canOrder && <p style={{ margin: '12px 0 0', textAlign: 'right' }}>Total <b className="fx-num" style={{ fontSize: 20 }}>{brlCents(total)}</b></p>}
      </Card>
      {!canOrder && (
        <p className="fx-muted" style={{ margin: 0 }}>{c.status === 'PEDIDO' ? 'Sua loja já fez o pedido desta campanha. Acompanhe em Pedidos digitais.'
          : c.status === 'RECUSADA' ? 'Sua loja recusou esta campanha.' : 'Esta campanha não está mais valendo.'}</p>
      )}
      {canOrder && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="fx-btn primary" disabled={act.busy || total === 0} onClick={async () => {
            const items = c.items.map((i) => ({ gtin: i.gtin, quantity: Number((qty[i.gtin] || '0').replace(',', '.')) })).filter((i) => i.quantity > 0);
            const r = await act.run(() => svc.createOrder(marketId, { deliveryId: c.id, items }));
            if (!r) return;
            if (r.kind === 'RASCUNHO_FORNECEDOR') setDraftNote(r.distributorName);
            else onOrdered();
          }}><CheckCircle2 aria-hidden="true" />Fazer o pedido</button>
          <button type="button" className="fx-btn ghost" disabled={act.busy} onClick={async () => {
            const reason = await promptDialog('Quer contar por que não interessa? (opcional)', '', { confirmLabel: 'Recusar campanha' });
            if (reason === null) return;
            const r = await act.run(() => svc.refuse(marketId, c.id, reason || undefined));
            if (r) onClose();
          }}><XCircle aria-hidden="true" />Não interessa</button>
        </div>
      )}
      {draftNote && (
        <Forest>
          <p style={{ margin: 0 }}>Pedido montado em <b>Comprar → Pedidos</b>, com os preços da campanha, para enviar a {draftNote}.</p>
          <p style={{ margin: '10px 0 0' }}><Link to="/app/lista-compras" className="fx-btn lime"><Package aria-hidden="true" />Abrir os pedidos</Link></p>
        </Forest>
      )}
      {act.msg}
    </Drawer>
  );
};

// ── Pedidos digitais ──────────────────────────────────────────────────────

const MyOrders: React.FC<{ marketId: string }> = ({ marketId }) => {
  const list = useLoad(() => svc.orders(marketId), [marketId]);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card>
      <PanelTitle icon={ShoppingBag} title="Pedidos digitais" sub="Acompanhe a confirmação, a nota e a entrega de cada pedido." />
      {!list.data ? <p className="fx-muted">Carregando…</p> : list.data.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Nenhum pedido digital ainda.</p> : (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={tableStyle}>
            <thead><tr><th style={thStyle}>Pedido</th><th style={thStyle}>Vendedor</th><th style={thStyle}>Valor</th><th style={thStyle}>Situação</th><th style={thStyle} /></tr></thead>
            <tbody>
              {list.data.map((o) => (
                <tr key={o.id}>
                  <td style={tdStyle}><b>{o.number}</b><br /><small className="fx-muted">{dateTime(o.created_at)}{o.campaign_title ? ` · ${o.campaign_title}` : ''}</small></td>
                  <td style={tdStyle}>{o.seller_name}</td>
                  <td style={tdStyle}><b className="fx-num">{brlCents(o.total_cents)}</b></td>
                  <td style={tdStyle}><OrderChip status={o.status} /></td>
                  <td style={tdStyle}><button type="button" className="fx-btn ghost small" onClick={() => setOpen(o.id)}>Abrir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <OrderDrawer marketId={marketId} id={open} onClose={() => { setOpen(null); void list.reload(); }} />}
    </Card>
  );
};

const OrderDrawer: React.FC<{ marketId: string; id: string; onClose: () => void }> = ({ marketId, id, onClose }) => {
  const [o, setO] = useState<Order | null>(null);
  const act = useAction();
  useEffect(() => { svc.order(marketId, id).then(setO).catch(() => onClose());   // Só ao trocar de pedido: onClose é recriado a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId, id]);
  if (!o) return <Drawer title="Pedido" onClose={onClose}><p className="fx-muted">Carregando…</p></Drawer>;
  return (
    <Drawer title={`Pedido ${o.number}`} onClose={onClose} wide>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <OrderChip status={o.status} /><span className="fx-muted">{o.seller_name}{o.nfe_number ? ` · NF ${o.nfe_number}` : ''}</span>
      </div>
      {o.status_reason && <p style={{ margin: 0 }}>{o.status === 'RECUSADO' || o.status === 'CANCELADO' ? 'Motivo: ' : ''}{o.status_reason}</p>}
      <Card>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Produto</th><th style={thStyle}>Pedido</th><th style={thStyle}>Confirmado</th><th style={thStyle}>Preço</th><th style={thStyle}>Subtotal</th></tr></thead>
          <tbody>{o.items.map((i) => (
            <tr key={i.id}>
              <td style={tdStyle}><b>{i.name}</b><br /><small className="fx-muted">{i.gtin}</small></td>
              <td style={tdStyle}>{qtyLabel(i.quantity)}</td>
              <td style={tdStyle}>{i.quantity_confirmed == null ? '—' : qtyLabel(i.quantity_confirmed)}</td>
              <td style={tdStyle}>{brlPrice(i.unit_price)}</td>
              <td style={tdStyle}>{brlCents(i.subtotal_cents)}</td>
            </tr>
          ))}</tbody>
        </table>
        <p style={{ margin: '12px 0 0', textAlign: 'right' }}>Total <b className="fx-num" style={{ fontSize: 20 }}>{brlCents(o.total_cents)}</b></p>
      </Card>
      <Card>
        <PanelTitle title="Vendedor" />
        <p style={{ margin: '8px 0 0' }}>{[o.seller_contact, o.seller_email, o.seller_phone].filter(Boolean).join(' · ') || <span className="fx-muted">Sem contato cadastrado.</span>}</p>
        {(o.payment_terms || o.delivery_terms) && <p className="fx-muted" style={{ margin: '6px 0 0' }}>{[o.payment_terms, o.delivery_terms].filter(Boolean).join(' · ')}</p>}
      </Card>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {o.status === 'ENVIADO' && <button type="button" className="fx-btn ghost" disabled={act.busy} onClick={async () => {
          const reason = await promptDialog('Por que vai cancelar? (opcional)', '', { confirmLabel: 'Cancelar pedido' });
          if (reason === null) return;
          const r = await act.run(() => svc.cancel(marketId, o.id, reason || undefined), 'Pedido cancelado.'); if (r) setO(r);
        }}><XCircle aria-hidden="true" />Cancelar pedido</button>}
        {(o.status === 'CONFIRMADO' || o.status === 'FATURADO') && <button type="button" className="fx-btn primary" disabled={act.busy} onClick={async () => {
          const r = await act.run(() => svc.received(marketId, o.id), 'Recebimento registrado.'); if (r) setO(r);
        }}><Truck aria-hidden="true" />A mercadoria chegou</button>}
        {o.supplier_order_id && <Link to="/app/lista-compras" className="fx-btn ghost"><Package aria-hidden="true" />Ver em Comprar → Pedidos</Link>}
      </div>
      {act.msg}
      <Card>
        <PanelTitle title="Histórico" />
        <ol style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 8 }}>
          {o.events.map((e, i) => (
            <li key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span><OrderChip status={e.to_status} /> <small className="fx-muted">{e.actor_side === 'LOJA' ? 'pela loja' : e.actor_side === 'VENDEDOR' ? 'pelo vendedor' : ''}{e.note ? ` · ${e.note}` : ''}</small></span>
              <small className="fx-muted">{dateTime(e.at)}</small>
            </li>
          ))}
        </ol>
      </Card>
    </Drawer>
  );
};

const DigitalSuppliers: React.FC = () => <Layout><DigitalSuppliersPage /></Layout>;
export default DigitalSuppliers;
