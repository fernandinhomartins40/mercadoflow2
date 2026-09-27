import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Sparkles, X } from 'lucide-react';
import ProductImage from '../product/ProductImage';
import DecisionFeedback from '../intelligence/DecisionFeedback';
import { goesToOrder } from '../intelligence/RecommendationCard';
import { useRecommendationDecision } from '../../hooks/useRecommendationDecision';
import { marketService } from '../../services/market.service';
import { formatMoney } from '../../utils/formatters';
import type { RecommendationItem } from '../../types/analytics.types';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';
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
  return (
    <section
      aria-labelledby="purchase-suggestions-title"
      className="flex flex-col gap-3 rounded-2xl p-4 sm:p-5"
      style={{ border: '1px solid var(--border-success)', background: 'var(--surface-success)' }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="purchase-suggestions-title" className="flex items-center gap-2 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          <Sparkles className="h-4 w-4" style={{ color: 'var(--brand-700)' }} aria-hidden="true" />
          Sugestões para comprar
        </h2>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {suggestions.length === 1 ? '1 sugestão' : `${suggestions.length} sugestões`} pelas vendas da loja
        </span>
      </div>

      {feedback ? (
        <DecisionFeedback feedback={feedback} marketId={marketId} onChange={setFeedback} onUndone={reload} />
      ) : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}

      <ul className="flex flex-col gap-2">
        {shown.map((rec) => (
          <li
            key={rec.id}
            className="flex flex-col gap-3 rounded-xl p-3 sm:flex-row sm:items-center"
            style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--surface-soft)' }}>
                <ProductImage src={rec.productImage} alt="" className="h-full w-full object-contain" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{rec.title}</span>
                <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                  {rec.rationale ? `${rec.rationale} ` : ''}
                  {rec.expectedImpactValue ? `Impacto ${formatMoney(rec.expectedImpactValue)}.` : ''}
                </span>
              </span>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={deciding === rec.id}
                onClick={() => decide(rec.id, 'ACEITA')}
                className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50 sm:flex-none ${FOCUS}`}
                style={{ background: 'var(--brand-700)' }}
              >
                <Check className="h-4 w-4" aria-hidden="true" /> {deciding === rec.id ? 'Pondo...' : 'Pôr no pedido'}
              </button>
              <button
                type="button"
                disabled={deciding === rec.id}
                onClick={() => decide(rec.id, 'REJEITADA')}
                aria-label={`Não comprar: ${rec.title}`}
                className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium disabled:opacity-50 ${FOCUS}`}
                style={{ border: '1px solid var(--border-strong)', color: 'var(--text-muted)', background: 'var(--surface-base)' }}
              >
                <X className="h-4 w-4" aria-hidden="true" /> <span className="sm:sr-only">Não comprar</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
      {suggestions.length > LIMIT ? (
        <Link to="/app/inteligencia" className={`self-start text-sm font-semibold no-underline ${FOCUS}`} style={{ color: 'var(--brand-700)' }}>
          Ver todas as {suggestions.length} sugestões
        </Link>
      ) : null}
    </section>
  );
};

export default PurchaseSuggestions;
