import React, { useEffect, useMemo, useState } from 'react';
import Button from '../common/Button';
import WorkspaceTopbar from './WorkspaceTopbar';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const TITLES: Record<string, { title: string; subtitle: string; section: string }> = {
  '/app': { title: 'Painel geral', subtitle: 'Resumo diário das vendas, giro e prioridades da operação', section: 'Visão do negócio' },
  '/app/produtos': { title: 'Produtos', subtitle: 'Consulta de itens, performance e comportamento por produto', section: 'Visão do negócio' },
  '/app/lista-compras': { title: 'Lista de compras', subtitle: 'Compra orientada por giro, sazonalidade e reposição', section: 'Análise e operação' },
  '/app/ofertas': { title: 'Designer de ofertas', subtitle: 'Monte encartes e peças com automação visual nativa', section: 'Análise e operação' },
  '/app/ofertas/inicio': { title: 'Central de ofertas', subtitle: 'Visão geral do módulo com modelos, fila e sugestões de campanha', section: 'Análise e operação' },
  '/app/ofertas/designer': { title: 'Designer de ofertas', subtitle: 'Monte encartes e peças com automação visual nativa', section: 'Análise e operação' },
  '/app/ofertas/modelos': { title: 'Modelos de ofertas', subtitle: 'Biblioteca de layouts e templates automatizados', section: 'Análise e operação' },
  '/app/ofertas/jobs': { title: 'Lotes de ofertas', subtitle: 'Fila de geração, exportação e acompanhamento', section: 'Análise e operação' },
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
  desktopPinned: boolean;
}

const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar, desktopPinned }) => {
  const { logout, role, name } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [productQuery, setProductQuery] = useState('');
  const isOffersRoute = location.pathname.startsWith('/app/ofertas');

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
    <WorkspaceTopbar
      section={header.section}
      title={header.title}
      subtitle={header.subtitle}
      onToggleSidebar={onToggleSidebar}
      showMenuToggle={!desktopPinned}
      desktopPinned={desktopPinned}
      userName={name || 'Usuário'}
      userSubtitle={role === 'ADMIN' ? 'Administrador' : 'Operação'}
      userInitial={(name || 'U').trim().charAt(0).toUpperCase()}
      badges={
        <>
          <span className="inline-flex min-h-9 items-center justify-center rounded-full bg-[rgba(255,106,0,0.12)] px-4 text-sm font-semibold text-[color:var(--accent-strong)]">
            {role === 'ADMIN' ? 'Perfil admin' : 'Operação'}
          </span>
          <span className="inline-flex min-h-9 items-center justify-center rounded-full bg-[rgba(47,23,11,0.06)] px-4 text-sm font-semibold text-[color:var(--text-muted)]">
            Atualizado em {todayLabel}
          </span>
        </>
      }
      searchSlot={
        isOffersRoute ? null : (
          <form className="flex w-full min-w-0 flex-wrap items-center gap-3 xl:justify-end" onSubmit={handleProductSearch}>
            <input
              className="input h-12 min-w-[220px] max-w-full flex-[1_1_320px] rounded-[16px] border border-[rgba(87,51,30,0.12)] bg-white px-4 text-sm text-[color:var(--text-primary)] shadow-[0_10px_24px_rgba(44,20,6,0.06)] xl:max-w-[420px]"
              placeholder="Buscar produto por nome ou GTIN"
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
            />
            <Button className="min-w-[120px]" type="submit">
              Buscar
            </Button>
          </form>
        )
      }
      actionSlot={<Button className="min-w-[104px]" variant="secondary" onClick={logout}>Sair</Button>}
    />
  );
};

export default Navbar;
