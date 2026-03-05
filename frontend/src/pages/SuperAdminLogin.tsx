import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/common/Button';
import { useSuperAdminAuth } from '../context/SuperAdminAuthContext';

const SuperAdminLogin: React.FC = () => {
  const { login } = useSuperAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keepConnected, setKeepConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await login(email, password, keepConnected);
      navigate('/super-admin');
    } catch (err: any) {
      setError(err?.message || 'Falha ao autenticar no painel Super Admin');
    }
  };

  return (
    <div className="super-admin-login-page">
      <div className="super-admin-login-card card">
        <span className="pill">Super Admin</span>
        <h2>Painel da Plataforma</h2>
        <p>Login separado da aplicacao principal para controle de usuarios, planos e catalogo global.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>E-mail</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Senha</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={keepConnected} onChange={(e) => setKeepConnected(e.target.checked)} />
            <span>Manter conectado</span>
          </label>
          {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
          <Button type="submit">Entrar no Super Admin</Button>
        </form>
      </div>
    </div>
  );
};

export default SuperAdminLogin;
