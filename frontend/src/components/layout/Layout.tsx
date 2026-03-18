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
        ? 'workspace-root admin-workspace min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#fcf8f3_0%,#f3ebe3_100%)]'
        : 'workspace-root admin-workspace flex min-h-screen flex-col overflow-x-hidden bg-[linear-gradient(180deg,#fcf8f3_0%,#f3ebe3_100%)]'}
    >
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} desktopPinned={desktopPinned} />
      <main className={desktopPinned
        ? 'workspace-shell-main flex min-h-screen min-w-0 flex-col overflow-x-hidden pl-64'
        : 'workspace-shell-main flex min-h-screen min-w-0 flex-col overflow-x-hidden'}
      >
        <Navbar onToggleSidebar={() => setSidebarOpen((current) => !current)} desktopPinned={desktopPinned} />
        <div className="workspace-shell-content flex min-h-0 flex-1 overflow-x-hidden px-4 pb-8 pt-6 sm:px-6 lg:px-8">
          <div className="workspace-stage flex min-h-0 flex-1 flex-col gap-6 overflow-x-hidden">{children}</div>
        </div>
      </main>
    </div>
  );
};

export default Layout;
