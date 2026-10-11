import React, { createContext, useContext, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight, BarChart3, Building2, Factory, Home, LayoutGrid, Loader2, LogOut, Megaphone, Network, Package, Search, ShoppingBag, Tags,
  Users, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { sellerService, type SellerMe } from '../../services/commerce.service';
import { errorText } from '../../services/industry.service';
import '../../styles/flow.css';

/**
 * Casca do portal de vendas (indústria e distribuidor) no visual Flow, a mesma
 * do app do mercado, do super admin e do portal da indústria: topo com a
 * trilha e o perfil, abas da área e doca escura no pé com o mapa, o Início e a
 * busca de telas.
 */

const MeContext = createContext<{ me: SellerMe | null; reload: () => Promise<void> }>({ me: null, reload: async () => {} });
export const useSeller = () => useContext(MeContext);

interface Page { to: string; label: string; hint: string; icon: React.ElementType; section: string; exact?: boolean; industryOnly?: boolean }

const PAGES: Page[] = [
  { to: '/vendas', label: 'Hoje', hint: 'Pedidos e campanhas em andamento', icon: Home, section: 'Vender', exact: true },
  { to: '/vendas/pedidos', label: 'Pedidos', hint: 'Confirmar, faturar e entregar', icon: ShoppingBag, section: 'Vender' },
  { to: '/vendas/campanhas', label: 'Campanhas', hint: 'Condições especiais para as lojas', icon: Megaphone, section: 'Vender' },
  { to: '/vendas/clientes', label: 'Clientes', hint: 'Lojas que compraram ou autorizaram', icon: Users, section: 'Vender' },
  { to: '/vendas/catalogo', label: 'Catálogo', hint: 'Produtos, embalagens e estoque', icon: Package, section: 'Oferta' },
  { to: '/vendas/precos', label: 'Preços', hint: 'Tabelas por região e quantidade', icon: Tags, section: 'Oferta' },
  { to: '/vendas/distribuicao', label: 'Distribuição', hint: 'Distribuidores, áreas e contas diretas', icon: Network, section: 'Oferta', industryOnly: true },
  { to: '/vendas/conta', label: 'Conta', hint: 'Área de entrega, pedido mínimo e contato', icon: Building2, section: 'Conta' },
];
const SECTIONS = ['Vender', 'Oferta', 'Conta'];

const SellerLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { name, email, role, logout } = useAuth();
  const [me, setMe] = useState<SellerMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [find, setFind] = useState('');

  const reload = async () => {
    try {
      setMe(await sellerService.me());
    } catch (e) {
      setError(errorText(e, 'Não foi possível abrir o portal agora. Tente de novo em instantes.'));
    }
  };
  useEffect(() => { void reload(); }, []);
  useEffect(() => { setMenu(false); setMapOpen(false); }, [location.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); setMapOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pages = PAGES.filter((p) => !p.industryOnly || me?.kind === 'INDUSTRIA');
  const current = pages.find((p) => (p.exact ? location.pathname === p.to : location.pathname.startsWith(p.to)));
  const q = query.trim().toLowerCase();
  const out = async () => { await logout(); window.location.href = '/login'; };
  const open = me?.access || location.pathname.startsWith('/vendas/conta');

  return (
    <MeContext.Provider value={{ me, reload }}>
      <div className="fx-app">
        <header className="fx-top">
          <div className="fx-brand">
            <Link to="/vendas" className="fx-brand" style={{ textDecoration: 'none', color: 'inherit' }} aria-label="Portal de vendas, início">
              <span className="fx-logo" aria-hidden="true" style={{ background: 'var(--fx-forest)' }}>VD</span>
              <span className="fx-brandname">Mercado<span>Flow</span></span>
            </Link>
            <nav className="fx-crumbs" aria-label="Você está em">
              <Link to="/vendas">{me?.name ?? 'Vendas'}</Link>
              <span aria-hidden="true">/</span>
              <b>{current?.label ?? 'Hoje'}</b>
            </nav>
          </div>
          <div className="fx-top-right">
            <span className="fx-watch" role="status">
              {me?.kind === 'INDUSTRIA' ? <Factory size={16} aria-hidden="true" /> : <ShoppingBag size={16} aria-hidden="true" />}
              {me?.kind === 'INDUSTRIA' ? 'Indústria' : 'Distribuidor'}
            </span>
            <button type="button" className="fx-avatar" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)} aria-label="Sua conta">
              {(name || email || 'VD').trim().slice(0, 2).toUpperCase()}
            </button>
            {menu && (
              <div className="fx-menu" role="menu">
                <div className="who"><b>{name || me?.name || 'Sua conta'}</b><span>{email}</span></div>
                <Link to="/vendas/conta" role="menuitem"><Building2 size={17} />Conta</Link>
                {role === 'INDUSTRY_USER' && <Link to="/industria" role="menuitem"><BarChart3 size={17} />Dados de venda (portal da indústria)</Link>}
                <button type="button" role="menuitem" onClick={out}><LogOut size={17} />Sair</button>
              </div>
            )}
          </div>
        </header>

        <main className="fx-main">
          <nav className="fx-area" aria-label="Páginas do portal de vendas">
            {pages.map((p) => {
              const I = p.icon;
              const on = p.to === current?.to;
              return <Link key={p.to} to={p.to} className={on ? 'active' : ''} aria-current={on ? 'page' : undefined}><I aria-hidden="true" />{p.label}</Link>;
            })}
          </nav>
          <div className="workspace-stage flex min-h-0 flex-1 flex-col gap-6 overflow-x-hidden">
            {error && <div className="fx-card fx-card-pad" role="alert">{error}</div>}
            {!me && !error && <p className="fx-muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 className="animate-spin" size={18} />Carregando…</p>}
            {me && (open ? children : <NoAccess me={me} />)}
          </div>
        </main>

        {mapOpen && (
          <div className="fx-map" role="dialog" aria-label="Mapa do portal de vendas">
            <header>
              <b>Mapa do portal</b>
              <button type="button" onClick={() => setMapOpen(false)} aria-label="Fechar o mapa"><X size={20} /></button>
            </header>
            <label className="search">
              <Search size={18} aria-hidden="true" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Encontrar uma tela..." aria-label="Encontrar uma tela" />
            </label>
            {SECTIONS.map((s) => {
              const list = pages.filter((p) => p.section === s && (!q || `${p.label} ${p.hint} ${s}`.toLowerCase().includes(q)));
              if (list.length === 0) return null;
              return (
                <section key={s}>
                  <h4>{s}</h4>
                  <div className="grid">
                    {list.map((p) => {
                      const I = p.icon;
                      return <Link key={p.to} to={p.to} className={`tile ${p.to === current?.to ? 'active' : ''}`}><I aria-hidden="true" />{p.label}</Link>;
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <nav className="fx-dock" aria-label="Navegação do portal de vendas">
          <button type="button" className="fx-dock-btn lime" aria-expanded={mapOpen} onClick={() => { setMapOpen((v) => !v); setQuery(''); }}>
            <LayoutGrid aria-hidden="true" /><span className="lbl">Mapa</span>
          </button>
          <Link to="/vendas" className={`fx-dock-btn ${location.pathname === '/vendas' ? 'current' : ''}`}><Home aria-hidden="true" /><span className="lbl">Início</span></Link>
          <form className="fx-ask" role="search" onSubmit={(e) => { e.preventDefault(); setQuery(find); setMapOpen(true); setFind(''); }}>
            <Search className="spark" aria-hidden="true" />
            <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Encontrar uma tela do portal..." aria-label="Encontrar uma tela do portal" />
            <button type="submit" className="send" aria-label="Procurar"><ArrowRight size={20} /></button>
          </form>
          <span className="sep" aria-hidden="true" />
          {pages.filter((p) => ['/vendas/pedidos', '/vendas/campanhas', '/vendas/catalogo', '/vendas/precos'].includes(p.to)).map((p) => {
            const I = p.icon;
            const on = p.to === current?.to;
            return (
              <Link key={p.to} to={p.to} className={`fx-dock-btn ${on ? 'current' : ''}`} aria-current={on ? 'page' : undefined}>
                <I aria-hidden="true" /><span className="lbl">{p.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </MeContext.Provider>
  );
};

/** Vendedor em análise ou suspenso: diz o que falta. */
const NoAccess: React.FC<{ me: SellerMe }> = ({ me }) => (
  <section className="fx-forest" aria-label="Acesso às vendas">
    <h1 className="fx-title" style={{ color: 'inherit', fontSize: 'clamp(26px, 3vw, 40px)' }}>
      {me.status === 'SUSPENSO' ? 'As vendas da sua empresa estão suspensas.' : me.status === 'ENCERRADO' ? 'O cadastro de vendas foi encerrado.' : 'Seu cadastro de vendas está em análise.'}
    </h1>
    <p style={{ maxWidth: '62ch', lineHeight: 1.6, opacity: 0.9 }}>
      {me.status === 'EM_ANALISE'
        ? 'A equipe do MercadoFlow confere o CNPJ e libera as vendas. Enquanto isso, preencha a área de entrega e as condições na sua conta.'
        : 'Fale com o MercadoFlow para entender o que aconteceu.'}
      {me.status_reason ? ` Motivo: ${me.status_reason}.` : ''}
    </p>
    <p style={{ marginTop: 16 }}><Link to="/vendas/conta" className="fx-btn lime">Abrir a conta</Link></p>
  </section>
);

export default SellerLayout;
