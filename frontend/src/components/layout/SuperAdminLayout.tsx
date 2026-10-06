import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Bot, Plug, Briefcase, ClipboardCheck, CreditCard, Database, Factory, Globe2, Home, LayoutGrid, LayoutTemplate, LogOut, Palette,
  Receipt, Search, ShieldCheck, Sparkles, UserSquare2, Users, X, type LucideIcon,
} from 'lucide-react';
import type { WorkspaceNavSection } from './WorkspaceSidebar';
import { Link, useLocation } from 'react-router-dom';
import { useSuperAdminAuth } from '../../context/SuperAdminAuthContext';
import '../../styles/flow.css';
import { FEATURE_OFFER_TEMPLATES_ENABLED, FEATURE_STATE_PRICES_ENABLED } from '../../config/features';

const TITLES: Record<string, { title: string; subtitle: string; section: string }> = {
  '/super-admin': { title: 'Visão geral', subtitle: 'Resumo da plataforma, das contas e da base de dados', section: 'Controle' },
  '/super-admin/saas': { title: 'Contas e acesso', subtitle: 'Contas, usuários, vencimentos e liberações manuais', section: 'Controle' },
  '/super-admin/catalogo': { title: 'Catálogo global', subtitle: 'Base central de produtos, ajustes manuais e revisão da qualidade', section: 'Dados' },
  '/super-admin/precos-estaduais': { title: 'Preços estaduais', subtitle: 'Comparação dos preços praticados entre estados e fontes oficiais', section: 'Dados' },
  '/super-admin/crawler': { title: 'Crawler', subtitle: 'Coletas, reparos e atualização de dados dos supermercados', section: 'Dados' },
  '/super-admin/ofertas': { title: 'Templates de ofertas', subtitle: 'Base visual compartilhada para as contas da plataforma', section: 'Dados' },
  '/super-admin/parceiros': { title: 'Parceiros ERP', subtitle: 'Cadastro, homologação e lista pública dos ERPs integrados', section: 'Dados' },
  '/super-admin/ia': { title: 'IA e APIs', subtitle: 'Chaves, roteamento, orçamento, piloto e console da IA da plataforma', section: 'Inteligência' },
  '/super-admin/confere': { title: 'Confere', subtitle: 'App grátis de conferência: leitura de notas, créditos e pagamentos', section: 'Conteúdo' },
  '/super-admin/industria': { title: 'Indústrias', subtitle: 'Empresas, carteira de produtos, contratos e prévia', section: 'Indústria' },
  '/super-admin/industria/dados': { title: 'Privacidade e dados', subtitle: 'Regras de anonimato, lojas e agregados', section: 'Indústria' },
  '/super-admin/industria/cobranca': { title: 'Cobrança da indústria', subtitle: 'Faturas por produto analisado', section: 'Indústria' },
  '/super-admin/temas': { title: 'Temas de encarte', subtitle: 'Fundos, selos e áreas que o editor dos mercados usa para montar as artes', section: 'Conteúdo' },
};

const SECTION_ICON: Record<string, LucideIcon> = {
  Comercial: Briefcase, 'Indústria': Factory, Dados: Database, 'Inteligência': Sparkles, 'Conteúdo': Palette,
};

