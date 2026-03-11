import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const TITLES: Record<string, { title: string; subtitle: string; section: string }> = {
  '/app': { title: 'Painel geral', subtitle: 'Resumo diario das vendas, giro e prioridades da operacao', section: 'Visao do negocio' },
  '/app/produtos': { title: 'Produtos', subtitle: 'Consulta de itens, performance e comportamento por produto', section: 'Visao do negocio' },
  '/app/cesta': { title: 'Compra casada', subtitle: 'Itens que se fortalecem juntos no caixa e na exposicao', section: 'Analise e operacao' },
  '/app/previsao-demanda': { title: 'Previsao', subtitle: 'Demanda futura para orientar compra e abastecimento', section: 'Analise e operacao' },
  '/app/campanhas': { title: 'Campanhas', subtitle: 'Acompanhamento de impacto promocional com base real', section: 'Analise e operacao' },
  '/app/alertas': { title: 'Alertas', subtitle: 'Ocorrencias e sinais que exigem acao imediata', section: 'Analise e operacao' },
  '/app/pdvs': { title: 'PDVs', subtitle: 'Origem operacional das vendas e distribuicao dos resultados', section: 'Analise e operacao' },
  '/app/admin/catalogo': { title: 'Catalogo global', subtitle: 'Base unificada de produtos externos para administracao', section: 'Configuracao' },
  '/app/configuracoes': { title: 'Configuracoes', subtitle: 'Acessos, integracoes e parametros da conta', section: 'Configuracao' },
  '/app/download-agente': { title: 'Download do agente', subtitle: 'Instalacao e distribuicao do coletor local', section: 'Configuracao' },
};

interface NavbarProps {
  onToggleSidebar: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar }) => {
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
      return {
        section: 'Visao do negocio',
        title: 'Painel do produto',
        subtitle: 'Leitura completa do item com comparacao por PDV, preco e tendencia',
      };
    }
    return TITLES[location.pathname] || TITLES['/app'];
  }, [location.pathname]);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    [],
  );

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
    <header className="header dashboard-topbar">
      <div className="dashboard-topbar-main">
        <div className="dashboard-topbar-title-row">
          <button type="button" className="sidebar-toggle" onClick={onToggleSidebar} aria-label="Abrir menu lateral">Menu</button>
          <div className="header-copy">
            <span className="header-breadcrumb">{header.section} / {header.title}</span>
            <h2>{header.title}</h2>
            <span className="header-subtitle">{header.subtitle}</span>
          </div>
        </div>
        <div className="header-meta-row">
          <span className="workspace-pill">{role === 'ADMIN' ? 'Perfil admin' : 'Operacao'}</span>
          <span className="workspace-pill subtle">Atualizado em {todayLabel}</span>
        </div>
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

        <div className="workspace-user-chip">
          <span className="workspace-user-avatar">{(name || 'U').trim().charAt(0).toUpperCase()}</span>
          <div>
            <strong>{name || 'Usuario'}</strong>
            <span>{role === 'ADMIN' ? 'Administrador' : 'Operacao'}</span>
          </div>
        </div>

        <button className="button secondary" onClick={logout}>Sair</button>
      </div>
    </header>
  );
};

export default Navbar;
