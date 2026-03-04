import React from 'react';
import Table from '../common/Table';
import { ProductPerformance } from '../../types/analytics.types';

const formatMoney = (value?: number | null) => `R$ ${Number(value || 0).toFixed(2)}`;
const formatPercent = (value?: number | null) => `${Number(value || 0).toFixed(1)}%`;

const ProductTable: React.FC<{ products: ProductPerformance[] }> = ({ products }) => {
  if (!products.length) {
    return <p style={{ color: 'var(--muted)' }}>Nenhum produto encontrado neste período.</p>;
  }

  const headers = ['Produto', 'GTIN', 'Receita', 'Qtd', 'Preço médio', 'Giro', 'Tendência', 'Share promo', 'Faixa', 'Última venda'];
  const rows = products.map((p) => [
    <div>
      <div>{p.name}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.category || 'Sem categoria'}</div>
    </div>,
    p.ean || '--',
    formatMoney(p.revenue),
    Number(p.quantitySold || 0).toFixed(2),
    formatMoney(p.averagePrice),
    `${Number(p.salesVelocity || 0).toFixed(2)}/dia`,
    formatPercent(p.revenueTrendPercentage),
    formatPercent((p.promoRevenueShare || 0) * 100),
    p.turnoverBand,
    p.lastSoldAt ? new Date(p.lastSoldAt).toLocaleDateString('pt-BR') : '--',
  ]);

  return <Table headers={headers} rows={rows} />;
};

export default ProductTable;
