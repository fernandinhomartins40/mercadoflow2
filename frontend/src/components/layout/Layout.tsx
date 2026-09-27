import React from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import BottomNav from './BottomNav';
import DestinationSubnav from './DestinationSubnav';
import { useDesktopSidebarMode } from '../../hooks/useDesktopSidebarMode';

/**
 * Casca das telas do mercado: 5 destinos (R-14) na lateral do desktop ou na
 * barra inferior do celular, e as páginas do destino logo abaixo do topo.
 */
const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const desktopPinned = useDesktopSidebarMode();

  return (
    <div className="workspace-root admin-workspace min-h-screen overflow-x-hidden bg-slate-50">
      {desktopPinned && <Sidebar />}
      <main className={desktopPinned
        ? 'workspace-shell-main flex min-h-screen min-w-0 flex-col overflow-x-hidden pl-64'
        : 'workspace-shell-main flex min-h-screen min-w-0 flex-col overflow-x-hidden'}
      >
        <Navbar desktopPinned={desktopPinned} />
        <DestinationSubnav />
        <div
          className="workspace-shell-content flex min-h-0 flex-1 overflow-x-hidden px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-8"
          // Espaço para a barra inferior (56 px + área segura do aparelho).
          style={desktopPinned ? undefined : { paddingBottom: 'calc(88px + env(safe-area-inset-bottom))' }}
        >
          <div className="workspace-stage flex min-h-0 flex-1 flex-col gap-6 overflow-x-hidden">{children}</div>
        </div>
      </main>
      {!desktopPinned && <BottomNav />}
    </div>
  );
};

export default Layout;
