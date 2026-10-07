import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Check, ClipboardList, ExternalLink, ListChecks, Loader2, Minus, PackageCheck, Plus, Send, Sparkles, Trash2, Truck, X,
} from 'lucide-react';
import { Card, Chip, Forest, PanelTitle, StepTrack, Thumb } from '../../components/flow/Flow';
import OrderSendOptions from '../../components/orders/OrderSendOptions';
import DecisionFeedback from '../../components/intelligence/DecisionFeedback';
import { useRecommendationDecision } from '../../hooks/useRecommendationDecision';
import { marketService } from '../../services/market.service';
import { formatMoney } from '../../utils/formatters';
import { COST_SOURCE_LABEL, decisionInputsService, moneyInput, parseMoney, type KnownInputs } from '../../services/decisionInputs.service';
import type { RecommendationItem, ShoppingListItem, SupplierOrder } from '../../types/analytics.types';

/**
 * Mesa de compras: à esquerda, só o que pede uma ação hoje (sugestões do Tino,
 * pedidos para enviar, entregas a caminho, lista sem pedido); à direita, o item
 * escolhido aberto no painel floresta, com as etapas e o botão de decidir.
 */

type Entry =
  | { key: string; kind: 'sugestoes' }
  | { key: string; kind: 'rascunho' | 'enviado'; order: SupplierOrder }
  | { key: string; kind: 'lista' };

