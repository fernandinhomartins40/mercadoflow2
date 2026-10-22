import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  History, LogOut, Menu, MessageCircle, Search, Settings2, Sparkles, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { DESTINATIONS, pageTitle, resolveLocation, visiblePages } from '../../config/navigation';
import { activationService } from '../../services/activation.service';
import { useCached } from '../../hooks/useCached';
import type { ActivationStatus } from '../../types/activation.types';
import SubscriptionBanner from '../billing/SubscriptionBanner';
import HistoryNotice from '../intelligence/HistoryNotice';
import { useTeamPermission } from '../../lib/teamPermissions';
import { PageNameContext, PhotoViewer } from '../flow/Flow';
import '../../styles/flow.css';
import '../../styles/flow-clean.css';

/**
 * Casca do app do mercado, desenhada para quem não é técnico
 * (docs/auditoria-painel-leigo): menu com o nome de cada área sempre à vista
 * (no topo do computador, numa barra clara no pé do celular), uma fila só de
 * páginas da área, e o problema que trava a loja numa faixa no topo.
 */

const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/** Estado dos caixas, compartilhado entre as telas (o cache evita pedir de novo a cada troca). */
const useAgent = (marketId: string | null) => {
  const { data, refresh } = useCached<ActivationStatus>(marketId ? `ativacao:${marketId}` : null,
    () => activationService.getStatus(marketId!), 60_000);
  useEffect(() => {
    if (!marketId) return undefined;
    const t = setInterval(() => { void refresh(); }, 120_000);
    return () => clearInterval(t);
  }, [marketId, refresh]);
  return data?.agent ?? null;
};

/** Faixa vermelha quando os caixas pararam de mandar vendas: o número da tela está velho. */
const AgentStoppedBand: React.FC<{ agent: ActivationStatus['agent'] }> = ({ agent }) => {
  const since = agent.lastHeartbeatAt;
  const days = since ? daysSince(since) : null;
  return (
    <div className="fx-band danger" role="alert">
      <span className="dot" aria-hidden="true" />
      <p>
        <strong>
          {since
            ? `Seus caixas não mandam vendas desde ${dayMonth(since)}${days && days > 0 ? ` (há ${days} ${days === 1 ? 'dia' : 'dias'})` : ''}.`
            : 'Seus caixas não estão mandando vendas.'}
        </strong>{' '}
        Os números do painel estão parados nesse dia.
      </p>
      <Link to="/app/pdvs" className="fx-btn danger small">Religar o caixa</Link>
    </div>
  );
};

/** Papel que não altera tudo: avisa antes do clique (o servidor recusaria com 403). */
const ROLE_BAND: Partial<Record<string, string>> = {
  COMPRADOR: 'pode ver tudo e mexer em compras, pedidos e na conferência do Bipaê.',
  FINANCEIRO: 'pode ver tudo e cuidar da assinatura e dos pagamentos.',
  LEITURA: 'pode ver tudo, mas não mudar nada.',
};
const RoleBand: React.FC = () => {
  const { teamRole, label } = useTeamPermission();
  const text = teamRole ? ROLE_BAND[teamRole] : undefined;
  if (!text) return null;
  return (
    <div className="fx-band" role="note" style={{ fontSize: 14.5 }}>
      <p><strong>Você entrou como {label}:</strong> {text} O resto, só o dono ou o gerente mudam.</p>
    </div>
  );
};

const initialsOf = (name?: string | null, email?: string | null) => {
  const base = (name || email || '?').trim();
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
};

