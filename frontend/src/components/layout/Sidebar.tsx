import React from 'react';
import { NavLink } from 'react-router-dom';

const Sidebar: React.FC = () => {
  return (
    <aside className="sidebar">
      <div>
        <h1>MercadoFlow</h1>
        <p style={{ color: 'var(--muted)' }}>Cockpit de vendas e promocoes</p>
      </div>
      <nav>
        <NavLink className="nav-link" to="/app">Cockpit</NavLink>
        <NavLink className="nav-link" to="/app/produtos">Produtos</NavLink>
        <NavLink className="nav-link" to="/app/cesta">Compra casada</NavLink>
        <NavLink className="nav-link" to="/app/previsao-demanda">Previsao</NavLink>
        <NavLink className="nav-link" to="/app/campanhas">Campanhas</NavLink>
        <NavLink className="nav-link" to="/app/alertas">Alertas</NavLink>
        <NavLink className="nav-link" to="/app/pdvs">PDVs</NavLink>
        <NavLink className="nav-link" to="/app/download-agente">Download do agente</NavLink>
        <NavLink className="nav-link" to="/app/configuracoes">Configuracoes</NavLink>
      </nav>
    </aside>
  );
};

export default Sidebar;
