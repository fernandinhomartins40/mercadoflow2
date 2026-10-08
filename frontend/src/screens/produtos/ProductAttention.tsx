import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, History, ListChecks, MessageCircleQuestion, Package, Plus, Tag, TrendingDown, TrendingUp } from 'lucide-react';
import { ActionHub, Card, Chip, Forest, PanelTitle, Thumb, type HubAction, PagedBox, usePaged, usePaneFill } from '../../components/flow/Flow';
import { useShoppingList } from '../../hooks/useShoppingList';
import { formatDecimal, formatMoney } from '../../utils/formatters';
import type { ProductPerformance } from '../../types/analytics.types';

/**
 * Produtos que pedem atenção hoje, um de cada vez: o que está acabando, o que
 * passou a vender menos e o que disparou. Cada um chega com o motivo e a ação
 * que faz sentido para ele.
 */

export type Why = 'acabando' | 'caindo' | 'subindo' | 'parado';
export interface AttentionItem { why: Why; p: ProductPerformance }

const WHY: Record<Why, { chip: string; tone: 'red' | 'amber' | 'lime'; icon: React.ElementType }> = {
  acabando: { chip: 'Acabando', tone: 'red', icon: Package },
  caindo: { chip: 'Vendendo menos', tone: 'amber', icon: TrendingDown },
  subindo: { chip: 'Em alta', tone: 'lime', icon: TrendingUp },
  parado: { chip: 'Parado', tone: 'amber', icon: Package },
};

export const attentionList = (d?: { replenishmentCandidates?: ProductPerformance[]; slowMovers?: ProductPerformance[]; topProducts?: ProductPerformance[]; lowTurnoverProducts?: ProductPerformance[] } | null): AttentionItem[] => {
  const seen = new Set<string>();
  const out: AttentionItem[] = [];
  const add = (why: Why, list?: ProductPerformance[]) => (list || []).forEach((p) => {
    if (seen.has(p.productId)) return;
    seen.add(p.productId);
    out.push({ why, p });
  });
  add('acabando', (d?.replenishmentCandidates || []).slice(0, 6));
  add('caindo', (d?.slowMovers || []).filter((p) => Number(p.revenueTrendPercentage || 0) < -10 && Number(p.revenue || 0) > 0).slice(0, 6));
  add('subindo', (d?.topProducts || []).filter((p) => Number(p.revenueTrendPercentage || 0) > 15).slice(0, 4));
  add('parado', (d?.lowTurnoverProducts || []).filter((p) => Number(p.revenue || 0) > 0).slice(0, 6));
  return out;
};

const trendOf = (p: ProductPerformance) => Number(p.revenueTrendPercentage || 0);
const weekQty = (p: ProductPerformance) => Math.max(1, Math.round(Number(p.salesVelocity || 0) * 7));

const advice = (it: AttentionItem) => {
  const v = formatDecimal(Number(it.p.salesVelocity || 0), 1);
  if (it.why === 'acabando') return `Vende ${v} por dia. Reponha antes que falte: uma semana de venda são ${weekQty(it.p)} unidades.`;
  if (it.why === 'caindo') return `A receita caiu ${formatDecimal(Math.abs(trendOf(it.p)), 0)}% contra o período anterior. Vale entender o porquê antes de comprar de novo; uma promoção pode girar o que está parado.`;
  if (it.why === 'parado') return `Gira pouco: ${v} por dia. Antes de comprar de novo, veja se uma promoção ou outro lugar na gôndola faz ele andar.`;
  return `A receita subiu ${formatDecimal(trendOf(it.p), 0)}%. Garanta estoque para não perder a venda do pico.`;
};

