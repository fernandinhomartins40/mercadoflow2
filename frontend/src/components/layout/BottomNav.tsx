import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/cn';
import { DESTINATIONS, resolveLocation, visiblePages } from '../../config/navigation';

/**
 * Barra inferior do celular (< 1024 px): os 5 destinos sempre a um toque do
 * polegar (D-018, R-14). Substitui o menu lateral, que escondia a navegação
 * atrás de um botão e listava 14 itens.
 */
const BottomNav: React.FC = () => {
  const { role } = useAuth();
  const { pathname } = useLocation();
  const active = resolveLocation(pathname).destination.key;

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t"
      style={{ background: 'var(--surface-base)', borderColor: 'var(--border-soft)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {DESTINATIONS.map((destination) => {
          const Icon = destination.icon;
          const isActive = destination.key === active;
          const first = visiblePages(destination, role === 'ADMIN')[0];
          return (
            <li key={destination.key}>
              {/* Link, não NavLink: o destino fica ativo em qualquer página dele, não só na primeira. */}
              <Link
                to={first.to}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 text-[0.72rem] font-semibold no-underline transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand-700)]',
                )}
                style={{ color: isActive ? 'var(--brand-700)' : 'var(--text-muted)' }}
              >
                <span
                  className="flex h-7 w-12 items-center justify-center rounded-full transition-colors"
                  style={{ background: isActive ? 'var(--surface-success)' : 'transparent' }}
                >
                  <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} aria-hidden="true" />
                </span>
                {destination.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default BottomNav;
