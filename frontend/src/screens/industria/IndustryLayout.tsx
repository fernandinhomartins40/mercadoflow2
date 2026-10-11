import React, { Suspense, createContext, lazy, useContext, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight, BarChart3, Building2, Home, LayoutGrid, Loader2, LogOut, Map as MapIcon, Package, PieChart, Search, ShieldCheck, ShoppingBag, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { industryService, type IndustryMe } from '../../services/industry.service';
import '../../styles/flow.css';
import { ChartSkeleton } from '../../components/charts/chartKit';

const BarsChart = lazy(() => import('../../components/charts/BarsChart'));

/**
 * Casca do portal da indústria no visual Flow, a mesma do app do mercado e do
 * super admin: topo com a trilha e o perfil, abas da área e doca escura no pé
 * com o mapa, o Início e a busca de telas. Carrega a empresa e o contrato uma
 * vez e repassa às telas.
 */

const MeContext = createContext<{ me: IndustryMe | null; reload: () => Promise<void> }>({ me: null, reload: async () => {} });
export const useIndustry = () => useContext(MeContext);

const PAGES = [
  { to: '/industria', label: 'Hoje', hint: 'Resumo da semana', icon: BarChart3, exact: true, section: 'Dados' },
  { to: '/industria/mapa', label: 'Mapa', hint: 'Venda por UF, cidade e bairro', icon: MapIcon, section: 'Dados' },
  { to: '/industria/produtos', label: 'Produtos', hint: 'Carteira e histórico', icon: Package, section: 'Dados' },
  { to: '/industria/categoria', label: 'Categoria', hint: 'Participação na categoria', icon: PieChart, section: 'Dados' },
  { to: '/industria/conta', label: 'Contrato e cobertura', hint: 'Pacote, área e lojas', icon: Building2, section: 'Conta' },
];
const SECTIONS = ['Dados', 'Conta'];

const IndustryLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { name, email, logout } = useAuth();
  const [me, setMe] = useState<IndustryMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [find, setFind] = useState('');

  const reload = async () => {
    try {
      setMe(await industryService.me());
    } catch {
      setError('Não foi possível abrir o portal agora. Tente de novo em instantes.');
    }
  };
  useEffect(() => { reload(); }, []);
  useEffect(() => { setMenu(false); setMapOpen(false); }, [location.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); setMapOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = PAGES.find((p) => (p.exact ? location.pathname === p.to : location.pathname.startsWith(p.to)));
  const q = query.trim().toLowerCase();
  const out = async () => { await logout(); window.location.href = '/login'; };

  return (
    <MeContext.Provider value={{ me, reload }}>
      <div className="fx-app">
        <header className="fx-top">
          <div className="fx-brand">
            <Link to="/industria" className="fx-brand" style={{ textDecoration: 'none', color: 'inherit' }} aria-label="Portal da indústria, início">
              <span className="fx-logo" aria-hidden="true" style={{ background: 'var(--fx-forest)' }}>IN</span>
              <span className="fx-brandname">Mercado<span>Flow</span></span>
            </Link>
            <nav className="fx-crumbs" aria-label="Você está em">
              <Link to="/industria">{me?.name ?? 'Indústria'}</Link>
              <span aria-hidden="true">/</span>
              <b>{current?.label ?? 'Hoje'}</b>
            </nav>
          </div>
          <div className="fx-top-right">
            <span className="fx-watch" role="status"><ShieldCheck size={16} aria-hidden="true" />Dados anônimos</span>
            <button type="button" className="fx-avatar" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)} aria-label="Sua conta">
              {(name || email || 'IN').trim().slice(0, 2).toUpperCase()}
            </button>
            {menu && (
              <div className="fx-menu" role="menu">
                <div className="who"><b>{name || me?.name || 'Sua conta'}</b><span>{email}</span></div>
                <Link to="/industria/conta" role="menuitem"><Building2 size={17} />Contrato e cobertura</Link>
                <Link to="/vendas" role="menuitem"><ShoppingBag size={17} />Vender às lojas (portal de vendas)</Link>
                <button type="button" role="menuitem" onClick={out}><LogOut size={17} />Sair</button>
              </div>
            )}
          </div>
        </header>

        <main className="fx-main">
          <nav className="fx-area" aria-label="Páginas do portal">
            {PAGES.map((p) => {
              const I = p.icon;
              const on = p.to === current?.to;
              return <Link key={p.to} to={p.to} className={on ? 'active' : ''} aria-current={on ? 'page' : undefined}><I aria-hidden="true" />{p.label}</Link>;
            })}
          </nav>
          <div className="workspace-stage flex min-h-0 flex-1 flex-col gap-6 overflow-x-hidden">
            {error && <div className="fx-card fx-card-pad" role="alert">{error}</div>}
            {!me && !error && <p className="fx-muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 className="animate-spin" size={18} />Carregando…</p>}
            {me && (me.access || location.pathname.startsWith('/industria/produtos') || location.pathname.startsWith('/industria/conta')
              ? children : <NoAccess me={me} />)}
          </div>
        </main>

        {mapOpen && (
          <div className="fx-map" role="dialog" aria-label="Mapa do portal">
            <header>
              <b>Mapa do portal</b>
              <button type="button" onClick={() => setMapOpen(false)} aria-label="Fechar o mapa"><X size={20} /></button>
            </header>
            <label className="search">
              <Search size={18} aria-hidden="true" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Encontrar uma tela..." aria-label="Encontrar uma tela" />
            </label>
            {SECTIONS.map((s) => {
              const list = PAGES.filter((p) => p.section === s && (!q || `${p.label} ${p.hint} ${s}`.toLowerCase().includes(q)));
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

        <nav className="fx-dock" aria-label="Navegação do portal">
          <button type="button" className="fx-dock-btn lime" aria-expanded={mapOpen} onClick={() => { setMapOpen((v) => !v); setQuery(''); }}>
            <LayoutGrid aria-hidden="true" /><span className="lbl">Mapa</span>
          </button>
          <Link to="/industria" className={`fx-dock-btn ${location.pathname === '/industria' ? 'current' : ''}`}><Home aria-hidden="true" /><span className="lbl">Início</span></Link>
          <form className="fx-ask" role="search" onSubmit={(e) => { e.preventDefault(); setQuery(find); setMapOpen(true); setFind(''); }}>
            <Search className="spark" aria-hidden="true" />
            <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Encontrar uma tela do portal..." aria-label="Encontrar uma tela do portal" />
            <button type="submit" className="send" aria-label="Procurar"><ArrowRight size={20} /></button>
          </form>
          <span className="sep" aria-hidden="true" />
          {PAGES.filter((p) => !p.exact).map((p) => {
            const I = p.icon;
            const on = p.to === current?.to;
            return (
              <Link key={p.to} to={p.to} className={`fx-dock-btn ${on ? 'current' : ''}`} aria-current={on ? 'page' : undefined}>
                <I aria-hidden="true" /><span className="lbl">{p.section === 'Conta' ? 'Contrato' : p.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </MeContext.Provider>
  );
};

/** Sem contrato vigente ou empresa em análise: diz o que falta, sem dado nenhum. */
const NoAccess: React.FC<{ me: IndustryMe }> = ({ me }) => (
  <section className="fx-forest" aria-label="Acesso aos dados">
    <h1 className="fx-title" style={{ color: 'inherit', fontSize: 'clamp(26px, 3vw, 40px)' }}>
      {me.status === 'SUSPENSA' ? 'O acesso da sua empresa está suspenso.' : me.status === 'EM_ANALISE' ? 'Seu cadastro está em análise.' : 'Falta ativar o contrato.'}
    </h1>
    <p style={{ maxWidth: '62ch', lineHeight: 1.6, opacity: 0.9 }}>
      {me.message ?? 'Assim que o contrato estiver vigente, os dados dos seus produtos aparecem aqui.'}
      {me.status_reason ? ` Motivo: ${me.status_reason}.` : ''}
    </p>
    {me.status === 'ATIVA' && (
      <p style={{ marginTop: 16 }}><Link to="/industria/produtos" className="fx-btn lime">Pedir a liberação dos seus produtos</Link></p>
    )}
  </section>
);

/** Barras de uma série (Recharts, carregado só quando aparece), com tooltip e tabela. */
export const Bars: React.FC<{ points: { label: string; value: number }[]; height?: number; unit?: string; label: string }> = ({ points, height = 170, unit = '', label }) => {
  if (points.length === 0) return <p className="fx-muted">Sem dados publicados neste recorte.</p>;
  return (
    <Suspense fallback={<ChartSkeleton height={height} />}>
      <BarsChart data={points} name={label} kind="number" unit={unit} height={height} />
    </Suspense>
  );
};

/** Ficha "por que eu não vejo tudo": a regra de anonimato em linguagem simples. */
export const ANON_EXPLAIN = [
  { icon: ShieldCheck, title: 'Nunca uma loja só', text: 'Cada número soma várias lojas, e nenhuma loja sozinha pode pesar demais nele.' },
  { icon: MapIcon, title: 'Lugares pequenos ficam de fora', text: 'Bairro ou cidade com poucas lojas não aparece, para que ninguém descubra qual mercado vendeu.' },
  { icon: Package, title: 'Só os seus produtos', text: 'Você vê apenas os produtos aprovados na sua carteira. Concorrente nenhum aparece.' },
];

export default IndustryLayout;
