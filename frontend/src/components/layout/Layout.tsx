import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname, location.search]);

  return (
    <div className="app-shell workspace-shell min-h-screen bg-[radial-gradient(circle_at_top,#fff7f0_0%,#f8efe6_45%,#f1e6dc_100%)] px-3 pb-3 pt-3 lg:grid lg:grid-cols-[var(--workspace-sidebar-width)_minmax(0,1fr)] lg:gap-4 lg:px-4 lg:pb-4">
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main admin-main workspace-main flex min-h-[calc(100dvh-24px)] min-w-0 flex-col gap-4 lg:min-h-[calc(100dvh-32px)]">
        <Navbar onToggleSidebar={() => setSidebarOpen((current) => !current)} />
        <div className="workspace-content flex min-h-0 flex-1 flex-col gap-4">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
