import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/common/Button';

const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const rememberedEmail = (() => {
    try {
      return localStorage.getItem('mf_remember_email') || '';
    } catch {
      return '';
    }
  })();
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(Boolean(rememberedEmail));
  const [keepConnected, setKeepConnected] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (rememberMe) {
        try {
          localStorage.setItem('mf_remember_email', email.trim());
        } catch {
          // ignore
        }
      } else {
        try {
          localStorage.removeItem('mf_remember_email');
        } catch {
          // ignore
        }
      }

      await login(email, password, keepConnected);
      navigate('/app');
    } catch (err: any) {
      setError(err.message || 'Falha ao autenticar');
    }
  };

  return (
    <div className="login-page">
      <div className="card login-card">
        <h2>Entrar</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>E-mail</label>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Senha</label>
            <div className="input-with-icon">
              <input
                className="input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="input-icon-button"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M2.1 3.51 3.51 2.1 21.9 20.49 20.49 21.9l-2.23-2.23A11.9 11.9 0 0 1 12 22C6 22 2.73 17.44 1 12c.73-2.3 1.9-4.49 3.65-6.33L2.1 3.51Zm6.12 6.12A4 4 0 0 0 12 16c.53 0 1.04-.1 1.5-.27l-1.62-1.62A2 2 0 0 1 9.9 11.1L8.22 9.63ZM12 6c6 0 9.27 4.56 11 10-.7 2.22-1.81 4.34-3.47 6.15l-2.16-2.16A6 6 0 0 0 6.17 9.33L4.59 7.75C6.47 6.64 8.96 6 12 6Zm0 3a3 3 0 0 1 3 3c0 .3-.04.59-.12.86l-3.74-3.74c.28-.08.57-.12.86-.12Z"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M12 5c6 0 9.27 4.56 11 10-1.73 5.44-5 10-11 10S2.73 20.44 1 15C2.73 9.56 6 5 12 5Zm0 3a7 7 0 0 0-7.78 7 7 7 0 0 0 15.56 0A7 7 0 0 0 12 8Zm0 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <div className="login-options">
            <label className="checkbox">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
              <span>Lembrar-me</span>
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={keepConnected} onChange={(e) => setKeepConnected(e.target.checked)} />
              <span>Manter conectado</span>
            </label>
          </div>
          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
          <Button type="submit">Entrar</Button>
        </form>
      </div>
    </div>
  );
};

export default Login;
