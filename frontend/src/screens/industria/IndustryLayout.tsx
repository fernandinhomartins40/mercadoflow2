import React, { createContext, useContext, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, Building2, Loader2, LogOut, Map as MapIcon, Package, PieChart, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { industryService, type IndustryMe } from '../../services/industry.service';
import '../../styles/flow.css';

/**
 * Casca do portal da indústria: o mesmo visual Flow dos painéis, com outra
 * porta de entrada. Carrega a empresa e o contrato uma vez e repassa às telas.
 */

const MeContext = createContext<{ me: IndustryMe | null; reload: () => Promise<void> }>({ me: null, reload: async () => {} });
export const useIndustry = () => useContext(MeContext);

const PAGES = [
  { to: '/industria', label: 'Hoje', icon: BarChart3, exact: true },
  { to: '/industria/mapa', label: 'Mapa', icon: MapIcon },
  { to: '/industria/produtos', label: 'Produtos', icon: Package },
  { to: '/industria/categoria', label: 'Categoria', icon: PieChart },
  { to: '/industria/conta', label: 'Contrato e cobertura', icon: Building2 },
];

const IndustryLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { name, email, logout } = useAuth();
  const [me, setMe] = useState<IndustryMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  const reload = async () => {
    try {
      setMe(await industryService.me());
    } catch {
      setError('Não foi possível abrir o portal agora. Tente de novo em instantes.');
    }
  };
  useEffect(() => { reload(); }, []);
  useEffect(() => setMenu(false), [location.pathname]);

  const current = PAGES.find((p) => (p.exact ? location.pathname === p.to : location.pathname.startsWith(p.to)));

  return (
    <MeContext.Provider value={{ me, reload }}>
      <div className="fx-app">
        <header className="fx-top">
          <div className="fx-brand">
            <Link to="/industria" className="fx-brand" style={{ textDecoration: 'none', color: 'inherit' }} aria-label="Portal da indústria, início">
              <span className="fx-logo" aria-hidden="true" style={{ background: 'var(--fx-forest)' }}>IN</span>
              <span className="fx-brandname">Mercado<span>Flow</span> Indústria</span>
            </Link>
            {me && <nav className="fx-crumbs" aria-label="Você está em"><span>{me.name}</span><span aria-hidden="true">/</span><b>{current?.label ?? 'Hoje'}</b></nav>}
          </div>
          <div className="fx-top-right">
            <span className="fx-watch" role="status"><ShieldCheck size={16} aria-hidden="true" />Dados anônimos</span>
            <button type="button" className="fx-avatar" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)} aria-label="Sua conta">
              {(name || email || 'IN').trim().slice(0, 2).toUpperCase()}
            </button>
            {menu && (
              <div className="fx-menu" role="menu">
                <div className="who"><b>{name}</b><span>{email}</span></div>
                <button type="button" role="menuitem" onClick={async () => { await logout(); window.location.href = '/login'; }}><LogOut size={17} />Sair</button>
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
          <div className="flex min-h-0 flex-1 flex-col gap-6">
            {error && <div className="fx-card fx-card-pad" role="alert">{error}</div>}
            {!me && !error && <p className="fx-muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 className="animate-spin" size={18} />Carregando…</p>}
            {me && (me.access || location.pathname.startsWith('/industria/produtos') || location.pathname.startsWith('/industria/conta')
              ? children : <NoAccess me={me} />)}
          </div>
        </main>
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

/** Barras simples em SVG (sem biblioteca): uma série, rótulo do primeiro e do último ponto. */
export const Bars: React.FC<{ points: { label: string; value: number }[]; height?: number; unit?: string; label: string }> = ({ points, height = 150, unit = '', label }) => {
  if (points.length === 0) return <p className="fx-muted">Sem dados publicados neste recorte.</p>;
  const max = Math.max(...points.map((p) => p.value), 1);
  const w = 100 / points.length;
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }} role="img" aria-label={label}>
        {points.map((p, i) => {
          const h = Math.max(1, (p.value / max) * (height - 4));
          return (
            <rect key={p.label} x={i * w + w * 0.12} width={w * 0.76} y={height - h} height={h} rx={0.6} fill="currentColor" opacity={i === points.length - 1 ? 1 : 0.55}>
              <title>{`${p.label}: ${p.value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${unit}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.75, marginTop: 4 }}>
        <span>{points[0].label}</span><span>{points[points.length - 1].label}</span>
      </figcaption>
    </figure>
  );
};

/** Ficha "por que eu não vejo tudo": a regra de anonimato em linguagem simples. */
export const ANON_EXPLAIN = [
  { icon: ShieldCheck, title: 'Nunca uma loja só', text: 'Cada número soma várias lojas, e nenhuma loja sozinha pode pesar demais nele.' },
  { icon: MapIcon, title: 'Lugares pequenos ficam de fora', text: 'Bairro ou cidade com poucas lojas não aparece, para que ninguém descubra qual mercado vendeu.' },
  { icon: Package, title: 'Só os seus produtos', text: 'Você vê apenas os produtos aprovados na sua carteira. Concorrente nenhum aparece.' },
];

export default IndustryLayout;
