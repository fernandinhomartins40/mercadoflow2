import React from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <Navbar />
        {children}
      </main>
    </div>
  );
};

export default Layout;
