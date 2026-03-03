import React from 'react';
import Table from '../common/Table';

const ProductTable: React.FC<{ products: any[] }> = ({ products }) => {
  if (!products.length) {
    return <p style={{ color: 'var(--muted)' }}>Nenhum produto encontrado neste mercado.</p>;
  }

  const formatSource = (value: string) => {
    switch (value) {
      case 'WEB':
        return 'Web';
      case 'MANUAL':
        return 'Manual';
      default:
        return 'NFC-e';
    }
  };

  const formatConfidence = (value: number) => `${Math.round(Number(value || 0) * 100)}%`;
  const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString('pt-BR') : '--');

  const headers = ['Produto', 'GTIN', 'Origem', 'Confianca', 'Ultimo visto', 'Receita', 'Quantidade', 'Preco medio'];
  const rows = products.map((p) => [
    <div>
      <div>{p.name}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.category || 'Sem categoria'}</div>
    </div>,
    p.ean || '--',
    formatSource(p.sourceBest),
    formatConfidence(p.confidenceScore),
    formatDate(p.lastSeenAt),
    `R$ ${Number(p.revenue || 0).toFixed(2)}`,
    Number(p.quantitySold || 0).toFixed(2),
    `R$ ${Number(p.averagePrice || 0).toFixed(2)}`,
  ]);

  return <Table headers={headers} rows={rows} />;
};

export default ProductTable;
