import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Button from '../common/Button';
import { useSuperAdminAuth } from '../../context/SuperAdminAuthContext';

const TITLES: Record<string, { title: string; subtitle: string; section: string }> = {
  '/super-admin': { title: 'Visao geral', subtitle: 'Leitura central da plataforma, contas e indicadores do ecossistema', section: 'Controle' },
  '/super-admin/saas': { title: 'Gestao SaaS', subtitle: 'Contas, usuarios, vencimentos e liberacoes manuais', section: 'Controle' },
  '/super-admin/catalogo': { title: 'Catalogo global', subtitle: 'Cadastro manual, enriquecimento e gestao da base consolidada', section: 'Dados' },
  '/super-admin/crawler': { title: 'Crawler web', subtitle: 'Execucoes de coleta, reparos e ingestao da malha de supermercados', section: 'Dados' },
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
        { to: '/super-admin', label: 'Visao geral', hint: 'Saude da plataforma', mark: 'VG' },
        { to: '/super-admin/saas', label: 'Gestao SaaS', hint: 'Contas e acessos', mark: 'SS' },
      ],
    },
    {
      title: 'Dados',
      links: [
        { to: '/super-admin/catalogo', label: 'Catalogo global', hint: 'Base central de produtos', mark: 'CG' },
        { to: '/super-admin/crawler', label: 'Crawler web', hint: 'Captura e reparo de dados', mark: 'CW' },
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

        <div className="sidebar-user-card super-admin-user-card">
          <span className="section-kicker">Sessao ativa</span>
          <strong>{name || 'Super Admin'}</strong>
          <span>{email || 'Conta principal da plataforma'}</span>
          <div className="sidebar-user-meta">
            <span className="sidebar-chip">Controle total</span>
            <span className="sidebar-chip subtle">Painel mestre</span>
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
          <span className="section-kicker">Roteiro recomendado</span>
          <strong>Comece no SaaS, valide no crawler e revise no catalogo</strong>
          <p>Esse fluxo reduz erro operacional e deixa a manutencao da plataforma mais previsivel para operadores nao tecnicos.</p>
        </div>

        <div className="super-admin-footer">
          <Button variant="secondary" onClick={() => logout()}>Sair</Button>
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
