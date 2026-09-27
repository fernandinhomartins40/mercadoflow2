import React from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/cn';
import { DESTINATIONS, resolveLocation, visiblePages } from '../../config/navigation';

/**
 * Lateral do desktop (≥ 1024 px): os 5 destinos (R-14). As páginas internas do
 * destino ativo aparecem logo abaixo dele, então o menu mostra só o que importa
 * para a tarefa em andamento em vez de 14 itens de uma vez.
 */
const Sidebar: React.FC = () => {
  const { role, name, email, logout } = useAuth();
  const { pathname } = useLocation();
  const isAdmin = role === 'ADMIN';
  const active = resolveLocation(pathname);

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 flex h-screen w-64 flex-col border-r border-slate-800 bg-slate-900 text-white"
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-slate-800 px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-500 text-xs font-bold text-white">MF</div>
        <p className="truncate text-[0.95rem] font-semibold tracking-tight">MercadoFlow</p>
      </div>

      <nav aria-label="Navegação principal" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
        {DESTINATIONS.map((destination) => {
          const isActive = destination.key === active.destination.key;
          const pages = visiblePages(destination, isAdmin);
          const Icon = destination.icon;
          return (
            <div key={destination.key}>
              {/* Link, não NavLink: o destino fica ativo em qualquer página dele, não só na primeira. */}
              <Link
                to={pages[0].to}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2.5 no-underline transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-400',
                  isActive ? 'bg-green-500 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                )}
              >
                <Icon className={cn('h-5 w-5 shrink-0', isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300')} strokeWidth={2} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{destination.label}</span>
                  <span className={cn('block truncate text-xs', isActive ? 'text-green-50' : 'text-slate-500')}>{destination.hint}</span>
                </span>
              </Link>

              {isActive && pages.length > 1 ? (
                <div className="mb-2 mt-1 flex flex-col gap-0.5 border-l border-slate-700 pl-3 ml-5">
                  {pages.map((page) => {
                    const pageActive = page.to === active.page.to;
                    return (
                      <NavLink
                        key={page.to}
                        to={page.to}
                        end={page.exact}
                        className={cn(
                          'rounded-md px-3 py-1.5 text-sm no-underline transition-colors',
                          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-400',
                          pageActive ? 'bg-slate-800 font-semibold text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                        )}
                      >
                        {page.label}
                      </NavLink>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-3">
        <div className="flex items-center gap-2.5 rounded-lg bg-slate-800 px-3 py-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-500 text-xs font-bold">
            {(name || email || '?').trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{name || 'Usuário'}</p>
            <p className="truncate text-xs text-slate-400">{email}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Sair da conta"
            title="Sair"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-400"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
