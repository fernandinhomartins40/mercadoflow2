import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import Button from '../common/Button';
import WorkspaceTopbar from './WorkspaceTopbar';
import { useAuth } from '../../context/AuthContext';

const TITLES: Record<string, { title: string; subtitle: string; section: string }> = {
  '/app': { title: 'Hoje no mercado', subtitle: 'O que precisa da sua atenção agora', section: 'Visão do negócio' },
  '/app/inteligencia': { title: 'Central de Inteligência', subtitle: 'O que está acontecendo e o que fazer a respeito', section: 'Visão do negócio' },
  '/app/perguntar': { title: 'Pergunte aos dados', subtitle: 'Respostas com os números reais da sua loja', section: 'Visão do negócio' },
  '/app/rede': { title: 'Semana e rede', subtitle: 'O retrospecto da semana e a comparação entre suas lojas', section: 'Visão do negócio' },
  '/app/produtos': { title: 'Produtos', subtitle: 'Como seus produtos estão vendendo', section: 'Visão do negócio' },
  '/app/lista-compras': { title: 'Pedido inteligente', subtitle: 'Compra guiada por vendas reais', section: 'Análise e operação' },
  '/app/ofertas': { title: 'Estúdio de ofertas', subtitle: 'Crie encartes com base no catálogo real', section: 'Análise e operação' },
  '/app/ofertas/campanhas': { title: 'Campanhas de ofertas', subtitle: 'Gerencie suas campanhas promocionais', section: 'Análise e operação' },
  '/app/ofertas/inicio': { title: 'Campanhas de ofertas', subtitle: 'Gerencie suas campanhas promocionais', section: 'Análise e operação' },
  '/app/ofertas/designer': { title: 'Estúdio de ofertas', subtitle: 'Crie encartes com base no catálogo real', section: 'Análise e operação' },
  '/app/ofertas/modelos': { title: 'Estúdio de ofertas', subtitle: 'Crie encartes com base no catálogo real', section: 'Análise e operação' },
  '/app/ofertas/jobs': { title: 'Arquivos de ofertas', subtitle: 'Histórico de publicações e saídas', section: 'Análise e operação' },
  '/app/cesta': { title: 'Combos', subtitle: 'Produtos que vendem juntos', section: 'Análise e operação' },
  '/app/previsao-demanda': { title: 'Previsão de vendas', subtitle: 'Antecipe a demanda dos próximos dias', section: 'Análise e operação' },
  '/app/campanhas': { title: 'Promoções', subtitle: 'Acompanhe o resultado das suas ações', section: 'Análise e operação' },
  '/app/promocoes': { title: 'Efetividade de promoções', subtitle: 'Quais promoções realmente vendem mais — com base nas notas reais', section: 'Estratégia' },
  '/app/alertas': { title: 'Alertas', subtitle: 'O que precisa de ação imediata', section: 'Análise e operação' },
  '/app/pdvs': { title: 'Pontos de venda', subtitle: 'Resultado por caixa e filial', section: 'Análise e operação' },
  '/app/mapa-loja': { title: 'Mapa da loja', subtitle: 'Organize seus produtos para vender mais', section: 'Análise e operação' },
  '/app/admin/catalogo': { title: 'Catálogo global', subtitle: 'Base unificada de produtos', section: 'Configuração' },
  '/app/admin/precos-estaduais': { title: 'Preços estaduais', subtitle: 'Comparação de preços entre estados', section: 'Configuração' },
  '/app/configuracoes': { title: 'Configurações', subtitle: 'Acessos e integrações da conta', section: 'Configuração' },
  '/app/download-agente': { title: 'Download do agente', subtitle: 'Instalação do coletor local', section: 'Configuração' },
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
        subtitle: 'Visão completa do item com comparação por PDV e tendência',
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
