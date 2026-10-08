import React from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Card, Chip, PagedList, PanelTitle, Thumb } from '../../components/flow/Flow';
import { useAuth } from '../../context/AuthContext';
import { useCached } from '../../hooks/useCached';
import { tractionService, type ProductTraction } from '../../services/traction.service';
import { formatMoney } from '../../utils/formatters';

const money2 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Produtos que puxam a venda: o resto do cupom vale mais quando eles estão
 * nele, comparado com cupons do mesmo tamanho sem eles. Só entram os efeitos
 * firmes (z >= 2). Os parceiros mostram o que costuma vir junto.
 */
const TractionList: React.FC = () => {
  const { marketId } = useAuth();
  const { data, loading } = useCached<ProductTraction[]>(marketId ? `tracao-lista:${marketId}` : null,
    () => tractionService.list(marketId!, true, 100), 10 * 60_000);

  if (loading && !data) return <Card><Loader2 className="animate-spin" aria-label="Carregando" /></Card>;
  if (!data || data.length === 0) {
    return (
      <Card>
        <PanelTitle title="Ainda sem cálculo de tração" sub="Roda de madrugada e precisa de pelo menos 3 semanas com todas as notas." />
      </Card>
    );
  }
  const first = data[0];
  return (
    <Card className="fx-col">
      <PanelTitle title={`${data.length} produtos puxam a venda`}
        sub={`Cupons com eles levam mais em outros itens que cupons do mesmo tamanho sem eles · ${first.completeDays} dias completos · ${first.totalBaskets.toLocaleString('pt-BR')} cupons`} />
      <PagedList items={data} size={10} label="produtos" style={{ marginTop: 16, gap: 8 }} render={(t) => (
          <li key={t.productId}>
            <Link to={`/app/produtos/${t.productId}`} className="fx-row" style={{ color: 'var(--fx-ink)', alignItems: 'flex-start' }}>
              <Thumb name={t.name} src={t.imageUrl} size={44} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <b style={{ display: 'block', fontSize: 15 }}>{t.name}</b>
                <span className="fx-muted" style={{ display: 'block', fontSize: 13 }}>
                  {t.baskets.toLocaleString('pt-BR')} cupons · vende {formatMoney(t.ownRevenue)} · puxa {formatMoney(t.liftTotal)} em outros itens
                </span>
                {t.partners.length > 0 && (
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {t.partners.slice(0, 4).map((pt) => <Chip key={pt.productId} tone="ghost">{pt.name}</Chip>)}
                  </span>
                )}
              </span>
              <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <b className="fx-num" style={{ display: 'block', color: 'var(--fx-green)' }}>+{money2(t.liftPerBasket)}</b>
                <small className="fx-muted">por cupom</small>
              </span>
            </Link>
          </li>
      )} />
    </Card>
  );
};

export default TractionList;
