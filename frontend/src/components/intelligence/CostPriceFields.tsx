import React from 'react';
import { AlertTriangle, FileText } from 'lucide-react';
import { COST_SOURCE_LABEL, marginOf, parseMoney } from '../../services/decisionInputs.service';
import { brl } from '../flow/Flow';

/**
 * Custo e preço da ação lado a lado, com a margem calculada na hora e o alerta
 * de venda abaixo do custo. Nenhuma decisão de promover, liquidar ou comprar
 * passa sem estes dois números (docs/PROPOSTA-DECISOES-E-INTEGRACAO.md).
 */
const CostPriceFields: React.FC<{
  name: string;
  cost: string;
  onCost: (v: string) => void;
  /** De onde veio o custo já preenchido (nota, ERP, você). */
  costSource?: string | null;
  price?: string;
  onPrice?: (v: string) => void;
  priceLabel?: string;
  /** Preço de hoje, para mostrar o desconto que o preço da ação dá. */
  currentPrice?: number | null;
  stock?: string;
  onStock?: (v: string) => void;
  /** Nota de entrada não conferida com este produto (o custo está lá). */
  pendingNfe?: { issuedAt: string; supplier: string } | null;
  compact?: boolean;
}> = ({ name, cost, onCost, costSource, price, onPrice, priceLabel = 'Preço da ação', currentPrice, stock, onStock, pendingNfe, compact }) => {
  const c = parseMoney(cost);
  const p = price != null ? parseMoney(price) : null;
  const margin = marginOf(c, p);
  const below = c != null && p != null && p < c;
  const discount = currentPrice && p ? (1 - p / currentPrice) * 100 : null;
  const sourceText = costSource && cost && parseMoney(cost) != null ? COST_SOURCE_LABEL[costSource] ?? null : null;

  return (
    <div className="fx-stack" style={{ gap: 8 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="fx-field" style={{ flex: compact ? '0 0 auto' : '1 1 120px' }}>
          Custo (R$/un.)
          <input className="fx-input fx-num" inputMode="decimal" value={cost} placeholder="0,00" style={{ width: compact ? 100 : '100%', textAlign: 'right' }}
            aria-label={`Custo de ${name}`} aria-invalid={c == null || undefined} onChange={(e) => onCost(e.target.value)} />
        </label>
        {onPrice && (
          <label className="fx-field" style={{ flex: compact ? '0 0 auto' : '1 1 120px' }}>
            {priceLabel} (R$)
            <input className="fx-input fx-num" inputMode="decimal" value={price ?? ''} placeholder="0,00" style={{ width: compact ? 100 : '100%', textAlign: 'right' }}
              aria-label={`${priceLabel} de ${name}`} aria-invalid={p == null || below || undefined} onChange={(e) => onPrice(e.target.value)} />
          </label>
        )}
        {onStock && (
          <label className="fx-field" style={{ flex: compact ? '0 0 auto' : '1 1 100px' }}>
            Estoque hoje (un.)
            <input className="fx-input fx-num" inputMode="numeric" value={stock ?? ''} placeholder="opcional" style={{ width: compact ? 90 : '100%', textAlign: 'right' }}
              aria-label={`Estoque de ${name}`} onChange={(e) => onStock(e.target.value)} />
          </label>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
        {sourceText && <span className="fx-muted">Custo {sourceText}.</span>}
        {c == null && !pendingNfe && <span className="fx-muted">Sem custo registrado: digite o da última compra.</span>}
        {c == null && pendingNfe && (
          <span className="fx-muted" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <FileText size={14} aria-hidden="true" />O custo está na nota de {pendingNfe.supplier || 'um fornecedor'} que chegou e não foi conferida no Confere.
          </span>
        )}
        {onPrice && margin != null && !below && (
          <b style={{ color: margin < 5 ? 'var(--fx-amber)' : 'var(--fx-green)' }}>
            Margem {margin.toFixed(1).replace('.', ',')}%{discount != null && discount > 0.5 ? ` · ${discount.toFixed(0)}% abaixo de ${brl(currentPrice!)}` : ''}
          </b>
        )}
        {below && (
          <span role="alert" className="fx-chip red" style={{ whiteSpace: 'normal' }}>
            <AlertTriangle size={14} aria-hidden="true" />Abaixo do custo: perde {brl(c! - p!)} por unidade
          </span>
        )}
      </div>
    </div>
  );
};

export default CostPriceFields;
