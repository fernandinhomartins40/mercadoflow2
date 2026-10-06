import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { Forest, PanelTitle } from '../../components/flow/Flow';
import { aiCreditsService } from '../../services/aiPlatform.service';
import { formatMoney } from '../../utils/formatters';
import type { OpportunityItem } from '../../types/analytics.types';

/** Nome de cada sinal da análise em palavras do supermercadista. */
export const SIGNAL_LABEL: Record<string, string> = {
  OPORTUNIDADE_DE_COMPRA: 'Comprar',
  RISCO_DE_RUPTURA: 'Risco de faltar',
  QUEDA_DE_VENDAS: 'Vendas caindo',
  CRESCIMENTO_DE_VENDAS: 'Vendas subindo',
  PRODUTO_EM_DECLINIO: 'Em declínio',
  CAPITAL_PARADO: 'Dinheiro parado',
  EXCESSO_DE_ESTOQUE: 'Estoque demais',
  PRODUTO_TRACIONADOR: 'Puxa a venda',
  OPORTUNIDADE_DE_PROMOCAO: 'Promoção',
  OPORTUNIDADE_DE_COMBO: 'Combo',
  PRECO_ACIMA_DO_MERCADO: 'Preço alto',
  ANOMALIA_DE_VENDAS: 'Venda fora do normal',
  ATENCAO: 'Atenção',
};

/**
 * Um sinal da análise sem ação pronta (venda subindo, anomalia...): o que se
 * viu, o "por quê" sob demanda e o descarte. Fica no filtro "Atenção".
 */
const OpportunityPanel: React.FC<{ marketId: string; opp: OpportunityItem; onDismiss: (id: string) => void }> = ({ marketId, opp, onDismiss }) => {
  const [why, setWhy] = useState<{ texto: string; ia: boolean } | null>(opp.aiInsight ? { texto: opp.aiInsight, ia: true } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const askWhy = async () => {
    setBusy(true);
    setError(null);
    try { setWhy(await aiCreditsService.explain(marketId, opp.id)); } catch { setError('Não foi possível explicar agora. Tente de novo.'); } finally { setBusy(false); }
  };

  return (
    <Forest as="aside" aria-label="O que a análise viu">
      <PanelTitle title={opp.title} sub={SIGNAL_LABEL[opp.type] ?? 'Atenção'} />
      {opp.description && <p style={{ margin: '14px 0 0', color: 'var(--fx-on-forest)', lineHeight: 1.5 }}>{opp.description}</p>}
      {opp.expectedImpactValue ? <p style={{ margin: '10px 0 0' }}><b className="fx-num" style={{ fontSize: 22 }}>{formatMoney(opp.expectedImpactValue)}</b> <span style={{ color: 'var(--fx-on-forest-muted)' }}>em jogo</span></p> : null}
      <div className="fx-white" style={{ marginTop: 14 }}>
        {why ? (
          <p style={{ margin: 0, lineHeight: 1.55 }}>
            {why.texto}
            {!why.ia && <> <Link to="/app/configuracoes#creditos-ia">Com créditos de IA, o Tino explica em detalhe.</Link></>}
          </p>
        ) : (
          <button type="button" className="fx-btn ghost small" onClick={askWhy} disabled={busy}><Sparkles aria-hidden="true" />{busy ? 'Explicando…' : 'Por quê?'}</button>
        )}
        {error && <p role="alert" style={{ color: 'var(--fx-red)', margin: '8px 0 0' }}>{error}</p>}
      </div>
      <div className="fx-actions" style={{ marginTop: 16 }}>
        {opp.productId && <Link to={`/app/produtos/${opp.productId}`} className="fx-btn lime">Ver o produto<ArrowRight aria-hidden="true" /></Link>}
        <button type="button" className="fx-btn ghost" onClick={() => onDismiss(opp.id)}><X aria-hidden="true" />Não faz sentido</button>
      </div>
    </Forest>
  );
};

export default OpportunityPanel;
