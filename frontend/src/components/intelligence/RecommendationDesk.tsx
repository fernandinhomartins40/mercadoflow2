import React, { useState } from 'react';
import { Check, ChevronDown, Sparkles, X } from 'lucide-react';
import { Chip, Forest, PanelTitle, Thumb } from '../flow/Flow';
import { ACTION_LABEL, goesToOrder } from './RecommendationCard';
import { formatMoney } from '../../utils/formatters';
import type { RecommendationItem } from '../../types/analytics.types';

/** A decisão aberta no painel floresta: o porquê, o número e o sim ou não. */
const RecommendationDesk: React.FC<{
  rec: RecommendationItem;
  deciding: boolean;
  onDecide: (id: string, decision: 'ACEITA' | 'REJEITADA') => void;
}> = ({ rec, deciding, onDecide }) => {
  const [trace, setTrace] = useState(false);
  return (
    <Forest as="aside" aria-label="Decisão selecionada">
      <PanelTitle icon={Sparkles} title="Por trás da decisão" sub="O que o Tino viu nas suas vendas" />
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', margin: '20px 0 0' }}>
        <Thumb name={rec.productName || rec.title} src={rec.productImage} size={64} />
        <div style={{ minWidth: 0 }}>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <Chip tone="lime">{ACTION_LABEL[rec.actionType] || rec.actionType}</Chip>
            {rec.confidence != null && <Chip tone="ghost">Certeza {Math.round(Number(rec.confidence) * 100)}%</Chip>}
          </span>
          <h3 style={{ margin: 0, fontSize: 'clamp(20px, 2vw, 26px)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.15 }}>{rec.title}</h3>
        </div>
      </div>
      {rec.rationale && <p style={{ margin: '16px 0 0', fontSize: 15.5, lineHeight: 1.55, color: 'var(--fx-on-forest)' }}>{rec.rationale}</p>}
      <div className="fx-white" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>
            <small>Impacto estimado</small>
            <span style={{ display: 'block', marginTop: 4 }}><span className="fx-money" style={{ fontSize: 26 }}>{formatMoney(rec.expectedImpactValue)}</span></span>
          </span>
          {goesToOrder(rec) && <small style={{ maxWidth: 220 }}>Aceitar já coloca {rec.parameters?.quantidade} un. no pedido do fornecedor.</small>}
        </div>
        {rec.calculationTrace && (
          <>
            <button type="button" className="fx-btn ghost small" style={{ marginTop: 14 }} aria-expanded={trace} onClick={() => setTrace((v) => !v)}>
              <ChevronDown aria-hidden="true" style={{ transform: trace ? 'rotate(180deg)' : 'none' }} />Como chegamos nesse número
            </button>
            {trace && <pre style={{ margin: '10px 0 0', whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.55, background: 'var(--fx-card-2)', borderRadius: 12, padding: 12, color: 'var(--fx-ink-2)' }}>{rec.calculationTrace}</pre>}
          </>
        )}
        <div className="fx-actions" style={{ marginTop: 16 }}>
          <button type="button" className="fx-btn dark" disabled={deciding} onClick={() => onDecide(rec.id, 'ACEITA')}>
            <Check aria-hidden="true" />{goesToOrder(rec) ? 'Aceitar e pôr no pedido' : 'Aceitar'}
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
