import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import Button from '../common/Button';
import WorkspaceTopbar from './WorkspaceTopbar';
import { useAuth } from '../../context/AuthContext';

const TITLES: Record<string, { title: string; subtitle: string; section: string }> = {
  '/app': { title: 'Painel geral', subtitle: 'Resumo diário das vendas, giro e prioridades da operação', section: 'Visão do negócio' },
  '/app/produtos': { title: 'Produtos', subtitle: 'Consulta de itens, performance e comportamento por produto', section: 'Visão do negócio' },
  '/app/lista-compras': { title: 'Lista de compras', subtitle: 'Compra orientada por giro, sazonalidade e reposição', section: 'Análise e operação' },
  '/app/ofertas': { title: 'Campanhas de ofertas', subtitle: 'Lista operacional para criar, editar, publicar e reaproveitar campanhas', section: 'Análise e operação' },
  '/app/ofertas/inicio': { title: 'Campanhas de ofertas', subtitle: 'Lista operacional para criar, editar, publicar e reaproveitar campanhas', section: 'Análise e operação' },
  '/app/ofertas/designer': { title: 'Estúdio de campanha', subtitle: 'Editor visual para montar e ajustar a campanha ativa', section: 'Análise e operação' },
  '/app/ofertas/modelos': { title: 'Modelos de ofertas', subtitle: 'Biblioteca de layouts e templates automatizados', section: 'Análise e operação' },
  '/app/ofertas/jobs': { title: 'Arquivos de ofertas', subtitle: 'Fila detalhada de saídas, publicações e histórico do módulo', section: 'Análise e operação' },
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
  const { logout } = useAuth();
  const location = useLocation();

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

  return (
    <WorkspaceTopbar
      section={header.section}
      title={header.title}
      onToggleSidebar={onToggleSidebar}
      showMenuToggle={!desktopPinned}
      actionSlot={<Button className="min-w-[104px]" variant="secondary" onClick={logout}>Sair</Button>}
    />
  );
};

export default Navbar;
