import React from 'react';
import { NavLink } from 'react-router-dom';

const Sidebar: React.FC = () => {
  return (
    <aside className="sidebar">
      <div>
        <h1>MercadoFlow</h1>
        <p style={{ color: 'var(--muted)' }}>Inteligência de vendas</p>
      </div>
      <nav>
        <NavLink className="nav-link" to="/app">Painel</NavLink>
        <NavLink className="nav-link" to="/produtos">Produtos</NavLink>
        <NavLink className="nav-link" to="/previsao-demanda">Previsão de demanda</NavLink>
        <NavLink className="nav-link" to="/cesta">Cesta de mercado</NavLink>
        <NavLink className="nav-link" to="/alertas">Alertas</NavLink>
        <NavLink className="nav-link" to="/pdvs">PDVs</NavLink>
        <NavLink className="nav-link" to="/campanhas">Campanhas</NavLink>
        <NavLink className="nav-link" to="/download-agente">Download do agente</NavLink>
        <NavLink className="nav-link" to="/configuracoes">Configurações</NavLink>
      </nav>
    </aside>
  );
};

export default Sidebar;