const ProductAttention: React.FC<{ items: AttentionItem[] }> = ({ items }) => {
  const { addItem, productIds } = useShoppingList();
  const [selected, setSelected] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const current = useMemo(() => items.find((i) => i.p.productId === selected) ?? items[0] ?? null, [items, selected]);
  // Lista com a altura do painel ao lado: quantas linhas couberem, paginador no rodapé.
  const { rows, fill } = usePaneFill(80, 6);
  const paged = usePaged(items, rows, items.length);

  if (items.length === 0) {
    return (
      <Forest style={{ textAlign: 'center', padding: 'clamp(28px, 4vw, 48px)' }}>
        <span className="fx-brief-orb" style={{ margin: '0 auto' }} aria-hidden="true"><Check /></span>
        <h2 className="fx-panel-title" style={{ marginTop: 14 }}>Nenhum produto fora do normal</h2>
        <p className="fx-panel-sub" style={{ maxWidth: 520, margin: '6px auto 0' }}>
          Quando algo começar a acabar, cair ou disparar, aparece aqui com o motivo. Veja todos em Desempenho.
        </p>
      </Forest>
    );
  }

  const inList = (id: string) => productIds.has(id) || added.has(id);
  const put = async (p: ProductPerformance) => {
    await addItem({ productId: p.productId, quantityTarget: weekQty(p), sourceTag: 'PRODUTOS', reasonSummary: `Repor ${p.name}: uma semana de venda.` });
    setAdded((s) => new Set(s).add(p.productId));
  };

  const actions = (it: AttentionItem): HubAction[] => {
    const ask: HubAction = { label: it.why === 'caindo' ? 'Por que caiu?' : 'Perguntar ao Tino', icon: MessageCircleQuestion,
      to: `/app/perguntar?q=${encodeURIComponent(it.why === 'caindo' ? `Por que ${it.p.name} está vendendo menos?` : `Como está vendendo ${it.p.name}?`)}` };
    const history: HubAction = { label: 'Ver histórico', icon: History, to: `/app/produtos/${it.p.productId}` };
    if (it.why === 'caindo' || it.why === 'parado') return [ask, { label: 'Promover', icon: Tag, to: '/app/decidir?filtro=promover' }, history];
    return [
      inList(it.p.productId) ? { label: 'Já está na lista', icon: ListChecks, to: '/app/lista-compras' } : { label: `Pôr ${weekQty(it.p)} un. na lista`, icon: Plus, onClick: () => { void put(it.p); } },
      history, ask,
    ];
  };

  return (
    <div className="fx-split even panes" style={{ '--pane-h': '640px' } as React.CSSProperties}>
      <Card as="section" aria-label="Pedem atenção" className="fx-col">
        <PanelTitle title="Pedem atenção" sub="Acabando, vendendo menos ou em alta" />
        <PagedBox page={paged.page} pages={paged.pages} total={paged.total} size={paged.size} onPage={paged.setPage} label="produtos" fill={fill}>
        <ul className="fx-stack" style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, gap: 8 }}>
          {paged.slice.map((it) => {
            const on = current?.p.productId === it.p.productId;
            const w = WHY[it.why];
            const t = trendOf(it.p);
            return (
              <li key={it.p.productId}>
                <button type="button" className={`fx-row ${on ? 'selected' : ''}`} aria-current={on || undefined}
                  onClick={() => {
                    setSelected(it.p.productId);
                    if (window.innerWidth < 1100) requestAnimationFrame(() => document.getElementById('product-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                  }}>
                  <Thumb name={it.p.name || ''} src={it.p.imageUrl} size={46} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <b style={{ display: 'block', fontSize: 15.5 }}>{it.p.name}</b>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 3 }}>
                      <Chip tone={w.tone}>{w.chip}</Chip>
                      <span className="fx-muted" style={{ fontSize: 13 }}>{formatDecimal(Number(it.p.salesVelocity || 0), 1)} por dia</span>
                    </span>
                  </span>
                  <b className="fx-num" style={{ fontSize: 15, color: t < -3 ? 'var(--fx-red)' : t > 3 ? 'var(--fx-green)' : 'var(--fx-muted)', whiteSpace: 'nowrap' }}>
                    {t > 0 ? '+' : ''}{formatDecimal(t, 0)}%
                  </b>
                </button>
              </li>
            );
          })}
        </ul>
        </PagedBox>
      </Card>

      {current && (
        <div id="product-panel" className="fx-sticky" style={{ minWidth: 0, scrollMarginTop: 80 }}>
          <Forest as="aside" aria-label={`Produto ${current.p.name}`}>
            <PanelTitle icon={WHY[current.why].icon} title="Por que ele está aqui" sub="O que as vendas dizem sobre o produto" />
            <div className="flex items-center gap-4" style={{ marginTop: 20 }}>
              <Thumb name={current.p.name || ''} src={current.p.imageUrl} size={84} />
              <div className="min-w-0">
                <Chip tone={WHY[current.why].tone}>{WHY[current.why].chip}</Chip>
                <h3 style={{ margin: '6px 0 0', fontSize: 'clamp(20px, 2vw, 28px)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.12 }}>{current.p.name}</h3>
                <p className="fx-muted" style={{ margin: '4px 0 0' }}>{current.p.category || 'Sem categoria'}</p>
              </div>
            </div>
            <p className="fx-desk-lead">{advice(current)}</p>
            <div className="fx-kpis" style={{ marginTop: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              <div className="fx-kpi"><span>Receita em 90 dias</span><b style={{ fontSize: 22 }}>{formatMoney(current.p.revenue)}</b></div>
              <div className="fx-kpi"><span>Vende por dia</span><b style={{ fontSize: 22 }}>{formatDecimal(Number(current.p.salesVelocity || 0), 1)}</b><small>unidades</small></div>
              <div className="fx-kpi"><span>Tendência</span><b style={{ fontSize: 22, color: trendOf(current.p) < -3 ? 'var(--fx-red)' : 'var(--fx-green)' }}>{trendOf(current.p) > 0 ? '+' : ''}{formatDecimal(trendOf(current.p), 1)}%</b></div>
            </div>
            <div style={{ marginTop: 22 }}>
              <ActionHub icon={WHY[current.why].icon} onForest label="O que fazer com este produto" actions={actions(current)} />
            </div>
            {inList(current.p.productId) && current.why !== 'caindo' && (
              <p style={{ margin: '14px 0 0', color: 'var(--fx-lime)', fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
                <Check size={18} aria-hidden="true" />Na lista de compras. <Link to="/app/lista-compras" style={{ color: 'inherit' }}>Montar o pedido</Link>
              </p>
            )}
          </Forest>
        </div>
      )}
    </div>
  );
};

export default ProductAttention;