const sinceLabel = (iso?: string | null) => {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`;
};

const supplierName = (o: SupplierOrder) => o.supplierFantasia || o.supplierName;

export const buyHeadline = (drafts: SupplierOrder[], _suggestions: RecommendationItem[], sent: SupplierOrder[]) => {
  if (drafts.length) {
    const total = drafts.reduce((a, o) => a + Number(o.totalValue || 0), 0);
    return { lead: `${drafts.length === 1 ? 'Um pedido pronto' : `${drafts.length} pedidos prontos`} para enviar.`, mark: formatMoney(total) };
  }
  if (sent.length) return { lead: 'Tudo enviado.', mark: `${sent.length} ${sent.length === 1 ? 'entrega a caminho' : 'entregas a caminho'}.` };
  return { lead: 'Nenhum pedido', mark: 'em aberto.' };
};

const BuyDesk: React.FC<{
  marketId: string;
  orders: SupplierOrder[];
  suggestions: RecommendationItem[];
  listPending: ShoppingListItem[];
  loading: boolean;
  onOrdersChanged: () => void;
  onSuggestionsChanged: () => Promise<void>;
  onOpenOrder: (o: SupplierOrder) => void;
  onReceive: (o: SupplierOrder) => void;
  onOrderFromList: (productIds: string[]) => void;
  onGoList: () => void;
}> = ({ marketId, orders, suggestions, listPending, loading, onOrdersChanged, onSuggestionsChanged, onOpenOrder, onReceive, onOrderFromList, onGoList }) => {
  const drafts = useMemo(() => orders.filter((o) => o.status === 'RASCUNHO'), [orders]);
  const sent = useMemo(() => orders.filter((o) => o.status === 'ENVIADO'), [orders]);
  const entries: Entry[] = useMemo(() => [
    ...(suggestions.length ? [{ key: 'sugestoes', kind: 'sugestoes' as const }] : []),
    ...drafts.map((order) => ({ key: order.id, kind: 'rascunho' as const, order })),
    ...sent.map((order) => ({ key: order.id, kind: 'enviado' as const, order })),
    ...(listPending.length ? [{ key: 'lista', kind: 'lista' as const }] : []),
  ], [suggestions.length, drafts, sent, listPending.length]);
  const [selected, setSelected] = useState<string | null>(null);
  const navigate = useNavigate();
  // As sugestões de compra são decididas no Decidir; aqui a linha só leva até lá.
  const current = entries.find((e) => e.key === selected) ?? entries.find((e) => e.kind !== 'sugestoes') ?? null;
  const sugImpact = suggestions.reduce((a, r) => a + Number(r.expectedImpactValue || 0), 0);

  if (loading && entries.length === 0) {
    return <div className="fx-split"><Card><Loader2 className="animate-spin" aria-label="Carregando" /></Card></div>;
  }

  if (entries.length === 0) {
    return (
      <Forest style={{ textAlign: 'center', padding: 'clamp(28px, 4vw, 48px)' }}>
        <span className="fx-brief-orb" style={{ margin: '0 auto' }} aria-hidden="true"><Check /></span>
        <h2 className="fx-panel-title" style={{ marginTop: 14 }}>Nenhum pedido para enviar ou receber</h2>
      </Forest>
    );
  }

  return (
    <div className="fx-split">
      <Card as="section" aria-label="Agora importa">
        <PanelTitle title="Para enviar e receber" />
        <ul className="fx-stack" style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, gap: 8 }}>
          {entries.map((e) => {
            const on = current?.key === e.key;
            let icon = <Sparkles aria-hidden="true" />;
            let title = '';
            let sub = '';
            let value: number | null = null;
            let chip: React.ReactNode = null;
            if (e.kind === 'sugestoes') {
              title = `O Tino sugere ${suggestions.length} ${suggestions.length === 1 ? 'compra' : 'compras'}`;
              sub = 'Abrir em Decidir para escolher e pôr no pedido';
              value = sugImpact || null;
              chip = <Chip tone="lime">Novo</Chip>;
            } else if (e.kind === 'rascunho') {
              icon = <Send aria-hidden="true" />;
              title = supplierName(e.order);
              sub = `${e.order.itemCount} ${e.order.itemCount === 1 ? 'item' : 'itens'} · montado ${sinceLabel(e.order.createdAt)}`;
              value = Number(e.order.totalValue || 0);
              chip = <Chip tone="green">Para enviar</Chip>;
            } else if (e.kind === 'enviado') {
              icon = <Truck aria-hidden="true" />;
              title = supplierName(e.order);
              sub = `Enviado ${sinceLabel(e.order.sentAt)} · aguardando entrega`;
              value = Number(e.order.totalValue || 0);
              chip = <Chip tone="amber">A caminho</Chip>;
            } else {
              icon = <ListChecks aria-hidden="true" />;
              title = 'Lista de compras';
              sub = `${listPending.length} ${listPending.length === 1 ? 'produto ainda sem pedido' : 'produtos ainda sem pedido'}`;
            }
            return (
              <li key={e.key}>
                <button type="button" className={`fx-row ${on ? 'selected' : ''}`} aria-current={on || undefined} onClick={() => {
                  if (e.kind === 'sugestoes') { navigate('/app/decidir?filtro=comprar&item=lote%3Acomprar'); return; }
                  setSelected(e.key);
                  // No celular o painel fica embaixo da lista: leva o lojista até ele.
                  if (window.innerWidth < 1100) requestAnimationFrame(() => document.getElementById('buy-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                }}>
                  <span className="fx-list-row">
                    <span className="fx-icon-tile">{icon}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><b style={{ fontSize: 16 }}>{title}</b>{chip}</span>
                      <span className="fx-muted" style={{ display: 'block', fontSize: 13.5 }}>{sub}</span>
                    </span>
                    <span className="v">{value ? formatMoney(value) : ''}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <div id="buy-panel" key={current?.key} className="fx-sticky" style={{ minWidth: 0, scrollMarginTop: 80 }}>
      {(current?.kind === 'rascunho' || current?.kind === 'enviado') && (
        <OrderPanel key={current.order.id} marketId={marketId} order={current.order} onChanged={onOrdersChanged} onOpen={onOpenOrder} onReceive={onReceive} />
      )}
      {current?.kind === 'lista' && <ListPanel items={listPending} onOrder={onOrderFromList} onGoList={onGoList} />}
      </div>
    </div>
  );
};

/* ── Sugestões do Tino: marcar e pôr no pedido ── */
export const SuggestionsPanel: React.FC<{ marketId: string; suggestions: RecommendationItem[]; onChanged: () => Promise<void> }> = ({ marketId, suggestions, onChanged }) => {
  const { deciding, feedback, setFeedback, error, decide } = useRecommendationDecision(marketId, suggestions, onChanged);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState(false);
  const chosen = suggestions.filter((r) => !off.has(r.id));
  const total = chosen.reduce((a, r) => a + Number(r.expectedImpactValue || 0), 0);
  const toggle = (id: string) => setOff((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // Custo por item: vem preenchido da nota, do ERP ou do que você já informou; sem ele a compra não entra.
  const [known, setKnown] = useState<Record<string, KnownInputs>>({});
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<string | null>(null);
  const pid = (r: RecommendationItem) => r.productId || r.parameters?.produtoId || null;
  const idsKey = suggestions.map((r) => pid(r)).filter(Boolean).join(',');
  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : [];
    if (!ids.length) return;
    let alive = true;
    decisionInputsService.known(marketId, ids).then((list) => {
      if (!alive) return;
      const byId: Record<string, KnownInputs> = {};
      list.forEach((k) => { byId[k.productId] = k; });
      setKnown(byId);
      setCosts((cur) => {
        const next = { ...cur };
        suggestions.forEach((r) => { const k = byId[pid(r) ?? '']; if (next[r.id] == null && k?.unitCost != null) next[r.id] = moneyInput(k.unitCost); });
        return next;
      });
    }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId, idsKey]);

  const accept = async (r: RecommendationItem) => {
    const c = parseMoney(costs[r.id] ?? '');
    const id = pid(r);
    if (c == null || c <= 0) { setMissing(`Informe o custo de ${r.productName || r.title}.`); return false; }
    setMissing(null);
    if (id && c !== known[id]?.unitCost) await decisionInputsService.save(marketId, [{ productId: id, unitCost: c }], r.id).catch(() => undefined);
    await decide(r.id, 'ACEITA');
    return true;
  };

  const putAll = async () => {
    const without = chosen.filter((r) => { const c = parseMoney(costs[r.id] ?? ''); return c == null || c <= 0; });
    if (without.length) {
      setMissing(`Falta o custo de ${without.length === 1 ? (without[0].productName || without[0].title) : `${without.length} produtos`}. Digite o da última compra.`);
      return;
    }
    setBulk(true);
    try { for (const r of chosen) await accept(r); } finally { setBulk(false); }
  };

  return (
    <Forest as="aside" aria-label="Sugestões de compra">
      <PanelTitle icon={Sparkles} title="Antes de comprar" sub="O Tino olhou a venda das últimas semanas e o que está acabando" />
      <div className="fx-desk-steps" style={{ marginTop: 18 }}>
        <StepTrack steps={[
          { label: 'Tino calculou', hint: 'Venda e estoque', state: 'done' },
          { label: 'Você escolhe', hint: 'Tire o que não quer', state: 'now' },
          { label: 'Vai ao pedido', hint: 'Do fornecedor de sempre', state: 'next' },
        ]} />
      </div>
      {feedback && <div style={{ marginTop: 12 }}><DecisionFeedback feedback={feedback} marketId={marketId} onChange={setFeedback} onUndone={onChanged} /></div>}
      {error && <p role="alert" className="fx-chip red" style={{ whiteSpace: 'normal', marginTop: 12 }}>{error}</p>}
      {missing && <p role="alert" className="fx-chip red" style={{ whiteSpace: 'normal', marginTop: 12 }}>{missing}</p>}
      <div className="fx-items" role="list" aria-label="Produtos sugeridos" style={{ marginTop: 14 }}>
        {suggestions.map((r) => {
          const on = !off.has(r.id);
          return (
            <div key={r.id} role="listitem" className={`fx-item with-check ${on ? '' : 'off'}`}>
              <input type="checkbox" className="fx-check" checked={on} onChange={() => toggle(r.id)} aria-label={`Incluir ${r.productName || r.title}`} />
              <Thumb name={r.productName || r.title} src={r.productImage} size={46} />
              <div style={{ minWidth: 0 }}>
                <div className="fx-item-name">{r.productName || r.title}</div>
                <div className="fx-item-detail">{(r.rationale || '').split(/(?<=\.)\s/)[0]}</div>
                <label className="fx-field" style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  Custo R$/un.
                  <input className="fx-input fx-num" inputMode="decimal" value={costs[r.id] ?? ''} placeholder="0,00" style={{ width: 96, textAlign: 'right' }}
                    aria-label={`Custo de ${r.productName || r.title}`} onChange={(e) => setCosts({ ...costs, [r.id]: e.target.value })} />
                  <span className="fx-muted" style={{ fontSize: 12.5 }}>
                    {(() => {
                      const k = known[pid(r) ?? ''];
                      if (k?.unitCost != null && parseMoney(costs[r.id] ?? '') === k.unitCost) return COST_SOURCE_LABEL[k.costSource ?? ''] ?? '';
                      if (!costs[r.id] && k?.pendingNfe) return 'está na nota não conferida no Confere';
                      return !costs[r.id] ? 'sem custo registrado' : '';
                    })()}
                  </span>
                </label>
              </div>
              <div className="fx-item-val">
                <span>{r.parameters?.quantidade ? `${Math.round(Number(r.parameters.quantidade)).toLocaleString('pt-BR')} un.` : 'Impacto'}</span>
                <b>{r.expectedImpactValue ? formatMoney(r.expectedImpactValue) : '—'}</b>
              </div>
              <div className="ctl" style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="fx-btn dark small" disabled={!!deciding || bulk} onClick={() => { void accept(r); }}>
                  {deciding === r.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}Pôr no pedido
                </button>
                <button type="button" className="fx-btn ghost small" disabled={!!deciding || bulk} onClick={() => decide(r.id, 'REJEITADA')} aria-label={`Não comprar ${r.productName || r.title}`}>
                  <X aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="fx-desk-bottom">
        <div className="fx-white">
          <h3>Pôr tudo de uma vez</h3>
          <small>Cada produto vai para o rascunho do fornecedor da última compra. Nada é enviado sem você revisar.</small>
          <div className="fx-actions" style={{ marginTop: 14 }}>
            <button type="button" className="fx-btn dark" disabled={chosen.length === 0 || bulk || !!deciding} onClick={putAll}>
              {bulk ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ClipboardList aria-hidden="true" />}
              Pôr {chosen.length === 1 ? 'o marcado' : `os ${chosen.length} marcados`} no pedido
            </button>
          </div>
        </div>
        <div className="fx-impact">
          <h3><Sparkles size={18} aria-hidden="true" />Margem que a compra traz</h3>
          <span className="fx-money fx-num">{formatMoney(total)}</span>
          <p>Investimento: {formatMoney(chosen.reduce((a, r) => a + Number(r.parameters?.valorEstimado || 0), 0))} nos produtos marcados.</p>
        </div>
      </div>
    </Forest>
  );
};

/* ── Pedido: revisar, enviar, receber ── */
const OrderPanel: React.FC<{
  marketId: string;
  order: SupplierOrder;
  onChanged: () => void;
  onOpen: (o: SupplierOrder) => void;
  onReceive: (o: SupplierOrder) => void;
}> = ({ marketId, order: initial, onChanged, onOpen, onReceive }) => {
  const [order, setOrder] = useState<SupplierOrder>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const draft = order.status === 'RASCUNHO';

  const reload = useCallback(async () => {
    try { setOrder(await marketService.getSupplierOrder(marketId, initial.id)); } catch { /* fica o que tem */ }
  }, [marketId, initial.id]);
  useEffect(() => { void reload(); }, [reload]);

  const setQty = async (itemId: string, q: number) => {
    if (q < 1) return;
    setBusy(itemId); setErr(null);
    try { await marketService.updateSupplierOrderItem(marketId, order.id, itemId, { quantityRequested: q }); await reload(); onChanged(); }
    catch (e: any) { setErr(e?.response?.data?.message || 'Não foi possível mudar a quantidade.'); }
    finally { setBusy(null); }
  };
  const remove = async (itemId: string) => {
    setBusy(itemId); setErr(null);
    try { await marketService.removeSupplierOrderItem(marketId, order.id, itemId); await reload(); onChanged(); }
    catch (e: any) { setErr(e?.response?.data?.message || 'Não foi possível tirar o item.'); }
    finally { setBusy(null); }
  };

  const items = order.items ?? [];
  const margin = items.reduce((a, i) => a + (i.unitSalePrice ? (Number(i.unitSalePrice) - Number(i.unitCost)) * Number(i.quantityRequested) * (i.unitsPerPack || 1) : 0), 0);

  return (
    <Forest as="aside" aria-label={`Pedido ${supplierName(order)}`} data-testid="buy-desk">
      <div className="fx-desk-head">
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minWidth: 0 }}>
          <span className="fx-icon-tile">{draft ? <Send aria-hidden="true" /> : <Truck aria-hidden="true" />}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <h2>{supplierName(order)}</h2>
              <Chip tone={draft ? 'lime' : 'ghost'}>{draft ? 'Pronto para enviar' : 'A caminho'}</Chip>
            </div>
            <p className="fx-desk-meta">Pedido {order.orderNumber} · {order.itemCount} {order.itemCount === 1 ? 'item' : 'itens'}</p>
          </div>
        </div>
      </div>
      <div className="fx-desk-steps">
        <StepTrack steps={draft ? [
          { label: 'Montado', hint: 'Pelo Tino ou por você', state: 'done' },
          { label: 'Revisar', hint: 'Quantidades e custo', state: 'now' },
          { label: 'Enviar ao fornecedor', hint: 'WhatsApp, e-mail ou PDF', state: 'next' },
        ] : [
          { label: 'Montado', state: 'done' },
          { label: 'Enviado', hint: sinceLabel(order.sentAt), state: 'done' },
          { label: 'Receber e conferir', hint: 'Quando a mercadoria chegar', state: 'now' },
        ]} />
      </div>
      {err && <p role="alert" className="fx-chip red" style={{ whiteSpace: 'normal', marginTop: 12 }}>{err}</p>}
      <div className="fx-items" role="list" aria-label="Itens do pedido" style={{ marginTop: 14 }}>
        {items.length === 0 && <p className="fx-white" style={{ margin: 0 }}>Pedido sem itens. Adicione produtos no pedido completo.</p>}
        {items.map((i) => (
          <div key={i.id} role="listitem" className="fx-item">
            <Thumb name={i.productName} src={i.imageUrl} size={46} />
            <div style={{ minWidth: 0 }}>
              <div className="fx-item-name">{i.productName}</div>
              <div className="fx-item-detail">{formatMoney(i.unitCost)} por {i.unitType.toLowerCase()}{i.marginPercent != null ? ` · margem ${Math.round(Number(i.marginPercent))}%` : ''}</div>
            </div>
            <div className="fx-item-val"><span>Subtotal</span><b>{formatMoney(i.subtotal)}</b></div>
            <div className="ctl" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {draft ? (
                <>
                  <span className="fx-stepper">
                    <button type="button" aria-label={`Menos ${i.productName}`} disabled={busy === i.id || i.quantityRequested <= 1} onClick={() => setQty(i.id, Number(i.quantityRequested) - 1)}><Minus size={16} /></button>
                    <b className="fx-num" aria-live="polite">{busy === i.id ? '…' : Number(i.quantityRequested)}</b>
                    <button type="button" aria-label={`Mais ${i.productName}`} disabled={busy === i.id} onClick={() => setQty(i.id, Number(i.quantityRequested) + 1)}><Plus size={16} /></button>
                  </span>
                  <button type="button" className="fx-btn ghost small" aria-label={`Tirar ${i.productName}`} disabled={busy === i.id} onClick={() => remove(i.id)}><Trash2 aria-hidden="true" /></button>
                </>
              ) : <Chip tone="ghost">{Number(i.quantityRequested)} {i.unitType.toLowerCase()}</Chip>}
            </div>
          </div>
        ))}
      </div>
      <div className="fx-desk-bottom">
        <div className="fx-white">
          {draft ? (
            sending ? (
              <OrderSendOptions order={order} marketId={marketId} markAsSent onSent={(u) => { setOrder(u); setSending(false); onChanged(); }} onCancel={() => setSending(false)} />
            ) : (
              <>
                <h3>Tudo certo com o pedido?</h3>
                <small>Escolher o canal já envia e marca o pedido como enviado.</small>
                <div className="fx-actions" style={{ marginTop: 14 }}>
                  <button type="button" className="fx-btn dark" disabled={items.length === 0} onClick={() => setSending(true)}><Send aria-hidden="true" />Enviar ao fornecedor</button>
                  <button type="button" className="fx-btn ghost" onClick={() => onOpen(order)}><ExternalLink aria-hidden="true" />Pedido completo</button>
                </div>
              </>
            )
          ) : (
            <>
              <h3>A mercadoria chegou?</h3>
              <small>Registre o que veio. A diferença vira aviso ao fornecedor.</small>
              <div className="fx-actions" style={{ marginTop: 14 }}>
                <button type="button" className="fx-btn dark" onClick={() => onReceive(order)}><PackageCheck aria-hidden="true" />Registrar entrega</button>
                <button type="button" className="fx-btn ghost" onClick={() => onOpen(order)}><ExternalLink aria-hidden="true" />Pedido completo</button>
              </div>
            </>
          )}
        </div>
        <div className="fx-impact">
          <h3><ClipboardList size={18} aria-hidden="true" />Valor do pedido</h3>
          <span className="fx-money fx-num">{formatMoney(order.totalValue)}</span>
          <p>{margin > 0 ? `Margem esperada de ${formatMoney(margin)} na revenda.` : 'O custo vem da última compra deste fornecedor.'}</p>
        </div>
      </div>
    </Forest>
  );
};

/* ── Lista de compras sem pedido ── */
const ListPanel: React.FC<{ items: ShoppingListItem[]; onOrder: (ids: string[]) => void; onGoList: () => void }> = ({ items, onOrder, onGoList }) => {
  const [off, setOff] = useState<Set<string>>(new Set());
  const chosen = items.filter((i) => !off.has(i.id));
  return (
    <Forest as="aside" aria-label="Lista de compras">
      <PanelTitle icon={ListChecks} title="Na lista, sem pedido" sub="Produtos que você ou o Tino anotaram para comprar" />
      <div className="fx-items" role="list" aria-label="Produtos da lista" style={{ marginTop: 18 }}>
        {items.slice(0, 12).map((i) => (
          <div key={i.id} role="listitem" className={`fx-item with-check ${off.has(i.id) ? 'off' : ''}`}>
            <input type="checkbox" className="fx-check" checked={!off.has(i.id)} aria-label={`Incluir ${i.name}`}
              onChange={() => setOff((s) => { const n = new Set(s); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })} />
            <Thumb name={i.name || ''} src={i.imageUrl} size={46} />
            <div style={{ minWidth: 0 }}>
              <div className="fx-item-name">{i.name}</div>
              <div className="fx-item-detail">{i.reasonSummary || 'Anotado na lista'}</div>
            </div>
            <div className="fx-item-val"><span>Comprar</span><b>{Number(i.quantityTarget || 1)} un.</b></div>
          </div>
        ))}
      </div>
      <div className="fx-white" style={{ marginTop: 14 }}>
        <div className="fx-actions">
          <button type="button" className="fx-btn dark" disabled={chosen.length === 0} onClick={() => onOrder(chosen.map((i) => i.productId))}>
            <ClipboardList aria-hidden="true" />Montar pedido com {chosen.length === 1 ? '1 produto' : `${chosen.length} produtos`}
          </button>
          <button type="button" className="fx-btn ghost" onClick={onGoList}><ListChecks aria-hidden="true" />Abrir a lista</button>
          <Link to="/app/produtos" className="fx-btn ghost">Adicionar produto</Link>
        </div>
      </div>
    </Forest>
  );
};

export default BuyDesk;
