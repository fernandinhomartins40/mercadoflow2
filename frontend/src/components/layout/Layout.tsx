import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight, CreditCard, History, Home, LayoutGrid, LogOut, MessageSquare, Mic, Search, Settings, Sparkles, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { DESTINATIONS, resolveLocation, visiblePages } from '../../config/navigation';
import SubscriptionBanner from '../billing/SubscriptionBanner';
import '../../styles/flow.css';

/**
 * Casca do app do mercado (visual Flow): topo com a trilha e o perfil, doca
 * escura no pé com o Mapa da loja, o Início, a pergunta ao Tino e as áreas.
 */

const ASK: Record<string, string> = {
  hoje: 'O que você quer resolver hoje?',
  comprar: 'O que você precisa comprar?',
  produtos: 'Qual produto você quer entender?',
  vender: 'O que você quer promover na loja?',
  loja: 'O que você precisa configurar na loja?',
};

const initialsOf = (name?: string | null, email?: string | null) => {
  const base = (name || email || '?').trim();
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { role, name, email, logout } = useAuth();
  const { destination, page } = resolveLocation(pathname);
  const isAdmin = role === 'ADMIN';
  const isOwner = role === 'MARKET_OWNER';
  const [mapOpen, setMapOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [ask, setAsk] = useState('');
  const mapRef = useRef<HTMLDivElement>(null);
  const asking = pathname === '/app/perguntar';
  const siblings = visiblePages(destination, isAdmin, isOwner);

  useEffect(() => { setMapOpen(false); setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMapOpen(false); setMenuOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const areas = useMemo(() => DESTINATIONS.map((d) => ({ d, pages: visiblePages(d, isAdmin, isOwner) })), [isAdmin, isOwner]);
  const q = query.trim().toLowerCase();
  const found = (label: string, hint = '') => !q || label.toLowerCase().includes(q) || hint.toLowerCase().includes(q);

  const submitAsk = (e: React.FormEvent) => {
    e.preventDefault();
    const text = ask.trim();
    navigate(text ? `/app/perguntar?q=${encodeURIComponent(text)}` : '/app/perguntar');
    setAsk('');
  };

  return (
    <div className="fx-app">
      <header className="fx-top">
        <div className="fx-brand">
          <Link to="/app" className="fx-brand" style={{ textDecoration: 'none', color: 'inherit' }} aria-label="MercadoFlow, início">
            <span className="fx-logo" aria-hidden="true">MF</span>
            <span className="fx-brandname">Mercado<span>Flow</span></span>
          </Link>
          <nav className="fx-crumbs" aria-label="Você está em">
            <Link to={asking ? '/app' : siblings[0]?.to ?? '/app'}>{asking || page.label === destination.label ? 'Sua loja' : destination.label}</Link>
            <span aria-hidden="true">/</span>
            <b>{asking ? 'Perguntar aos dados' : page.label}</b>
          </nav>
        </div>
        <div className="fx-top-right">
          {!asking && (
            <Link to="/app/perguntar" className="fx-pill-btn"><MessageSquare size={17} aria-hidden="true" /><span className="lbl">Perguntar aos dados</span></Link>
          )}
          <span className="fx-watch" role="status"><i aria-hidden="true" />Tino acompanhando a loja</span>
          <button type="button" className="fx-avatar" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}
            aria-label="Sua conta">{initialsOf(name, email)}</button>
          {menuOpen && (
            <div className="fx-menu" role="menu">
              <div className="who"><b>{name || 'Sua conta'}</b><span>{email}</span></div>
              <Link to="/app/assinatura" role="menuitem"><CreditCard size={17} />Minha assinatura</Link>
              <Link to="/app/configuracoes" role="menuitem"><Settings size={17} />Conta e segurança</Link>
              <button type="button" role="menuitem" onClick={logout}><LogOut size={17} />Sair</button>
            </div>
          )}
        </div>
      </header>

      <main className="fx-main">
        {siblings.length > 1 && !asking && (
          <nav className="fx-area" aria-label={`Páginas de ${destination.label}`}>
            {siblings.map((p) => {
              const I = p.icon;
              return <Link key={p.to} to={p.to} className={p.to === page.to ? 'active' : ''} aria-current={p.to === page.to ? 'page' : undefined}><I aria-hidden="true" />{p.label}</Link>;
            })}
          </nav>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 1.6vw, 22px)' }}>
          <SubscriptionBanner />
          {children}
        </div>
      </main>

      {mapOpen && (
        <div className="fx-map" ref={mapRef} role="dialog" aria-label="Mapa da loja">
          <header>
            <b>Mapa da loja</b>
            <button type="button" onClick={() => setMapOpen(false)} aria-label="Fechar o mapa"><X size={20} /></button>
          </header>
          <label className="search">
            <Search size={18} aria-hidden="true" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Encontrar uma área..." aria-label="Encontrar uma área" />
          </label>
          {areas.map(({ d, pages }) => {
            const list = pages.filter((p) => found(p.label, d.label + ' ' + d.hint));
            if (list.length === 0) return null;
            return (
              <section key={d.key}>
                <h4>{d.label} · {d.hint}</h4>
                <div className="grid">
                  {list.map((p) => {
                    const I = p.icon;
                    return <Link key={p.to} to={p.to} className={`tile ${p.to === page.to ? 'active' : ''}`}><I aria-hidden="true" />{p.label}</Link>;
                  })}
                </div>
              </section>
            );
          })}
          {found('Perguntar aos dados', 'pergunta ia jev') && (
            <section>
              <h4>Tino</h4>
              <div className="grid">
                <Link to="/app/perguntar" className="tile"><Sparkles aria-hidden="true" />Perguntar aos dados</Link>
                <Link to="/app/copiloto" className="tile"><History aria-hidden="true" />Histórico</Link>
              </div>
            </section>
          )}
        </div>
      )}

      <nav className="fx-dock" aria-label="Navegação">
        <button type="button" className="fx-dock-btn lime" aria-expanded={mapOpen} onClick={() => { setMapOpen((v) => !v); setQuery(''); }}>
          <LayoutGrid aria-hidden="true" /><span className="lbl">Mapa</span>
        </button>
        <Link to="/app" className={`fx-dock-btn ${pathname === '/app' ? 'current' : ''}`}><Home aria-hidden="true" /><span className="lbl">Início</span></Link>
        <form className="fx-ask" onSubmit={submitAsk} role="search">
          <Sparkles className="spark" aria-hidden="true" />
          <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={ASK[destination.key] ?? ASK.hoje} aria-label="Pergunte ou peça algo ao Tino" />
          <button type="button" className="mic" aria-label="Falar com o Tino" onClick={() => navigate('/app/perguntar?voz=1')}><Mic size={20} /></button>
          <button type="submit" className="send" aria-label="Enviar"><ArrowRight size={20} /></button>
        </form>
        <Link to="/app/perguntar" className="fx-dock-btn ask-mobile" aria-label="Perguntar ao Tino"><Sparkles aria-hidden="true" /></Link>
        <span className="sep" aria-hidden="true" />
        {DESTINATIONS.filter((d) => d.key !== 'hoje').map((d) => {
          const I = d.icon;
          const first = visiblePages(d, isAdmin, isOwner)[0];
          return (
            <Link key={d.key} to={first?.to ?? '/app'} className={`fx-dock-btn ${destination.key === d.key ? 'current' : ''}`} aria-current={destination.key === d.key ? 'page' : undefined}>
              <I aria-hidden="true" /><span className="lbl">{d.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default Layout;
