import React from 'react';
import { useAuth } from '../../context/AuthContext';

const Navbar: React.FC = () => {
  const { logout, role } = useAuth();

  return (
    <div className="header">
      <div>
        <h2 style={{ margin: 0 }}>Visao Geral</h2>
        <span style={{ color: 'var(--muted)' }}>Role: {role || 'N/A'}</span>
      </div>
      <button className="button secondary" onClick={logout}>Sair</button>
    </div>
  );
};

export default Navbar;
