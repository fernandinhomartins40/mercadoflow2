import React from 'react';
import { NavLink } from 'react-router-dom';
import Button from '../common/Button';
import { useSuperAdminAuth } from '../../context/SuperAdminAuthContext';

const SuperAdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { logout, name } = useSuperAdminAuth();

  return (
    <div className="super-admin-shell">
      <aside className="super-admin-sidebar">
        <div className="super-admin-brand">
          <span className="super-admin-badge">SA</span>
          <div>
            <h1>Super Admin</h1>
            <p>Controle da plataforma</p>
          </div>
        </div>
        <nav className="super-admin-nav">
          <NavLink to="/super-admin" end className="super-admin-link">Visao geral</NavLink>
          <NavLink to="/super-admin/saas" className="super-admin-link">Gestao SaaS</NavLink>
          <NavLink to="/super-admin/catalogo" className="super-admin-link">Catalogo global</NavLink>
          <NavLink to="/super-admin/crawler" className="super-admin-link">Crawler web</NavLink>
        </nav>
        <div className="super-admin-footer">
          <p>{name || 'Super Admin'}</p>
          <Button variant="secondary" onClick={() => logout()}>Sair</Button>
        </div>
      </aside>
      <main className="super-admin-main shell-content">{children}</main>
    </div>
  );
};

export default SuperAdminLayout;
