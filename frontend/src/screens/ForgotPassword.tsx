import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/common/Button';
import AuthBrand from '../components/common/AuthBrand';
import api from '../services/api';

/** "Esqueci minha senha": pede o link por e-mail. A resposta é sempre a mesma, exista ou não a conta. */
const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post('/v1/auth/forgot-password', { email: email.trim() });
      setSent(r.data?.message ?? 'Se houver uma conta com este e-mail, enviamos o link.');
    } catch (err: any) {
      setError(err?.response?.status === 429 ? 'Muitos pedidos seguidos. Aguarde alguns minutos.' : 'Não foi possível enviar agora. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page lg-canvas">
      <div className="lg-thick login-card">
        <AuthBrand />
        <div className="login-heading">
          <h2>Esqueci minha senha</h2>
          <p>Informe o e-mail da sua conta. Enviamos um link para você criar uma senha nova.</p>
        </div>
        {sent ? (
          <p role="status" style={{ color: 'var(--text-primary)' }}>{sent}</p>
        ) : (
          <form onSubmit={submit}>
            <div className="form-group">
              <label htmlFor="fp-email">E-mail</label>
              <input id="fp-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
            <Button type="submit" disabled={busy || !email.trim()}>{busy ? 'Enviando…' : 'Enviar link'}</Button>
          </form>
        )}
        <p className="login-switch"><Link to="/login">Voltar para entrar</Link></p>
      </div>
    </div>
  );
};

export default ForgotPassword;
