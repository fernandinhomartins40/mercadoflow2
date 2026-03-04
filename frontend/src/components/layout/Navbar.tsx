import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const TITLES: Record<string, { title: string; subtitle: string }> = {
  '/app': { title: 'Painel Geral', subtitle: 'Visão executiva do negócio' },
  '/app/produtos': { title: 'Produtos', subtitle: 'Giro, tendência e elasticidade' },
  '/app/cesta': { title: 'Compra casada', subtitle: 'Produtos que se reforçam nas vendas' },
  '/app/previsao-demanda': { title: 'Previsão', subtitle: 'Demanda futura por produto' },
  '/app/campanhas': { title: 'Campanhas', subtitle: 'Impacto antes, durante e depois' },
  '/app/alertas': { title: 'Alertas', subtitle: 'Sinais acionáveis do mercado' },
  '/app/pdvs': { title: 'PDVs', subtitle: 'Origem operacional das vendas' },
  '/app/configuracoes': { title: 'Configurações', subtitle: 'Acesso e integrações' },
  '/app/download-agente': { title: 'Agente', subtitle: 'Distribuição do coletor desktop' },
};

const Navbar: React.FC = () => {
  const { logout, role, name } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [productQuery, setProductQuery] = useState('');

  useEffect(() => {
    if (location.pathname === '/app/produtos') {
      const params = new URLSearchParams(location.search);
      setProductQuery(params.get('search') || '');
      return;
    }
    if (!location.pathname.startsWith('/app/produtos/')) {
      setProductQuery('');
    }
  }, [location.pathname, location.search]);

  const header = useMemo(() => {
    if (location.pathname.startsWith('/app/produtos/')) {
      return { title: 'Painel do Produto', subtitle: 'Desempenho por produto e PDV' };
    }
    return TITLES[location.pathname] || TITLES['/app'];
  }, [location.pathname]);

  const handleProductSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = productQuery.trim();
    if (!normalized) {
      navigate('/app/produtos');
      return;
    }
    navigate(`/app/produtos?search=${encodeURIComponent(normalized)}`);
  };

  return (
    <div className="header">
      <div className="header-copy">
        <h2 style={{ margin: 0 }}>{header.title}</h2>
        <span className="header-subtitle">
          {header.subtitle} | {name || 'Usuário'} | Perfil: {role || 'Não informado'}
        </span>
      </div>
      <div className="header-actions">
        <form className="header-search" onSubmit={handleProductSearch}>
          <input
            className="input header-search-input"
            placeholder="Buscar produto por nome ou GTIN"
            value={productQuery}
            onChange={(event) => setProductQuery(event.target.value)}
          />
          <button className="button header-search-submit" type="submit">
            Buscar
          </button>
        </form>
        <button className="button secondary" onClick={logout}>Sair</button>
      </div>
    </div>
  );
};

export default Navbar;
