import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { resolveLocation } from '../../config/navigation';

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
  const asking = pathname === '/app/perguntar';

  return (
    // Topo de vidro que fica colado ao rolar; o conteúdo passa desfocado por baixo.
    <header className="sticky top-0 z-20 px-3 pt-3 sm:px-6">
      <div className="lg-bar flex min-h-14 items-center justify-between gap-3 rounded-full py-2 pl-4 pr-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {!desktopPinned && (
            <span aria-hidden="true" className="lg-tinted flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">MF</span>
          )}
          {/* Só o destino: o título da tela já aparece na própria página. */}
          <p className="min-w-0 truncate text-base font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {asking ? 'Pergunte aos dados' : destination.label}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!asking && (
            <Link
              to="/app/perguntar"
              className={`lg-soft inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm font-semibold no-underline ${FOCUS}`}
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
              className={`lg-soft inline-flex h-10 w-10 items-center justify-center rounded-full ${FOCUS}`}
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
