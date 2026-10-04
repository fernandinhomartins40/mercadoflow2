import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { CircleUserRound, House, ReceiptText, ScanBarcode, Wallet } from 'lucide-react';

/**
 * Barra inferior de app nativo: Início, Notas, Conferir (no centro, em
 * destaque), Créditos e Conta. Vidro fosco flutuando sobre o conteúdo; o
 * botão Conferir tem vidro verde e borda brilhante girando.
 */

interface Tab { to: string; label: string; icon: React.ElementType; match: (p: string) => boolean }

const TABS: Tab[] = [
  { to: '/confere/', label: 'Início', icon: House, match: (p) => p === '/confere' || p === '/confere/' },
  { to: '/confere/notas', label: 'Notas', icon: ReceiptText, match: (p) => p.startsWith('/confere/notas') },
  { to: '/confere/creditos', label: 'Créditos', icon: Wallet, match: (p) => p.startsWith('/confere/creditos') },
  { to: '/confere/conta', label: 'Conta', icon: CircleUserRound,
    match: (p) => ['/confere/conta', '/confere/certificado', '/confere/importar', '/confere/fabricantes'].some((x) => p.startsWith(x)) },
];

const tap = () => { try { navigator.vibrate?.(8); } catch { /* sem vibração */ } };

const TabLink: React.FC<{ tab: Tab; active: boolean }> = ({ tab, active }) => {
  const Icon = tab.icon;
  return (
    <Link to={tab.to} onClick={tap} aria-current={active ? 'page' : undefined}
      className="cf-tab flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5">
      <span className="cf-tab-ico flex h-8 w-12 items-center justify-center rounded-full transition-colors">
        <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
      </span>
      <span className="cf-tab-label text-[11px] font-bold leading-none">{tab.label}</span>
    </Link>
  );
};

export const TabBar: React.FC = () => {
  const { pathname } = useLocation();
  const [a, b, c, d] = TABS;
  return (
    <nav aria-label="Menu do app" className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(10px,env(safe-area-inset-bottom))]">
      <div className="cf-dock pointer-events-auto relative mx-auto flex h-[68px] max-w-xl items-center rounded-[28px] px-1">
        <TabLink tab={a} active={a.match(pathname)} />
        <TabLink tab={b} active={b.match(pathname)} />
        <div className="flex w-[84px] shrink-0 justify-center">
          <Link to="/confere/ler" onClick={tap} aria-label="Conferir: ler nota"
            className="cf-fab -mt-9 flex h-[70px] w-[70px] flex-col items-center justify-center transition-transform">
            <ScanBarcode className="h-7 w-7" strokeWidth={2.3} aria-hidden="true" />
            <span className="mt-0.5 text-[11px] font-extrabold" aria-hidden="true">Conferir</span>
          </Link>
        </div>
        <TabLink tab={c} active={c.match(pathname)} />
        <TabLink tab={d} active={d.match(pathname)} />
      </div>
    </nav>
  );
};

/** Telas das abas: conteúdo com espaço para a barra e entrada suave a cada troca. */
export const TabLayout: React.FC = () => {
  const { pathname } = useLocation();
  return (
    <div className="fx-confere min-h-[100dvh] lg-canvas text-[#0B1F16] antialiased" style={{ fontSize: 17 }}>
      <div key={pathname} className="cf-enter mx-auto w-full max-w-xl pb-[calc(112px+env(safe-area-inset-bottom))]">
        <Outlet />
      </div>
      <TabBar />
    </div>
  );
};

export default TabBar;
