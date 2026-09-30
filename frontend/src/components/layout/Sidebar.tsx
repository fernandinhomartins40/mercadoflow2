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
      // Lateral flutuante de vidro: descola das bordas e deixa o fundo colorido aparecer.
      className="lg-bar fixed bottom-3 left-3 top-3 z-30 flex w-[244px] flex-col rounded-[28px] text-[#1d1d1f]"
    >
      <div className="flex h-16 items-center gap-2.5 px-4">
        <div className="lg-tinted flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold">MF</div>
        <p className="truncate text-[1.02rem] font-bold tracking-tight">MercadoFlow</p>
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
                  'group flex items-center gap-3 rounded-2xl px-3 py-2.5 no-underline',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600',
                  isActive ? 'lg-tab-on' : 'lg-tab',
                )}
              >
                <Icon className={cn('h-5 w-5 shrink-0', isActive ? 'text-[#0a7a3d]' : 'text-slate-500 group-hover:text-slate-700')} strokeWidth={isActive ? 2.3 : 2} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{destination.label}</span>
                  <span className={cn('block truncate text-xs', isActive ? 'text-[#0a7a3d]/75' : 'text-slate-500')}>{destination.hint}</span>
                </span>
              </Link>

              {isActive && pages.length > 1 ? (
                <div className="mb-2 ml-5 mt-1 flex flex-col gap-0.5 border-l border-slate-900/10 pl-3">
                  {pages.map((page) => {
                    const pageActive = page.to === active.page.to;
                    return (
                      <NavLink
                        key={page.to}
                        to={page.to}
                        end={page.exact}
                        className={cn(
                          'rounded-xl px-3 py-1.5 text-sm no-underline transition-colors',
                          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-600',
                          pageActive ? 'bg-white/70 font-semibold text-[#0a7a3d] shadow-sm' : 'text-slate-600 hover:bg-slate-900/5 hover:text-slate-900',
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

      <div className="p-3">
        <div className="flex items-center gap-2.5 rounded-2xl bg-white/55 px-3 py-2.5 ring-1 ring-white/80">
          <span className="lg-tinted inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
            {(name || email || '?').trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{name || 'Usuário'}</p>
            <p className="truncate text-xs text-slate-500">{email}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Sair da conta"
            title="Sair"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-600"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
