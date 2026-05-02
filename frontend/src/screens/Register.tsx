import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/common/Button';
import authService from '../services/auth.service';

const Register: React.FC = () => {
  const [form, setForm] = useState({
    marketName: '',
    marketCnpj: '',
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const payload = {
      marketName: form.marketName.trim(),
      marketCnpj: form.marketCnpj.trim(),
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
    };

    if (!payload.marketName || !payload.name || !payload.email || !payload.password) {
      setError('Preencha mercado, responsavel, e-mail e senha.');
      return;
    }
    if (payload.password.length < 6) {
      setError('Use uma senha com pelo menos 6 caracteres.');
      return;
    }
    if (payload.password !== form.confirmPassword) {
      setError('A confirmacao da senha nao confere.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await authService.register(payload);
      setSuccess(response.message || 'Cadastro recebido. Aguarde a liberacao do acesso.');
      setForm({
        marketName: '',
        marketCnpj: '',
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
      });
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel concluir o cadastro.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="card login-card">
        <h2>Criar conta</h2>
        <p>O cadastro entra para aprovacao. A liberacao e a assinatura sao ativadas pelo Super Admin.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nome do mercado</label>
            <input className="input" value={form.marketName} onChange={(e) => updateField('marketName', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>CNPJ</label>
            <input className="input" value={form.marketCnpj} onChange={(e) => updateField('marketCnpj', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Responsavel</label>
            <input className="input" value={form.name} onChange={(e) => updateField('name', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>E-mail</label>
            <input className="input" type="email" autoComplete="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Senha</label>
            <input className="input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => updateField('password', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Confirmar senha</label>
            <input className="input" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(e) => updateField('confirmPassword', e.target.value)} required />
          </div>

          {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
          {success ? <p style={{ color: 'var(--success)' }}>{success}</p> : null}

          <Button type="submit" disabled={submitting}>{submitting ? 'Enviando...' : 'Solicitar acesso'}</Button>
        </form>
        <p className="login-switch">
          Ja tem acesso? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
