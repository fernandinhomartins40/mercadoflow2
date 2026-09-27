import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { resolveLocation } from '../../config/navigation';

/** Títulos das telas; o destino (Hoje, Comprar…) vem da navegação. */
const TITLES: Record<string, string> = {
  '/app': 'Hoje no mercado',
  '/app/inteligencia': 'Todas as decisões',
  '/app/perguntar': 'Pergunte aos dados',
  '/app/rede': 'Semana e rede',
  '/app/clientes': 'Clientes',
  '/app/produtos': 'Produtos',
  '/app/lista-compras': 'Pedido inteligente',
  '/app/promocoes': 'Promoções',
  '/app/mapa-loja': 'Mapa da loja',
  '/app/pdvs': 'Caixas e agente',
  '/app/download-agente': 'Baixar o agente',
  '/app/planos': 'Plano e consumo',
  '/app/configuracoes': 'Conta',
  '/app/admin/catalogo': 'Catálogo global',
  '/app/admin/precos-estaduais': 'Preços estaduais',
  '/app/ofertas': 'Estúdio de ofertas',
};

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';

/**
 * Topo das telas do mercado: onde estou (destino + tela) e duas ações que
 * valem em qualquer lugar — perguntar aos dados (R-14: ação global, não um
 * destino) e sair (no celular; no desktop fica na lateral).
 */
const Navbar: React.FC<{ desktopPinned: boolean }> = ({ desktopPinned }) => {
  const { logout } = useAuth();
  const { pathname } = useLocation();
  const { destination } = resolveLocation(pathname);
  const title = pathname.startsWith('/app/produtos/') ? 'Ficha do produto' : TITLES[pathname] ?? destination.label;
  const asking = pathname === '/app/perguntar';

  return (
    <header className="sticky top-0 z-20" style={{ borderBottom: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
      <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          {!desktopPinned && (
            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-500 text-xs font-bold text-white">MF</span>
          )}
          <div className="min-w-0">
            <span className="block text-[0.7rem] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-soft)' }}>
              {asking ? 'Qualquer tela' : destination.label}
            </span>
            {/* Não é h1: o título principal é o da própria tela. */}
            <p className="truncate text-base font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!asking && (
            <Link
              to="/app/perguntar"
              className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3 text-sm font-semibold no-underline ${FOCUS}`}
              style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-base)' }}
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              {/* Em telas estreitas só o ícone: o título da tela precisa do espaço. */}
              <span className="hidden sm:inline">Perguntar aos dados</span>
              <span className="sr-only sm:hidden">Perguntar aos dados</span>
            </Link>
          )}
          {!desktopPinned && (
            <button
              type="button"
              onClick={logout}
              aria-label="Sair da conta"
              className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${FOCUS}`}
              style={{ border: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
