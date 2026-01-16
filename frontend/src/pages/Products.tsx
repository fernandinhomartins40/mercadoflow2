import React, { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import ProductTable from '../components/products/ProductTable';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';

const Products: React.FC = () => {
  const { marketId } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!marketId) {
        setLoading(false);
        return;
      }
      const data = await marketService.getProducts(marketId);
      setProducts(data.content || []);
      setLoading(false);
    };
    load();
  }, [marketId]);

  return (
    <Layout>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Produtos</h3>
        {loading ? <p>Carregando...</p> : <ProductTable products={products} />}
      </div>
    </Layout>
  );
};

export default Products;
