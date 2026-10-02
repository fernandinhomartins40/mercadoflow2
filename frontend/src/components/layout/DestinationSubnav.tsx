import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/cn';
import { resolveLocation, visiblePages } from '../../config/navigation';

/**
 * Páginas internas do destino ativo (ex.: Loja → Caixas · Plano · Conta), no
 * celular, logo abaixo do topo. No desktop a lateral já mostra essas páginas.
 */
const DestinationSubnav: React.FC = () => {
  const { role } = useAuth();
  const { pathname } = useLocation();
  const { destination, page } = resolveLocation(pathname);
  const pages = visiblePages(destination, role === 'ADMIN', role === 'MARKET_OWNER');
  if (pages.length < 2) return null;

  return (
    <nav aria-label={`Páginas de ${destination.label}`} className="px-3 pt-2 lg:hidden">
      <ul className="lg-glass flex gap-1 overflow-x-auto rounded-full p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {pages.map((p) => {
          const isActive = p.to === page.to;
          return (
            <li key={p.to} className="shrink-0">
              <NavLink
                to={p.to}
                end={p.exact}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-[40px] items-center rounded-full px-4 text-sm font-medium no-underline',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]',
                  isActive ? 'lg-tab-on' : 'lg-tab',
                )}
              >
                {p.label}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default DestinationSubnav;
