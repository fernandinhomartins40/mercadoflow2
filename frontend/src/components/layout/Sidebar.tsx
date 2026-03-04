import React from 'react';
import { NavLink } from 'react-router-dom';

const Sidebar: React.FC = () => {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">MF</div>
        <div>
          <h1>MercadoFlow</h1>
          <p style={{ color: 'var(--muted)' }}>Operação, giro e decisão de compra</p>
        </div>
      </div>
      <nav className="sidebar-nav">
        <NavLink className="nav-link" to="/app">Painel geral</NavLink>
        <NavLink className="nav-link" to="/app/produtos">Produtos</NavLink>
        <NavLink className="nav-link" to="/app/cesta">Compra casada</NavLink>
        <NavLink className="nav-link" to="/app/previsao-demanda">Previsão</NavLink>
        <NavLink className="nav-link" to="/app/campanhas">Campanhas</NavLink>
        <NavLink className="nav-link" to="/app/alertas">Alertas</NavLink>
        <NavLink className="nav-link" to="/app/pdvs">PDVs</NavLink>
        <NavLink className="nav-link" to="/app/download-agente">Download do agente</NavLink>
        <NavLink className="nav-link" to="/app/configuracoes">Configurações</NavLink>
      </nav>
      <div className="sidebar-note">
        <span className="section-kicker">Fluxo de decisão</span>
        <strong>Comece em Produtos</strong>
        <p>Busque o item, abra o dashboard e compare o comportamento por PDV antes de comprar ou promover.</p>
      </div>
    </aside>
  );
};

export default Sidebar;
