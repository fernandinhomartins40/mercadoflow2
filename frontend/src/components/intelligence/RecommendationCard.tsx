import React, { useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import ProductImage from '../product/ProductImage';
import type { RecommendationItem } from '../../types/analytics.types';

const money = (v?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));

export const ACTION_LABEL: Record<string, string> = {
  COMPRAR: 'Comprar',
  PROMOVER: 'Promover',
  LIQUIDAR: 'Liquidar',
  AJUSTAR_PRECO: 'Ajustar preço',
  REPOSICIONAR: 'Reposicionar',
  INVESTIGAR: 'Investigar',
};

const TONE = { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' };

/** Compra com quantidade: aceitar já coloca o produto no rascunho de pedido (D-011). */
export const goesToOrder = (rec: RecommendationItem) =>
  rec.actionType === 'COMPRAR'
  && rec.parameters?.acao !== 'reduzir_proxima_compra'
  && Number(rec.parameters?.quantidade) > 0;

/* ─── Card de recomendação: o que fazer, por quê e com que confiança ─── */
const RecommendationCard: React.FC<{
  rec: RecommendationItem;
  onDecide: (id: string, decision: 'ACEITA' | 'REJEITADA') => void;
  deciding: boolean;
}> = ({ rec, onDecide, deciding }) => {
  const [showTrace, setShowTrace] = useState(false);
  const tone = TONE;

  return (
    <article
      className="flex flex-col gap-3 rounded-xl p-4"
      style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}
    >
      <div className="flex items-start gap-3">
        {rec.productImage ? (
          <ProductImage
            src={rec.productImage}
            alt={rec.productName || ''}
            className="h-12 w-12 shrink-0 rounded-lg object-cover"
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className="w-fit rounded-full px-2 py-0.5 text-[0.68rem] font-semibold"
            style={{ background: tone.bg, color: tone.text, border: `1px solid ${tone.border}` }}
          >
            {ACTION_LABEL[rec.actionType] || rec.actionType}
          </span>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {rec.title}
          </p>
          {rec.rationale ? (
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-soft)' }}>
              {rec.rationale}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: 'var(--text-soft)' }}>
        {rec.expectedImpactValue ? (
          <span>Impacto estimado: <strong style={{ color: tone.text }}>{money(rec.expectedImpactValue)}</strong></span>
        ) : null}
        {rec.confidence != null ? (
          <span>Confiança: <strong>{Math.round(Number(rec.confidence) * 100)}%</strong></span>
        ) : null}
      </div>

      {/* O cálculo aberto é o que permite discordar com fundamento. */}
      {rec.calculationTrace ? (
        <div>
          <button
            type="button"
            onClick={() => setShowTrace((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium"
            style={{ color: 'var(--brand-700)' }}
          >
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform"
              style={{ transform: showTrace ? 'rotate(180deg)' : 'none' }}
            />
            Como chegamos nesse número
          </button>
          {showTrace ? (
            <pre
              className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg p-3 text-[0.7rem] leading-relaxed"
              style={{ background: 'var(--surface-muted)', color: 'var(--text-soft)' }}
            >
              {rec.calculationTrace}
            </pre>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row" style={{ borderColor: 'var(--border-soft)' }}>
        <button
          type="button"
          disabled={deciding}
          onClick={() => onDecide(rec.id, 'ACEITA')}
          className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 sm:w-auto"
          style={{ background: 'var(--brand-500)', color: '#fff' }}
        >
          <Check className="h-4 w-4" /> {goesToOrder(rec) ? 'Aceitar e pôr no pedido' : 'Aceitar'}
        </button>
        <button
          type="button"
          disabled={deciding}
          onClick={() => onDecide(rec.id, 'REJEITADA')}
          className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium disabled:opacity-50 sm:w-auto"
          style={{ border: '1px solid var(--border-soft)', color: 'var(--text-soft)' }}
        >
          <X className="h-4 w-4" /> Não faz sentido
        </button>
      </div>
    </article>
  );
};

export default RecommendationCard;
