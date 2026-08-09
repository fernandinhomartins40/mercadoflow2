import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, Sparkles } from 'lucide-react';
import Button from '../components/common/Button';
import PasswordField from '../components/common/PasswordField';
import authService from '../services/auth.service';
import { useAuth } from '../context/AuthContext';
import subscriptionService, {
  PlanDescriptor,
  formatPrice,
} from '../services/subscription.service';
import {
  evaluatePassword,
  isValidCnpj,
  isValidPhone,
  maskCnpj,
  maskPhone,
  onlyDigits,
} from '../utils/formMasks';

/**
 * Cadastro do supermercadista.
 *
 * A conta nasce no plano gratuito e o usuário entra na hora — o texto anterior
 * ("cadastro entra para aprovação") descrevia um fluxo que deixou de existir
 * quando o freemium foi implementado, e prometer espera afastava quem queria
 * testar.
 *
 * Escolher um plano pago aqui registra a intenção e leva ao checkout depois do
 * primeiro acesso; a conta já funciona antes disso.
 */

const Register: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [form, setForm] = useState({
    marketName: '',
    marketCnpj: '',
    marketPhone: '',
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [selectedPlan, setSelectedPlan] = useState('FREE');
  const [plans, setPlans] = useState<PlanDescriptor[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    subscriptionService
      .getPublicPlans()
      .then((list) => {
        if (!cancelled) setPlans(list);
      })
      .catch(() => {
        // Sem o catálogo o cadastro continua funcionando no gratuito.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const strength = useMemo(() => evaluatePassword(form.password), [form.password]);

  const cnpjError = useMemo(() => {
    if (!touched.marketCnpj || !form.marketCnpj) return null;
    return isValidCnpj(form.marketCnpj) ? null : 'CNPJ inválido — confira os números.';
  }, [form.marketCnpj, touched.marketCnpj]);

  const phoneError = useMemo(() => {
    if (!touched.marketPhone || !form.marketPhone) return null;
    return isValidPhone(form.marketPhone) ? null : 'Telefone incompleto.';
  }, [form.marketPhone, touched.marketPhone]);

  const confirmError = useMemo(() => {
    if (!touched.confirmPassword || !form.confirmPassword) return null;
    return form.password === form.confirmPassword ? null : 'As senhas não conferem.';
  }, [form.password, form.confirmPassword, touched.confirmPassword]);

  const canSubmit =
    form.marketName.trim().length > 1
    && form.name.trim().length > 1
    && form.email.includes('@')
    && strength.valid
    && form.password === form.confirmPassword
    && !cnpjError
    && !phoneError;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setTouched({ marketCnpj: true, marketPhone: true, confirmPassword: true });

    if (!strength.valid) {
      setError('A senha ainda não atende aos requisitos de segurança.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('As senhas não conferem.');
      return;
    }
    if (form.marketCnpj && !isValidCnpj(form.marketCnpj)) {
      setError('CNPJ inválido — confira os números.');
      return;
    }

    setSubmitting(true);
    try {
      await authService.register({
        marketName: form.marketName.trim(),
        // Envia só os dígitos: gravar o valor mascarado deixaria a base
        // inconsistente com cadastros feitos por outras telas.
        marketCnpj: onlyDigits(form.marketCnpj),
        marketPhone: onlyDigits(form.marketPhone),
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        intendedPlan: selectedPlan,
      });

      // Entra direto: a conta já está ativa, e pedir para o usuário logar de
      // novo logo após criar a senha é atrito sem contrapartida.
      await login(form.email.trim().toLowerCase(), form.password, true);
      navigate(selectedPlan === 'FREE' ? '/app' : '/app/planos?novo=1', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Não foi possível concluir o cadastro.');
      setSubmitting(false);
    }
  };

  const purchasablePlans = plans.filter((plan) => plan.code !== 'REDE');

  return (
    <div className="login-page">
      <div className="card login-card" style={{ maxWidth: '520px' }}>
        <h2>Criar conta grátis</h2>
        <p>
          Comece agora no plano gratuito, sem cartão de crédito. Você já pode instalar o Agente
          Mercado Flow e receber suas notas fiscais.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="reg-market">Nome do mercado</label>
            <input
              id="reg-market"
              className="input"
              value={form.marketName}
              onChange={(e) => updateField('marketName', e.target.value)}
              placeholder="Supermercado Bom Preço"
              autoComplete="organization"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-cnpj">CNPJ</label>
            <input
              id="reg-cnpj"
              className="input"
              value={form.marketCnpj}
              onChange={(e) => updateField('marketCnpj', maskCnpj(e.target.value))}
              onBlur={() => setTouched((t) => ({ ...t, marketCnpj: true }))}
              placeholder="12.345.678/0001-95"
              inputMode="numeric"
              aria-invalid={cnpjError ? true : undefined}
            />
            {cnpjError && (
              <p className="mt-1 text-xs font-medium" style={{ color: '#dc2626' }}>{cnpjError}</p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="reg-name">Responsável</label>
            <input
              id="reg-name"
              className="input"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="Seu nome"
              autoComplete="name"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-phone">Telefone</label>
            <input
              id="reg-phone"
              className="input"
              value={form.marketPhone}
              onChange={(e) => updateField('marketPhone', maskPhone(e.target.value))}
              onBlur={() => setTouched((t) => ({ ...t, marketPhone: true }))}
              placeholder="(11) 98765-4321"
              inputMode="tel"
              autoComplete="tel"
              aria-invalid={phoneError ? true : undefined}
            />
            {phoneError && (
              <p className="mt-1 text-xs font-medium" style={{ color: '#dc2626' }}>{phoneError}</p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="reg-email">E-mail</label>
            <input
              id="reg-email"
              className="input"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              placeholder="voce@seumercado.com.br"
              required
            />
          </div>

          <PasswordField
            id="reg-password"
            label="Senha"
            value={form.password}
            onChange={(value) => updateField('password', value)}
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            showStrength
            required
          />

          <PasswordField
            id="reg-confirm"
            label="Confirmar senha"
            value={form.confirmPassword}
            onChange={(value) => updateField('confirmPassword', value)}
            autoComplete="new-password"
            error={confirmError}
            required
          />

          {/* Escolha do plano */}
          {purchasablePlans.length > 0 && (
            <div className="form-group">
              <label>Escolha seu plano</label>
              <div className="flex flex-col gap-2">
                {purchasablePlans.map((plan) => {
                  const active = selectedPlan === plan.code;
                  const isFree = plan.code === 'FREE';
                  return (
                    <button
                      key={plan.code}
                      type="button"
                      onClick={() => setSelectedPlan(plan.code)}
                      className="flex items-start gap-3 rounded-xl p-3 text-left transition"
                      style={{
                        border: active
                          ? '2px solid var(--brand-500, #22c55e)'
                          : '1px solid var(--border-soft, #e2e8f0)',
                        background: active ? 'var(--surface-success, #f0fdf4)' : 'transparent',
                      }}
                    >
                      <div
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                        style={{
                          border: active ? 'none' : '1.5px solid var(--border-strong, #cbd5e1)',
                          background: active ? 'var(--brand-500, #22c55e)' : 'transparent',
                          color: '#fff',
                        }}
                      >
                        {active && <Check size={10} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                            {plan.name}
                          </span>
                          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {formatPrice(plan.monthlyPriceCents)}
                            {plan.monthlyPriceCents > 0 && (
                              <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                                /mês
                              </span>
                            )}
                          </span>
                          {isFree && (
                            <span
                              className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                              style={{ background: '#dcfce7', color: '#15803d' }}
                            >
                              <Sparkles size={9} />
                              sem cartão
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {(plan.highlights || []).slice(0, 2).join(' · ')}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {selectedPlan !== 'FREE' && (
                <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Sua conta começa no gratuito e você conclui o pagamento logo após entrar — assim
                  já pode instalar o agente enquanto isso.
                </p>
              )}
            </div>
          )}

          {error && (
            <div
              className="mt-3 flex items-start gap-2 rounded-lg p-2.5 text-xs"
              style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" disabled={submitting || !canSubmit} className="mt-3 w-full">
            {submitting ? 'Criando conta...' : 'Criar conta grátis'}
            {!submitting && <ArrowRight size={15} />}
          </Button>
        </form>

        <p className="login-switch">
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
