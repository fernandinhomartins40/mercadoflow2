import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ShieldCheck, Sparkles, X } from 'lucide-react';
import { Forest, PanelTitle, Thumb } from '../flow/Flow';
import DecisionFeedback from '../intelligence/DecisionFeedback';
import { goesToOrder } from '../intelligence/RecommendationCard';
import { useRecommendationDecision } from '../../hooks/useRecommendationDecision';
import { marketService } from '../../services/market.service';
import { formatMoney } from '../../utils/formatters';
import type { RecommendationItem } from '../../types/analytics.types';

const LIMIT = 5;

/**
 * O que a análise sugere comprar, dentro de Comprar (JUNTAR): o comprador não
 * precisa ir à Hoje para ver as compras sugeridas nem montar o pedido à mão —
 * "Pôr no pedido" já coloca o produto no rascunho do fornecedor.
 */
const PurchaseSuggestions: React.FC<{ marketId: string; onOrdersChanged: () => void }> = ({ marketId, onOrdersChanged }) => {
  const [suggestions, setSuggestions] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const recs: RecommendationItem[] = await marketService.getPendingRecommendations(marketId);
      setSuggestions((recs || []).filter(goesToOrder));
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => { load(); }, [load]);

  const reload = useCallback(async () => { await load(); onOrdersChanged(); }, [load, onOrdersChanged]);
  const { deciding, feedback, setFeedback, error, decide } = useRecommendationDecision(marketId, suggestions, reload);

  if (loading || (suggestions.length === 0 && !feedback)) return null;

  const shown = suggestions.slice(0, LIMIT);
  const total = suggestions.reduce((sum, r) => sum + Number(r.expectedImpactValue || 0), 0);

  return (
    <div className="fx-split wide-left">
      <section aria-labelledby="purchase-suggestions-title" className="fx-card fx-card-pad">
        <PanelTitle icon={Sparkles} title={<span id="purchase-suggestions-title">O que comprar</span>}
          sub={`${suggestions.length === 1 ? '1 sugestão' : `${suggestions.length} sugestões`} pelas vendas da loja`} />

        {feedback ? <div style={{ marginTop: 12 }}><DecisionFeedback feedback={feedback} marketId={marketId} onChange={setFeedback} onUndone={reload} /></div> : null}
        {error ? <p role="alert" className="fx-chip red" style={{ marginTop: 12, whiteSpace: 'normal' }}>{error}</p> : null}

        <ul className="fx-stack" style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, gap: 8 }}>
          {shown.map((rec) => (
            <li key={rec.id} className="fx-row" style={{ flexWrap: 'wrap', cursor: 'default' }}>
              <Thumb name={rec.productName || rec.title} src={rec.productImage} size={48} />
              <span className="min-w-0 flex-1" style={{ flexBasis: 220 }}>
                <b className="block" style={{ fontSize: 15.5 }}>{rec.title}</b>
                <span className="block text-[13.5px]" style={{ color: 'var(--fx-muted)' }}>{rec.rationale}</span>
              </span>
              {rec.parameters?.quantidade ? <span className="fx-chip gray fx-num">{rec.parameters.quantidade} un.</span> : null}
              {rec.expectedImpactValue ? <b className="fx-num" style={{ fontSize: 15, whiteSpace: 'nowrap' }}>{formatMoney(rec.expectedImpactValue)}</b> : null}
              <span className="flex shrink-0 gap-2">
                <button type="button" disabled={deciding === rec.id} onClick={() => decide(rec.id, 'ACEITA')} className="fx-btn dark small">
                  <Check aria-hidden="true" />{deciding === rec.id ? 'Pondo...' : 'Pôr no pedido'}
                </button>
                <button type="button" disabled={deciding === rec.id} onClick={() => decide(rec.id, 'REJEITADA')} aria-label={`Não comprar: ${rec.title}`} className="fx-btn ghost small">
                  <X aria-hidden="true" /><span className="sm:sr-only">Não comprar</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
        {suggestions.length > LIMIT ? (
          <Link to="/app/inteligencia" className="fx-btn ghost" style={{ marginTop: 12 }}>Ver todas as {suggestions.length} sugestões</Link>
        ) : null}
      </section>

      <Forest as="aside" aria-label="Antes de comprar">
        <PanelTitle icon={ShieldCheck} title="Antes de comprar" sub="O que o Jev já conferiu por você" />
        <div className="fx-white" style={{ marginTop: 18 }}>
          <small>Impacto das sugestões</small>
          <span style={{ display: 'block', marginTop: 6 }}><span className="fx-money" style={{ fontSize: 28 }}>{formatMoney(total)}</span></span>
        </div>
        <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'grid', gap: 12 }}>
          {[
            ['Venda das últimas semanas', 'A quantidade cobre o giro até a próxima entrega.'],
            ['Último preço pago', 'Vem do fornecedor da última compra.'],
            ['Você revisa antes de enviar', 'Pôr no pedido só cria o rascunho.'],
          ].map(([t, d]) => (
            <li key={t} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span className="fx-chip lime" style={{ padding: 4, borderRadius: 999 }}><Check size={14} aria-hidden="true" /></span>
              <span><b style={{ display: 'block', fontSize: 15 }}>{t}</b><small>{d}</small></span>
            </li>
          ))}
        </ul>
      </Forest>
    </div>
  );
};

export default PurchaseSuggestions;
