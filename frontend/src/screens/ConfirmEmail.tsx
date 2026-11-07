import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthBrand from '../components/common/AuthBrand';
import api from '../services/api';

/** Destino do link de confirmação do e-mail do cadastro. */
const ConfirmEmail: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!token) { setState({ ok: false, message: 'Link incompleto. Abra de novo o link do e-mail.' }); return; }
    api.post('/v1/auth/confirm-email', { token })
      .then((r) => setState({ ok: true, message: r.data?.message ?? 'E-mail confirmado.' }))
      .catch((err) => setState({ ok: false, message: err?.response?.data?.message ?? 'Não foi possível confirmar agora. Tente abrir o link de novo.' }));
  }, [token]);

  return (
    <div className="login-page lg-canvas">
      <div className="lg-thick login-card">
        <AuthBrand />
        <div className="login-heading"><h2>Confirmar e-mail</h2></div>
        {state === null
          ? <p role="status" style={{ color: 'var(--text-muted)' }}>Confirmando…</p>
          : <p role={state.ok ? 'status' : 'alert'} style={{ color: state.ok ? 'var(--text-primary)' : 'var(--danger)' }}>{state.message}</p>}
        {state && <p className="login-switch"><Link to="/login">Entrar no MercadoFlow</Link></p>}
      </div>
    </div>
  );
};

export default ConfirmEmail;
