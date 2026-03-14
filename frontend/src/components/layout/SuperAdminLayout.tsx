import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Button from '../common/Button';
import { useSuperAdminAuth } from '../../context/SuperAdminAuthContext';

const TITLES: Record<string, { title: string; subtitle: string; section: string }> = {
  '/super-admin': { title: 'Visão geral', subtitle: 'Resumo da plataforma, das contas e da base de dados', section: 'Controle' },
  '/super-admin/saas': { title: 'Contas e acesso', subtitle: 'Contas, usuários, vencimentos e liberações manuais', section: 'Controle' },
  '/super-admin/catalogo': { title: 'Catálogo global', subtitle: 'Base central de produtos, ajustes manuais e revisão da qualidade', section: 'Dados' },
  '/super-admin/crawler': { title: 'Crawler', subtitle: 'Coletas, reparos e atualização de dados dos supermercados', section: 'Dados' },
};

const SuperAdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { logout, name, email } = useSuperAdminAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname, location.search]);

  const header = useMemo(() => TITLES[location.pathname] || TITLES['/super-admin'], [location.pathname]);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    [],
  );

  const navSections = [
    {
      title: 'Controle',
      links: [
        { to: '/super-admin', label: 'Visão geral', hint: 'Saúde da plataforma', mark: 'VG' },
        { to: '/super-admin/saas', label: 'Contas e acesso', hint: 'Contas, usuários e vencimentos', mark: 'CT' },
      ],
    },
    {
      title: 'Dados',
      links: [
        { to: '/super-admin/catalogo', label: 'Catálogo global', hint: 'Base central de produtos', mark: 'CG' },
        { to: '/super-admin/crawler', label: 'Crawler', hint: 'Coleta e reparo de dados', mark: 'CW' },
      ],
    },
  ];

  return (
    <div className="super-admin-shell workspace-shell super-admin-workspace-shell">
      <button
        type="button"
        className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-label="Fechar menu lateral"
      />

      <aside className={`super-admin-sidebar workspace-sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>
        <div className="workspace-sidebar-frame">
          <div className="workspace-sidebar-head">
            <div className="super-admin-brand">
              <span className="super-admin-badge">SA</span>
              <div>
                <h1>Super Admin</h1>
                <p>Controle central da plataforma</p>
              </div>
            </div>
            <button type="button" className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu">X</button>
          </div>

          <div className="workspace-sidebar-body">
            <div className="sidebar-user-card super-admin-user-card">
              <span className="section-kicker">Sessão ativa</span>
              <strong>{name || 'Super Admin'}</strong>
              <span>{email || 'Conta principal da plataforma'}</span>
              <div className="sidebar-user-meta">
                <span className="sidebar-chip">Acesso total</span>
                <span className="sidebar-chip subtle">Conta principal</span>
              </div>
            </div>

            <div className="sidebar-sections">
              {navSections.map((section) => (
                <div key={section.title} className="sidebar-section">
                  <span className="sidebar-section-title">{section.title}</span>
                  <nav className="super-admin-nav">
                    {section.links.map((link) => (
                      <NavLink key={link.to} to={link.to} end={link.to === '/super-admin'} className="super-admin-link dashboard-nav-link" onClick={() => setSidebarOpen(false)}>
                        <span className="nav-link-mark">{link.mark}</span>
                        <span className="nav-link-copy">
                          <strong className="nav-link-text">{link.label}</strong>
                          <span className="nav-link-hint">{link.hint}</span>
                        </span>
                        <span className="nav-link-indicator">&gt;</span>
                      </NavLink>
                    ))}
                  </nav>
                </div>
              ))}
            </div>

            <div className="sidebar-support-card super-admin-support-card">
              <span className="section-kicker">Fluxo sugerido</span>
              <strong>Revise contas, acompanhe o crawler e valide o catálogo</strong>
              <p>Essa ordem reduz erro operacional e deixa a manutenção diária mais simples.</p>
            </div>
          </div>

          <div className="workspace-sidebar-footer super-admin-footer">
            <Button variant="secondary" onClick={() => logout()}>Sair</Button>
          </div>
        </div>
      </aside>

      <main className="super-admin-main workspace-main">
        <header className="header super-admin-topbar">
          <div className="dashboard-topbar-main">
            <div className="dashboard-topbar-title-row">
              <button type="button" className="sidebar-toggle" onClick={() => setSidebarOpen((current) => !current)} aria-label="Abrir menu lateral">Menu</button>
              <div className="header-copy">
                <span className="header-breadcrumb">{header.section} / {header.title}</span>
                <h2>{header.title}</h2>
                <span className="header-subtitle">{header.subtitle}</span>
              </div>
            </div>
            <div className="header-meta-row">
              <span className="workspace-pill">Super admin</span>
              <span className="workspace-pill subtle">Atualizado em {todayLabel}</span>
            </div>
          </div>

          <div className="header-actions">
            <div className="workspace-user-chip">
              <span className="workspace-user-avatar">{(name || 'S').trim().charAt(0).toUpperCase()}</span>
              <div>
                <strong>{name || 'Super Admin'}</strong>
                <span>Controle da plataforma</span>
              </div>
            </div>
            <Button variant="secondary" onClick={() => logout()}>Sair</Button>
          </div>
        </header>

        <div className="workspace-content super-admin-content">{children}</div>
      </main>
    </div>
  );
};

export default SuperAdminLayout;
