import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, Loader2, Sparkles, X } from 'lucide-react';
import { Chip, Forest, PanelTitle, Thumb } from '../flow/Flow';
import { ACTION_LABEL, goesToOrder } from './RecommendationCard';
import { formatMoney } from '../../utils/formatters';
import type { RecommendationItem } from '../../types/analytics.types';
import CostPriceFields from './CostPriceFields';
import { NeighborhoodLine } from '../product/NeighborhoodPrice';
import { localPriceService, type LocalPriceSnapshot } from '../../services/localPrice.service';
import { decisionInputsService, moneyInput, parseMoney, type KnownInputs } from '../../services/decisionInputs.service';
import { confidenceLabel } from '../../utils/plain';

/** Promover, liquidar e comprar não se aceitam às cegas: custo e preço por item. */
export const needsInputs = (rec: RecommendationItem) =>
  ['PROMOVER', 'LIQUIDAR', 'COMPRAR'].includes(rec.actionType) && rec.parameters?.acao !== 'reduzir_proxima_compra';
const needsPrice = (rec: RecommendationItem) => rec.actionType === 'PROMOVER' || rec.actionType === 'LIQUIDAR';

/** Preço que vem sugerido: o já informado, o de liquidação, ou o atual com o desconto de referência. */
function suggestedPrice(rec: RecommendationItem): number | null {
  const p = rec.parameters ?? {};
  if (p.precoInformado != null) return Number(p.precoInformado);
  if (p.precoLiquidacao != null) return Number(p.precoLiquidacao);
  if (p.precoAtual != null && p.descontoPercent != null) return Math.round(Number(p.precoAtual) * (1 - Number(p.descontoPercent) / 100) * 100) / 100;
  return null;
}

