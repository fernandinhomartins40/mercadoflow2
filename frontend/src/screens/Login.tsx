import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/common/Button';
import AuthBrand from '../components/common/AuthBrand';
import {
  clearRememberedLogin,
  loadRememberedLogin,
  persistRememberedLogin,
} from '../utils/rememberedLogin';
import { ADMIN_TEST_LOGINS, type TestLoginCredentials } from '../config/testLogins';

const ADMIN_LOGIN_STORAGE_KEY = 'mf_admin_login';
const ADMIN_LEGACY_EMAIL_KEY = 'mf_remember_email';

const PasswordVisibilityIcon: React.FC<{ visible: boolean }> = ({ visible }) =>
  visible ? (
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
  );

const Login: React.FC = () => {
  const { login, loginSecondStep } = useAuth();
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const navigate = useNavigate();
  const rememberedLogin = loadRememberedLogin(ADMIN_LOGIN_STORAGE_KEY, {
    legacyEmailKey: ADMIN_LEGACY_EMAIL_KEY,
  });
  const [email, setEmail] = useState(rememberedLogin.email);
  const [password, setPassword] = useState(rememberedLogin.password);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(rememberedLogin.rememberMe);
  const [keepConnected, setKeepConnected] = useState(rememberedLogin.keepConnected);

  const fillTestLogin = (credentials: TestLoginCredentials) => {
    setEmail(credentials.email);
    setPassword(credentials.password);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const normalizedEmail = email.trim();
      const pending = await login(normalizedEmail, password, keepConnected);
      if (pending) {
        // Duas etapas: falta o código do aplicativo autenticador.
        setChallenge(pending);
        return;
      }
      if (rememberMe) {
        persistRememberedLogin(ADMIN_LOGIN_STORAGE_KEY, {
          email: normalizedEmail,
          password,
          rememberMe: true,
          keepConnected,
        });
      } else {
        clearRememberedLogin(ADMIN_LOGIN_STORAGE_KEY, ADMIN_LEGACY_EMAIL_KEY);
      }
      navigate('/app');
    } catch (err: any) {
      if (!err?.response) {
        setError('Não foi possível entrar agora. Tente de novo.');
        return;
      }
      // Conta bloqueada (senha certa): mostra o motivo e o que fazer. Senha errada: mensagem em português.
      const data = err?.response?.data;
      if (err?.response?.status === 429) setError('Muitas tentativas. Aguarde alguns minutos e tente de novo.');
      else setError(data?.userMessage || (err?.response?.status === 401 ? 'E-mail ou senha incorretos.' : 'Não foi possível entrar agora. Tente de novo.'));
    }
  };

  const handleCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setError(null);
    try {
      await loginSecondStep(challenge, code.trim());
      navigate('/app');
    } catch (err: any) {
      const message: string | undefined = err?.response?.data?.userMessage;
      setError(message || 'Código não confere.');
      if (message && /Entre de novo/.test(message)) {
        setChallenge(null);
        setCode('');
      }
    }
  };

  if (challenge) {
    return (
      <div className="login-page lg-canvas">
        <div className="lg-thick login-card">
          <AuthBrand />
          <div className="login-heading">
            <h2>Verificação em duas etapas</h2>
            <p>Digite o código de 6 números do seu aplicativo autenticador. Sem o celular, use um código de recuperação.</p>
          </div>
          <form onSubmit={handleCode}>
            <div className="form-group">
              <label htmlFor="mfa-code">Código</label>
              <input id="mfa-code" className="input" inputMode="numeric" autoComplete="one-time-code" autoFocus
                value={code} onChange={(e) => setCode(e.target.value)} maxLength={9} />
            </div>
            {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
            <Button type="submit">Confirmar</Button>
            <p className="login-switch" style={{ marginTop: 12 }}>
              <button type="button" className="link-button" onClick={() => { setChallenge(null); setCode(''); setError(null); }}>
                Voltar
              </button>
            </p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page lg-canvas">
      <div className="lg-thick login-card">
        <AuthBrand />
        <div className="login-heading">
          <h2>Entrar</h2>
          <p>Veja o que vende, o que está parado e quanto comprar.</p>
        </div>
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
                <PasswordVisibilityIcon visible={showPassword} />
              </button>
            </div>
          </div>
          {ADMIN_TEST_LOGINS.length > 0 ? (
            <div className="test-login-shortcuts" aria-label="Credenciais de teste">
              <span>Acesso rápido para teste</span>
              <div>
                {ADMIN_TEST_LOGINS.map((credentials) => (
                  <Button
                    key={credentials.email}
                    type="button"
                    variant="secondary"
                    className="test-login-button"
                    onClick={() => fillTestLogin(credentials)}
                  >
                    {credentials.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="login-options">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setRememberMe(checked);
                  if (!checked) {
                    clearRememberedLogin(ADMIN_LOGIN_STORAGE_KEY, ADMIN_LEGACY_EMAIL_KEY);
                  }
                }}
              />
              <span>Lembrar-me</span>
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={keepConnected} onChange={(e) => setKeepConnected(e.target.checked)} />
              <span>Manter conectado</span>
            </label>
          </div>
          {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
          <Button type="submit">Entrar</Button>
          <p className="login-switch" style={{ marginTop: 12 }}><Link to="/esqueci-senha">Esqueci minha senha</Link></p>
        </form>
        <p className="login-switch">
          Ainda não tem conta? <Link to="/register">Criar conta grátis</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
