import React from 'react';
import Table from '../common/Table';

const ProductTable: React.FC<{ products: any[] }> = ({ products }) => {
  const headers = ['Produto', 'Categoria', 'Receita', 'Quantidade', 'Preco Medio'];
  const rows = products.map((p) => [
    p.name,
    p.category || 'N/A',
    `R$ ${Number(p.revenue || 0).toFixed(2)}`,
    Number(p.quantitySold || 0).toFixed(2),
    `R$ ${Number(p.averagePrice || 0).toFixed(2)}`,
  ]);

  return <Table headers={headers} rows={rows} />;
};

export default ProductTable;