/** Itens do pé do celular: as quatro áreas do dia a dia e o menu com o resto. */
const BAR_KEYS = ['inicio', 'decidir', 'comprar', 'produtos'] as const;

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const { role, name, email, logout, marketId } = useAuth();
  const { destination, page } = resolveLocation(pathname);
  const isAdmin = role === 'ADMIN';
  const isOwner = role === 'MARKET_OWNER';
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const asking = pathname === '/app/perguntar';
  const siblings = visiblePages(destination, isAdmin, isOwner);
  const agent = useAgent(marketId ?? null);
  const agentStopped = !!agent && !agent.online && agent.pairedPdvs > 0;

  useEffect(() => { setSheetOpen(false); setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSheetOpen(false); setMenuOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const areas = useMemo(() => DESTINATIONS.map((d) => ({ d, pages: visiblePages(d, isAdmin, isOwner) })), [isAdmin, isOwner]);
  const q = query.trim().toLowerCase();
  const found = (label: string, hint = '') => !q || label.toLowerCase().includes(q) || hint.toLowerCase().includes(q);
  const firstOf = (key: string) => areas.find((a) => a.d.key === key)?.pages[0]?.to ?? '/app';

  return (
    <div className="fx-app fx-clean">
      <header className="fx-top">
        <Link to="/app" className="fx-brand" style={{ textDecoration: 'none', color: 'inherit' }} aria-label="MercadoFlow, início">
          <span className="fx-logo" aria-hidden="true">MF</span>
          <span className="fx-brandname">Mercado<span>Flow</span></span>
        </Link>
        <nav className="fx-nav" aria-label="Menu">
          {areas.map(({ d, pages }) => pages.length > 0 && (
            <Link key={d.key} to={pages[0].to} className={!asking && destination.key === d.key ? 'on' : ''}
              aria-current={!asking && destination.key === d.key ? 'page' : undefined}>{d.label}</Link>
          ))}
        </nav>
        <div className="fx-top-right">
          <Link to="/app/perguntar" className={`fx-ask-btn ${asking ? 'on' : ''}`}>
            <MessageCircle aria-hidden="true" /><span><span className="lbl">Perguntar ao </span>Tino</span>
          </Link>
          <button type="button" className="fx-avatar" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}
            aria-label="Sua conta">{initialsOf(name, email)}</button>
          {menuOpen && (
            <div className="fx-menu" role="menu">
              <div className="who"><b>{name || 'Sua conta'}</b><span>{email}</span></div>
              <Link to="/app/configuracoes" role="menuitem"><Settings2 size={17} />Minha conta</Link>
              <Link to="/app/decidir?config=1" role="menuitem"><Sparkles size={17} />Como o Tino trabalha</Link>
              <button type="button" role="menuitem" onClick={logout}><LogOut size={17} />Sair</button>
            </div>
          )}
        </div>
      </header>

      {agentStopped && pathname !== '/app/pdvs' && <AgentStoppedBand agent={agent} />}

      {siblings.length > 1 && !asking && (
        <nav className="fx-subnav" aria-label={`Páginas de ${destination.label}`}>
          {siblings.map((p) => (
            <Link key={p.to} to={p.to} className={p.to === page.to ? 'on' : ''} aria-current={p.to === page.to ? 'page' : undefined}>{p.label}</Link>
          ))}
        </nav>
      )}

      <main className="fx-main">
        <PageNameContext.Provider value={pageTitle(pathname)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 1.6vw, 22px)' }}>
            <SubscriptionBanner />
            <RoleBand />
            {/* Aviso de histórico só onde se lê o todo: no resto, era ruído em toda página (F1). */}
            {(pathname === '/app' || pathname === '/app/configuracoes') && <HistoryNotice detailed={pathname === '/app/configuracoes'} />}
            {children}
          </div>
        </PageNameContext.Provider>
      </main>

      {sheetOpen && (
        <>
          <div className="fx-shade" onClick={() => setSheetOpen(false)} aria-hidden="true" />
          <div className="fx-map" role="dialog" aria-label="Menu">
            <header>
              <b>Menu</b>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="Fechar o menu"><X size={20} /></button>
            </header>
            <label className="search">
              <Search size={18} aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar uma tela..." aria-label="Procurar uma tela" />
            </label>
            {areas.map(({ d, pages }) => {
              const list = pages.filter((p) => found(p.label, d.label + ' ' + d.hint));
              if (list.length === 0) return null;
              return (
                <section key={d.key}>
                  <h4>{d.label}</h4>
                  <div className="grid">
                    {list.map((p) => {
                      const I = p.icon;
                      return <Link key={p.to} to={p.to} className={`tile ${p.to === page.to ? 'active' : ''}`}><I aria-hidden="true" />{p.label}</Link>;
                    })}
                  </div>
                </section>
              );
            })}
            {found('Perguntar ao Tino', 'pergunta ia no que deu') && (
              <section>
                <h4>Tino</h4>
                <div className="grid">
                  <Link to="/app/perguntar" className="tile"><MessageCircle aria-hidden="true" />Perguntar ao Tino</Link>
                  <Link to="/app/decidir?aba=resultado" className="tile"><History aria-hidden="true" />O que já decidi</Link>
                </div>
              </section>
            )}
          </div>
        </>
      )}

      <PhotoViewer />

      <nav className="fx-bar" aria-label="Navegação">
        {BAR_KEYS.map((key) => {
          const d = DESTINATIONS.find((x) => x.key === key)!;
          const I = d.icon;
          const on = !asking && !sheetOpen && destination.key === key;
          return (
            <Link key={key} to={firstOf(key)} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
              <i aria-hidden="true"><I /></i>{d.label}
            </Link>
          );
        })}
        <button type="button" className={sheetOpen ? 'on' : ''} aria-expanded={sheetOpen} onClick={() => { setSheetOpen((v) => !v); setQuery(''); }}>
          <i aria-hidden="true"><Menu /></i>Menu
        </button>
      </nav>
    </div>
  );
};

export default Layout;