/** A decisão aberta no painel floresta: o porquê, o número e o sim ou não. */
const RecommendationDesk: React.FC<{
  rec: RecommendationItem;
  marketId?: string | null;
  deciding: boolean;
  onDecide: (id: string, decision: 'ACEITA' | 'REJEITADA') => void;
}> = ({ rec, marketId, deciding, onDecide }) => {
  const [trace, setTrace] = useState(false);
  const inputs = !!marketId && needsInputs(rec);
  const productId = rec.productId || rec.parameters?.produtoId || null;
  const [known, setKnown] = useState<KnownInputs | null>(null);
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [nearby, setNearby] = useState<LocalPriceSnapshot | null>(null);

  useEffect(() => {
    setKnown(null); setProblem(null); setStock(''); setNearby(null);
    const p0 = rec.parameters ?? {};
    setCost(moneyInput(p0.custoInformado != null ? Number(p0.custoInformado) : null));
    setPrice(moneyInput(suggestedPrice(rec)));
    if (!inputs || !productId || !marketId) return;
    let alive = true;
    // Preço na vizinhança (só PR): ajuda a decidir o preço da ação. Sem dado, não aparece.
    localPriceService.products(marketId, [productId]).then(([n]) => { if (alive) setNearby(n ?? null); }).catch(() => undefined);
    decisionInputsService.known(marketId, [productId]).then(([k]) => {
      if (!alive || !k) return;
      setKnown(k);
      if (p0.custoInformado == null && k.unitCost != null) setCost(moneyInput(k.unitCost));
    }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.id, marketId]);

  const accept = async () => {
    if (!inputs || !marketId || !productId) { onDecide(rec.id, 'ACEITA'); return; }
    const c = parseMoney(cost);
    const p = needsPrice(rec) ? parseMoney(price) : null;
    const st = stock.trim() ? Number(stock.replace(',', '.')) : null;
    if (c == null || c <= 0) { setProblem('Informe o custo do produto: sem ele não dá para saber se a ação compensa.'); return; }
    if (needsPrice(rec) && (p == null || p <= 0)) { setProblem('Informe o preço que você vai praticar.'); return; }
    if (st != null && (!Number.isFinite(st) || st < 0)) { setProblem('Estoque inválido.'); return; }
    setProblem(null);
    setSaving(true);
    try {
      await decisionInputsService.save(marketId, [{ productId, unitCost: c, actionPrice: p, stockUnits: st }], rec.id);
      onDecide(rec.id, 'ACEITA');
    } catch {
      setProblem('Não foi possível guardar custo e preço agora.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Forest as="aside" aria-label="Decisão selecionada">
      <PanelTitle icon={Sparkles} title="Por trás da decisão" sub="O que o Tino viu nas suas vendas" />
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', margin: '20px 0 0' }}>
        <Thumb name={rec.productName || rec.title} src={rec.productImage} size={64} />
        <div style={{ minWidth: 0 }}>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <Chip tone="lime">{ACTION_LABEL[rec.actionType] || rec.actionType}</Chip>
            {(() => { const c = confidenceLabel(rec.confidence); return c ? <Chip tone={c.tone}>{c.text}</Chip> : null; })()}
          </span>
          <h3 style={{ margin: 0, fontSize: 'clamp(20px, 2vw, 26px)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.15 }}>{rec.title}</h3>
        </div>
      </div>
      {rec.rationale && <p style={{ margin: '16px 0 0', fontSize: 15.5, lineHeight: 1.55, color: 'var(--fx-on-forest)' }}>{rec.rationale}</p>}
      <div className="fx-white" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>
            <small>{rec.actionType === 'COMPRAR' && rec.parameters?.acao !== 'reduzir_proxima_compra' ? 'Margem que esta compra traz' : 'Ganho estimado'}</small>
            <span style={{ display: 'block', marginTop: 4 }}><span className="fx-money" style={{ fontSize: 26 }}>{formatMoney(rec.expectedImpactValue)}</span></span>
          </span>
          {goesToOrder(rec) && rec.parameters?.valorEstimado != null && (
            <span style={{ textAlign: 'right' }}>
              <small>Investimento</small>
              <b className="fx-num" style={{ display: 'block', fontSize: 18 }}>{formatMoney(Number(rec.parameters.valorEstimado))}</b>
            </span>
          )}
          {goesToOrder(rec) && <small style={{ maxWidth: 220 }}>Aceitar já coloca {Math.round(Number(rec.parameters?.quantidade)).toLocaleString('pt-BR')} un. no pedido do fornecedor.</small>}
        </div>
        {rec.calculationTrace && (
          <>
            <button type="button" className="fx-btn ghost small" style={{ marginTop: 14 }} aria-expanded={trace} onClick={() => setTrace((v) => !v)}>
              <ChevronDown aria-hidden="true" style={{ transform: trace ? 'rotate(180deg)' : 'none' }} />Como chegamos nesse número
            </button>
            {trace && <pre style={{ margin: '10px 0 0', whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.55, background: 'var(--fx-card-2)', borderRadius: 12, padding: 12, color: 'var(--fx-ink-2)' }}>{rec.calculationTrace}</pre>}
          </>
        )}
        {inputs && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--fx-line)' }}>
            <b style={{ display: 'block', marginBottom: 8, fontSize: 14.5 }}>
              {needsPrice(rec) ? 'Quanto custa e por quanto vai vender' : 'Quanto custa'}
            </b>
            <CostPriceFields name={rec.productName || rec.title} cost={cost} onCost={setCost} costSource={known?.costSource}
              price={needsPrice(rec) ? price : undefined} onPrice={needsPrice(rec) ? setPrice : undefined}
              priceLabel={rec.actionType === 'LIQUIDAR' ? 'Preço de liquidação' : 'Preço da promoção'}
              currentPrice={rec.parameters?.precoAtual != null ? Number(rec.parameters.precoAtual) : known?.averageSalePrice}
              stock={stock} onStock={rec.actionType === 'COMPRAR' ? undefined : setStock} pendingNfe={known?.pendingNfe} />
            <NeighborhoodLine snapshot={nearby} />
            {problem && <p role="alert" style={{ color: 'var(--fx-red)', margin: '8px 0 0', fontSize: 14 }}>{problem}</p>}
          </div>
        )}
        <div className="fx-actions" style={{ marginTop: 16 }}>
          <button type="button" className="fx-btn dark" disabled={deciding || saving} onClick={accept}>
            {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}{goesToOrder(rec) ? 'Aceitar e pôr no pedido' : 'Aceitar'}
          </button>
          <button type="button" className="fx-btn ghost" disabled={deciding} onClick={() => onDecide(rec.id, 'REJEITADA')}>
            <X aria-hidden="true" />Não faz sentido
          </button>
        </div>
      </div>
    </Forest>
  );
};

export default RecommendationDesk;