/** Casca do painel do super admin no visual Flow: topo, mapa e doca, como no app do mercado. */
const SuperAdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { logout, name, email } = useSuperAdminAuth();
  const [mapOpen, setMapOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [find, setFind] = useState('');

  useEffect(() => { setMapOpen(false); setMenuOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMapOpen(false); setMenuOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const header = useMemo(() => {
    if (TITLES[location.pathname]) return TITLES[location.pathname];
    const prefix = Object.keys(TITLES).find((key) => key !== '/super-admin' && location.pathname.startsWith(`${key}/`));
    return prefix ? TITLES[prefix] : TITLES['/super-admin'];
  }, [location.pathname]);

  const navSections: WorkspaceNavSection[] = [
    {
      title: 'Controle',
      items: [
        { to: '/super-admin', label: 'Visão geral', hint: 'Saúde da plataforma', icon: Home, exact: true },
        { to: '/super-admin/saas', label: 'Contas e usuários', hint: 'Mercados e acessos', icon: Users },
      ],
    },
    {
      title: 'Comercial',
      items: [
        { to: '/super-admin/clientes', label: 'Clientes', hint: 'Ficha, saúde e follow-ups', icon: UserSquare2 },
        { to: '/super-admin/assinaturas', label: 'Assinaturas', hint: 'Planos, preços e contratos', icon: CreditCard },
        { to: '/super-admin/cobranca', label: 'Cobrança', hint: 'Inadimplência e régua', icon: Receipt },
      ],
    },
    {
      title: 'Indústria',
      items: [
        { to: '/super-admin/industria', label: 'Indústrias', hint: 'Carteira, contratos e prévia', icon: Factory, exact: true },
        { to: '/super-admin/industria/dados', label: 'Privacidade e dados', hint: 'Anonimato, lojas e agregados', icon: ShieldCheck },
        { to: '/super-admin/industria/cobranca', label: 'Cobrança da indústria', hint: 'Faturas por produto', icon: Receipt },
      ],
    },
    {
      title: 'Dados',
      items: [
        { to: '/super-admin/catalogo', label: 'Catálogo global', hint: 'Base central de produtos', icon: Database },
        { to: '/super-admin/precos-estaduais', label: 'Preços estaduais', hint: 'Comparação entre estados', icon: Globe2 },
        { to: '/ofertas?workspace=super-admin', label: 'Templates de ofertas', hint: 'Base visual por conta', icon: LayoutTemplate },
        { to: '/super-admin/crawler', label: 'Crawler', hint: 'Coleta e reparo de dados', icon: Bot },
        { to: '/super-admin/parceiros', label: 'Parceiros ERP', hint: 'API de integração e homologação', icon: Plug },
      ],
    },
    {
      title: 'Inteligência',
      items: [
        { to: '/super-admin/ia', label: 'IA e APIs', hint: 'Chaves, créditos e testes da IA', icon: Sparkles },
      ],
    },
    {
      title: 'Conteúdo',
      items: [
        { to: '/super-admin/temas', label: 'Temas de encarte', hint: 'Fundos, selos e áreas com IA', icon: Palette },
        { to: '/super-admin/confere', label: 'Confere', hint: 'Leitura de notas e créditos', icon: ClipboardCheck },
      ],
    },
  ].map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.to === '/super-admin/precos-estaduais') {
        return FEATURE_STATE_PRICES_ENABLED;
      }
      if (item.to === '/ofertas?workspace=super-admin') {
        return FEATURE_OFFER_TEMPLATES_ENABLED;
      }
      return true;
    }),
  }));

  const all = navSections.flatMap((s) => s.items.map((it) => ({ ...it, section: s.title })));
  const current = all.find((it) => (it.exact ? location.pathname === it.to : location.pathname === it.to || location.pathname.startsWith(`${it.to}/`)))
    ?? all.find((it) => it.to === '/super-admin');
  const siblings = navSections.find((s) => s.title === current?.section)?.items ?? [];
  const q = query.trim().toLowerCase();

  return (
    <div className="fx-app super-admin-workspace">
      <header className="fx-top">
        <div className="fx-brand">
          <Link to="/super-admin" className="fx-brand" style={{ textDecoration: 'none', color: 'inherit' }} aria-label="Super Admin, visão geral">
            <span className="fx-logo" aria-hidden="true" style={{ background: 'var(--fx-forest)' }}>SA</span>
            <span className="fx-brandname">Mercado<span>Flow</span></span>
          </Link>
          <nav className="fx-crumbs" aria-label="Você está em">
            <Link to={siblings[0]?.to ?? '/super-admin'}>{current?.section ?? header.section}</Link>
            <span aria-hidden="true">/</span>
            <b>{current?.label ?? header.title}</b>
          </nav>
        </div>
        <div className="fx-top-right">
          <span className="fx-watch" role="status"><i aria-hidden="true" />Super Admin</span>
          <button type="button" className="fx-avatar" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)} aria-label="Sua conta">
            {(name || email || 'SA').trim().slice(0, 2).toUpperCase()}
          </button>
          {menuOpen && (
            <div className="fx-menu" role="menu">
              <div className="who"><b>{name || 'Super Administrador'}</b><span>{email}</span></div>
              <button type="button" role="menuitem" onClick={() => logout()}><LogOut size={17} />Sair</button>
            </div>
          )}
        </div>
      </header>

      <main className="fx-main">
        {siblings.length > 1 && (
          <nav className="fx-area" aria-label={`Páginas de ${current?.section ?? ''}`}>
            {siblings.map((p) => {
              const I = p.icon;
              const on = p.to === current?.to;
              return <Link key={p.to} to={p.to} className={on ? 'active' : ''} aria-current={on ? 'page' : undefined}><I aria-hidden="true" />{p.label}</Link>;
            })}
          </nav>
        )}
        <div className="workspace-stage flex min-h-0 flex-1 flex-col gap-6 overflow-x-hidden">{children}</div>
      </main>

      {mapOpen && (
        <div className="fx-map" role="dialog" aria-label="Mapa do painel">
          <header>
            <b>Mapa do painel</b>
            <button type="button" onClick={() => setMapOpen(false)} aria-label="Fechar o mapa"><X size={20} /></button>
          </header>
          <label className="search">
            <Search size={18} aria-hidden="true" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Encontrar uma tela..." aria-label="Encontrar uma tela" />
          </label>
          {navSections.map((s) => {
            const list = s.items.filter((it) => !q || `${it.label} ${it.hint} ${s.title}`.toLowerCase().includes(q));
            if (list.length === 0) return null;
            return (
              <section key={s.title}>
                <h4>{s.title}</h4>
                <div className="grid">
                  {list.map((it) => {
                    const I = it.icon;
                    return <Link key={it.to} to={it.to} className={`tile ${it.to === current?.to ? 'active' : ''}`}><I aria-hidden="true" />{it.label}</Link>;
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <nav className="fx-dock" aria-label="Navegação do painel">
        <button type="button" className="fx-dock-btn lime" aria-expanded={mapOpen} onClick={() => { setMapOpen((v) => !v); setQuery(''); }}>
          <LayoutGrid aria-hidden="true" /><span className="lbl">Mapa</span>
        </button>
        <Link to="/super-admin" className={`fx-dock-btn ${location.pathname === '/super-admin' ? 'current' : ''}`}><Home aria-hidden="true" /><span className="lbl">Início</span></Link>
        <form className="fx-ask" role="search" onSubmit={(e) => { e.preventDefault(); setQuery(find); setMapOpen(true); setFind(''); }}>
          <Search className="spark" aria-hidden="true" />
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Encontrar uma tela do painel..." aria-label="Encontrar uma tela do painel" />
          <button type="submit" className="send" aria-label="Procurar"><ArrowRight size={20} /></button>
        </form>
        <span className="sep" aria-hidden="true" />
        {navSections.filter((s) => s.title !== 'Controle').map((s) => {
          const I = SECTION_ICON[s.title] ?? Sparkles;
          const on = current?.section === s.title;
          return (
            <Link key={s.title} to={s.items[0]?.to ?? '/super-admin'} className={`fx-dock-btn ${on ? 'current' : ''}`} aria-current={on ? 'page' : undefined}>
              <I aria-hidden="true" /><span className="lbl">{s.title}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default SuperAdminLayout;
