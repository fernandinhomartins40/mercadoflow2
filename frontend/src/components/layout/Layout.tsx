import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { useDesktopSidebarMode } from '../../hooks/useDesktopSidebarMode';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const desktopPinned = useDesktopSidebarMode();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (desktopPinned) {
      setSidebarOpen(false);
    }
  }, [desktopPinned]);

  return (
    <div
      className={desktopPinned
        ? 'workspace-root admin-workspace grid min-h-screen grid-cols-[292px_minmax(0,1fr)] items-start gap-4 overflow-x-hidden bg-[radial-gradient(circle_at_top,#fff7f0_0%,#f8efe6_45%,#f1e6dc_100%)] p-4'
        : 'workspace-root admin-workspace flex min-h-screen flex-col gap-4 overflow-x-hidden bg-[radial-gradient(circle_at_top,#fff7f0_0%,#f8efe6_45%,#f1e6dc_100%)] px-3 pb-3 pt-2 sm:p-4'}
    >
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} desktopPinned={desktopPinned} />
      <main className="workspace-shell-main flex min-h-[calc(100dvh-24px)] min-w-0 flex-col gap-4 overflow-x-hidden md:min-h-[calc(100dvh-32px)]">
        <Navbar onToggleSidebar={() => setSidebarOpen((current) => !current)} desktopPinned={desktopPinned} />
        <div className="workspace-shell-content flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
