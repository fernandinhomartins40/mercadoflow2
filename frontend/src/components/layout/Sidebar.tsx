import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

interface SidebarItem {
  to: string;
  label: string;
  hint: string;
  mark: string;
  exact?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onClose }) => {
  const { role, name, email } = useAuth();
  const isAdmin = role === 'ADMIN';

  const sections: Array<{ title: string; items: SidebarItem[] }> = [
    {
      title: 'Visão do negócio',
      items: [
        { to: '/app', label: 'Painel geral', hint: 'Resumo diário e prioridades', mark: 'PG', exact: true },
        { to: '/app/produtos', label: 'Produtos', hint: 'Giro, tendência e elasticidade', mark: 'PR' },
        { to: '/app/alertas', label: 'Alertas', hint: 'Sinais que pedem ação imediata', mark: 'AL' },
      ],
    },
    {
      title: 'Análise e operação',
      items: [
        { to: '/app/cesta', label: 'Compra casada', hint: 'Combos e afinidade de itens', mark: 'CC' },
        { to: '/app/lista-compras', label: 'Lista de compras', hint: 'Compra guiada por venda e sazonalidade', mark: 'LC' },
        { to: '/app/ofertas', label: 'Ofertas', hint: 'Modelos, designer e lotes', mark: 'OF' },
        { to: '/app/previsao-demanda', label: 'Previsão', hint: 'Planejamento de demanda', mark: 'PV' },
        { to: '/app/campanhas', label: 'Campanhas', hint: 'Impacto antes, durante e depois', mark: 'CP' },
        { to: '/app/pdvs', label: 'PDVs', hint: 'Origem operacional das vendas', mark: 'PD' },
      ],
    },
    {
      title: 'Configuração',
      items: [
        ...(isAdmin ? [{ to: '/app/admin/catalogo', label: 'Catálogo global', hint: 'Base consolidada de produtos', mark: 'CG' }] : []),
        { to: '/app/download-agente', label: 'Download do agente', hint: 'Instalação do coletor local', mark: 'AG' },
        { to: '/app/configuracoes', label: 'Configurações', hint: 'Acesso e integrações', mark: 'CF' },
      ],
    },
  ];

  return (
    <>
      <button
        type="button"
        className={`sidebar-backdrop ${mobileOpen ? 'visible' : ''}`}
        onClick={onClose}
        aria-label="Fechar menu lateral"
      />
      <aside className={`sidebar workspace-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="workspace-sidebar-frame">
          <div className="workspace-sidebar-head">
            <div className="sidebar-brand">
              <div className="sidebar-brand-mark">MF</div>
              <div>
                <h1>MercadoFlow</h1>
                <p>Painel operacional para decisão no varejo</p>
              </div>
            </div>
            <button type="button" className="sidebar-close" onClick={onClose} aria-label="Fechar menu">X</button>
          </div>

          <div className="workspace-sidebar-body">
            <div className="sidebar-user-card">
              <span className="section-kicker">Workspace atual</span>
              <strong>{name || 'Usuário logado'}</strong>
              <span>{email || 'Conta sem e-mail visível'}</span>
              <div className="sidebar-user-meta">
                <span className="sidebar-chip">{role === 'ADMIN' ? 'Administrador' : 'Operação'}</span>
                <span className="sidebar-chip subtle">MercadoFlow</span>
              </div>
            </div>

            <div className="sidebar-sections">
              {sections.map((section) => (
                <div key={section.title} className="sidebar-section">
                  <span className="sidebar-section-title">{section.title}</span>
                  <nav className="sidebar-nav">
                    {section.items.map((item) => (
                      <NavLink key={item.to} end={item.exact} className="nav-link dashboard-nav-link" to={item.to} onClick={onClose}>
                        <span className="nav-link-mark">{item.mark}</span>
                        <span className="nav-link-copy">
                          <strong className="nav-link-text">{item.label}</strong>
                          <span className="nav-link-hint">{item.hint}</span>
                        </span>
                        <span className="nav-link-indicator">&gt;</span>
                      </NavLink>
                    ))}
                  </nav>
                </div>
              ))}
            </div>

            <div className="sidebar-support-card">
              <span className="section-kicker">Fluxo recomendado</span>
              <strong>Comece em Produtos e feche em Alertas</strong>
              <p>O caminho mais simples para ler o negócio é analisar o item, validar a compra e só depois agir no operacional.</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
