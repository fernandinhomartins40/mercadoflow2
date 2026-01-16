import React from 'react';
import { NavLink } from 'react-router-dom';

const Sidebar: React.FC = () => {
  return (
    <aside className="sidebar">
      <div>
        <h1>PDV2Cloud</h1>
        <p style={{ color: 'var(--muted)' }}>Inteligencia de vendas</p>
      </div>
      <nav>
        <NavLink className="nav-link" to="/">Dashboard</NavLink>
        <NavLink className="nav-link" to="/produtos">Produtos</NavLink>
        <NavLink className="nav-link" to="/cesta">Market Basket</NavLink>
        <NavLink className="nav-link" to="/alertas">Alertas</NavLink>
        <NavLink className="nav-link" to="/configuracoes">Configuracoes</NavLink>
      </nav>
    </aside>
  );
};

export default Sidebar;
