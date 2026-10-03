import React, { useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Thumb } from '../flow/Flow';
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

  return (
    <article className="fx-card fx-card-pad flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Thumb name={rec.productName || rec.title} src={rec.productImage} size={52} />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="fx-chip lime w-fit">
            {ACTION_LABEL[rec.actionType] || rec.actionType}
          </span>
          <p className="text-[16px] font-bold" style={{ color: 'var(--fx-ink)', margin: 0 }}>
            {rec.title}
          </p>
          {rec.rationale ? (
            <p className="text-[14px] leading-relaxed" style={{ color: 'var(--fx-muted)', margin: 0 }}>
              {rec.rationale}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: 'var(--text-soft)' }}>
        {rec.expectedImpactValue ? (
          <span>Impacto estimado <span className="fx-money" style={{ fontSize: 15 }}>{money(rec.expectedImpactValue)}</span></span>
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
          className="fx-btn dark"
        >
          <Check className="h-4 w-4" /> {goesToOrder(rec) ? 'Aceitar e pôr no pedido' : 'Aceitar'}
        </button>
        <button
          type="button"
          disabled={deciding}
          onClick={() => onDecide(rec.id, 'REJEITADA')}
          className="fx-btn ghost"
        >
          <X className="h-4 w-4" /> Não faz sentido
        </button>
      </div>
    </article>
  );
};

export default RecommendationCard;
