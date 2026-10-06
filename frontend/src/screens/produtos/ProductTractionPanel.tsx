import React from 'react';
import { Link } from 'react-router-dom';
import { Card, Chip, Forest, PanelTitle } from '../../components/flow/Flow';
import { useAuth } from '../../context/AuthContext';
import { useCached } from '../../hooks/useCached';
import { tractionService, type ProductTraction } from '../../services/traction.service';
import workingCapitalService, { type CapitalMetric } from '../../services/workingCapital.service';
import { formatDecimal, formatMoney } from '../../utils/formatters';

const money2 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS: Record<string, { label: string; tone: 'green' | 'gray' | 'amber' | 'red' }> = {
  INVEST: { label: 'Vale reforçar', tone: 'green' },
  MANTER: { label: 'Manter', tone: 'gray' },
  REDUZIR: { label: 'Comprar menos', tone: 'amber' },
  LIQUIDAR: { label: 'Liquidar', tone: 'red' },
};

const COST: Record<string, string> = {
  PURCHASE_HISTORY: 'custo da última compra registrada',
  NFE_ENTRADA: 'custo da NF-e de entrada (Confere)',
  SUPPLIER_ORDER: 'custo do último pedido ao fornecedor',
  MARGIN_ESTIMATE: 'margem ESTIMADA (sem custo de compra registrado)',
};

/** Tração e giro de um produto: o que importa para decidir quanto capital ele merece. */
const ProductTractionPanel: React.FC<{ productId: string }> = ({ productId }) => {
  const { marketId } = useAuth();
  const traction = useCached<ProductTraction | null>(marketId ? `tracao-produto:${marketId}:${productId}` : null,
    () => tractionService.forProduct(marketId!, productId), 10 * 60_000);
  const portfolio = useCached<CapitalMetric[]>(marketId ? `giro:${marketId}` : null,
    () => workingCapitalService.getPortfolio(marketId!, 90).then((r) => r.items), 10 * 60_000);
  const m = portfolio.data?.find((x) => x.productId === productId) ?? null;
  const t = traction.data;
  const st = m ? STATUS[m.capitalStatus] ?? STATUS.MANTER : null;

  return (
    <div className="fx-split">
      <Card>
        <PanelTitle title="Puxa a venda?" sub="O resto do cupom quando ele está, contra cupons do mesmo tamanho sem ele (90 dias, só dias completos)" />
        {traction.loading && t === undefined ? null : !t ? (
          <p className="fx-muted" style={{ margin: '14px 0 0' }}>Sem medida ainda: precisa aparecer em pelo menos 30 cupons de dias completos.</p>
        ) : (
          <>
            <p style={{ margin: '14px 0 0', fontSize: 15.5 }}>
              {t.significant
                ? <>Cupons com ele levam <b style={{ color: 'var(--fx-green)' }}>+{money2(t.liftPerBasket)}</b> em outros produtos. Em {t.baskets.toLocaleString('pt-BR')} cupons, isso somou <b>{formatMoney(t.liftTotal)}</b>.</>
                : t.liftPerBasket > 0
                  ? <>Diferença de +{money2(t.liftPerBasket)} por cupom, mas ainda sem força estatística ({t.baskets} cupons). Não dá para afirmar que ele puxa a venda.</>
                  : <>Não puxa: cupons com ele têm {money2(Math.abs(t.liftPerBasket))} a menos em outros itens que cupons do mesmo tamanho.</>}
            </p>
            {t.partners.length > 0 && (
              <>
                <h3 className="fx-panel-sub" style={{ margin: '16px 0 8px' }}>Costuma vir junto</h3>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {t.partners.map((p) => (
                    <li key={p.productId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <Link to={`/app/produtos/${p.productId}`}>{p.name}</Link>
                      <span className="fx-muted" style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{p.baskets} cupons · {formatDecimal(p.lift, 1)}x o acaso</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Card>
      <Forest as="aside" aria-label="Giro e capital">
        <PanelTitle title="Giro e capital" right={st ? <Chip tone={st.tone}>{st.label}</Chip> : undefined} />
        {!m ? (
          <p style={{ margin: '14px 0 0', color: 'var(--fx-on-forest)' }}>Fora da análise de capital (pouca venda nos últimos 90 dias).</p>
        ) : (
          <>
            <div className="fx-kpis" style={{ marginTop: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
              <div className="fx-kpi"><span>Vende por dia</span><b>{formatDecimal(Number(m.dailyVelocity), 1)}</b></div>
              <div className="fx-kpi"><span>Curva</span><b>{m.abcClass}{m.xyzClass ?? ''}</b></div>
              <div className="fx-kpi"><span>Ritmo</span><b>{m.momentumScore != null ? `${formatDecimal(Number(m.momentumScore), 2)}x` : '—'}</b><small>últimos 7 dias contra 28</small></div>
              <div className="fx-kpi"><span>Estoque</span><b>{m.inventoryUnits != null ? formatDecimal(Number(m.inventoryUnits), 0) : '—'}</b><small>{m.inventoryUnits != null ? `${m.coverageDays != null ? `${formatDecimal(Number(m.coverageDays), 0)} dias de venda` : ''}` : 'sem compra registrada'}</small></div>
            </div>
            {m.capitalReason && <p style={{ margin: '14px 0 0', color: 'var(--fx-on-forest)' }}>{m.capitalReason}</p>}
            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--fx-on-forest-muted)' }}>
              Margem {m.grossMarginPercent != null ? `${formatDecimal(Number(m.grossMarginPercent), 1)}%` : '—'}: {COST[m.costSource ?? 'MARGIN_ESTIMATE'] ?? m.costSource}.
            </p>
          </>
        )}
      </Forest>
    </div>
  );
};

export default ProductTractionPanel;
