import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Button from '../components/common/Button';

/** Aceite do convite para a equipe: a pessoa cria a senha e já entra. */

interface InviteInfo { email: string; name?: string; teamRole: string; store: string }

const AcceptInvite: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<InviteInfo>(`/v1/public/invites/${token}`)
      .then(({ data }) => {
        setInfo(data);
        setName(data.name || '');
      })
      .catch((err) => setError(err?.response?.data?.userMessage || 'Convite inválido.'));
  }, [token]);

  const accept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!info) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/v1/public/invites/${token}/accept`, { name, password });
      await login(info.email, password, false);
      navigate(info.teamRole === 'Conferente' ? '/confere/' : '/app');
    } catch (err: any) {
      setError(err?.response?.data?.userMessage || 'Não foi possível aceitar o convite.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page lg-canvas">
      <div className="lg-thick login-card">
        <div className="login-heading">
          <h2>Convite para a equipe</h2>
          {info && <p>{info.store} convidou você como <strong>{info.teamRole}</strong>.</p>}
        </div>
        {!info ? (
          <>
            <p role={error ? 'alert' : 'status'} style={{ color: error ? 'var(--danger)' : undefined }}>{error || 'Abrindo o convite...'}</p>
            <p className="login-switch"><Link to="/login">Ir para o login</Link></p>
          </>
        ) : (
          <form onSubmit={accept}>
            <div className="form-group">
              <label htmlFor="inv-email">E-mail</label>
              <input id="inv-email" className="input" value={info.email} disabled />
            </div>
            <div className="form-group">
              <label htmlFor="inv-name">Seu nome</label>
              <input id="inv-name" className="input" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
            <div className="form-group">
              <label htmlFor="inv-pass">Crie uma senha</label>
              <input id="inv-pass" className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password" />
              <small>8 ou mais caracteres, com maiúscula, minúscula, número e símbolo.</small>
            </div>
            {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
            <Button type="submit" disabled={busy}>{busy ? 'Entrando...' : 'Aceitar e entrar'}</Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AcceptInvite;
