import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Button from '../components/common/Button';
import AuthBrand from '../components/common/AuthBrand';
import api from '../services/api';

const RULES: Array<[RegExp, string]> = [
  [/.{8,}/, '8 caracteres ou mais'],
  [/[A-Z]/, 'uma letra maiúscula'],
  [/[a-z]/, 'uma letra minúscula'],
  [/\d/, 'um número'],
  [/[^A-Za-z0-9]/, 'um caractere especial'],
];

/** Nova senha a partir do link do e-mail (uso único, 30 minutos). */
const ResetPassword: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const missing = RULES.filter(([re]) => !re.test(password)).map(([, label]) => label);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (missing.length) { setError(`Falta: ${missing.join(', ')}.`); return; }
    if (password !== confirm) { setError('As duas senhas não são iguais.'); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await api.post('/v1/auth/reset-password', { token, password });
      setDone(r.data?.message ?? 'Senha alterada.');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Não foi possível trocar a senha. Peça um novo link.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page lg-canvas">
      <div className="lg-thick login-card">
        <AuthBrand />
        <div className="login-heading">
          <h2>Criar nova senha</h2>
          <p>Escolha uma senha nova para entrar no MercadoFlow.</p>
        </div>
        {done ? (
          <>
            <p role="status" style={{ color: 'var(--text-primary)' }}>{done}</p>
            <p className="login-switch"><Link to="/login">Entrar</Link></p>
          </>
        ) : !token ? (
          <p role="alert" style={{ color: 'var(--danger)' }}>Link incompleto. Abra o link do e-mail de novo ou peça outro em <Link to="/esqueci-senha">Esqueci minha senha</Link>.</p>
        ) : (
          <form onSubmit={submit}>
            <div className="form-group">
              <label htmlFor="rp-pass">Nova senha</label>
              <input id="rp-pass" className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <small style={{ color: 'var(--text-muted)' }}>{missing.length ? `Falta: ${missing.join(', ')}` : 'Senha forte.'}</small>
            </div>
            <div className="form-group">
              <label htmlFor="rp-confirm">Repita a nova senha</label>
              <input id="rp-confirm" className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
            <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nova senha'}</Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
