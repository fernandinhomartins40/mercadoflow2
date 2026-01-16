import React from 'react';
import Card from '../common/Card';

const ProductDetails: React.FC<{ product: any }> = ({ product }) => {
  if (!product) return null;

  return (
    <Card>
      <h3 style={{ marginTop: 0 }}>{product.name}</h3>
      <p>Categoria: {product.category || 'N/A'}</p>
      <p>Receita: R$ {Number(product.revenue || 0).toFixed(2)}</p>
    </Card>
  );
};

export default ProductDetails;
