import React from 'react';
import { useAuth } from '../../context/AuthContext';

const Navbar: React.FC = () => {
  const { logout, role } = useAuth();

  return (
    <div className="header">
      <div>
        <h2 style={{ margin: 0 }}>Visão geral</h2>
        <span style={{ color: 'var(--muted)' }}>Perfil: {role || 'Não informado'}</span>
      </div>
      <button className="button secondary" onClick={logout}>Sair</button>
    </div>
  );
};

export default Navbar;
