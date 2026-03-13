import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const TITLES: Record<string, { title: string; subtitle: string; section: string }> = {
  '/app': { title: 'Painel geral', subtitle: 'Resumo diário das vendas, giro e prioridades da operação', section: 'Visão do negócio' },
  '/app/produtos': { title: 'Produtos', subtitle: 'Consulta de itens, performance e comportamento por produto', section: 'Visão do negócio' },
  '/app/lista-compras': { title: 'Lista de compras', subtitle: 'Compra orientada por giro, sazonalidade e reposição', section: 'Análise e operação' },
  '/app/cesta': { title: 'Compra casada', subtitle: 'Itens que se fortalecem juntos no caixa e na exposição', section: 'Análise e operação' },
  '/app/previsao-demanda': { title: 'Previsão', subtitle: 'Demanda futura para orientar compra e abastecimento', section: 'Análise e operação' },
  '/app/campanhas': { title: 'Campanhas', subtitle: 'Acompanhamento de impacto promocional com base real', section: 'Análise e operação' },
  '/app/alertas': { title: 'Alertas', subtitle: 'Ocorrências e sinais que exigem ação imediata', section: 'Análise e operação' },
  '/app/pdvs': { title: 'PDVs', subtitle: 'Origem operacional das vendas e distribuição dos resultados', section: 'Análise e operação' },
  '/app/admin/catalogo': { title: 'Catálogo global', subtitle: 'Base unificada de produtos externos para administração', section: 'Configuração' },
  '/app/configuracoes': { title: 'Configurações', subtitle: 'Acessos, integrações e parâmetros da conta', section: 'Configuração' },
  '/app/download-agente': { title: 'Download do agente', subtitle: 'Instalação e distribuição do coletor local', section: 'Configuração' },
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
        section: 'Visão do negócio',
        title: 'Painel do produto',
        subtitle: 'Leitura completa do item com comparação por PDV, preço e tendência',
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
          <span className="workspace-pill">{role === 'ADMIN' ? 'Perfil admin' : 'Operação'}</span>
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
            <strong>{name || 'Usuário'}</strong>
            <span>{role === 'ADMIN' ? 'Administrador' : 'Operação'}</span>
          </div>
        </div>

        <button className="button secondary" onClick={logout}>Sair</button>
      </div>
    </header>
  );
};

export default Navbar;
