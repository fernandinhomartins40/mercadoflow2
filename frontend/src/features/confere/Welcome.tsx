import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import authService from '../../services/auth.service';
import api from '../../services/api';
import { confereService } from '../../services/confere.service';
import type { ConfereStatus } from '../../types/confere.types';
import { isValidCnpj, maskCnpj, onlyDigits } from '../../utils/formMasks';
import { BigButton, Field, Shell, errorText } from './ui';

/** Entrada do Confere: criar a conta do mercado (com aceite dos termos) ou entrar. */

interface PublicTerms { version: string; text: string; trialReads: number; enabled: boolean }

export const PENDING_ACCEPT = 'confere:accept';

export const Welcome: React.FC = () => {
  const { login } = useAuth();
  const [tab, setTab] = useState<'entrar' | 'criar'>('criar');
  const [terms, setTerms] = useState<PublicTerms | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', marketName: '', cnpj: '', accept: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);

  useEffect(() => { api.get('/v1/public/confere/terms').then((r) => setTerms(r.data)).catch(() => {}); }, []);

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(form.email.trim().toLowerCase(), form.password, true);
    } catch (err) {
      setError(errorText(err, 'E-mail ou senha incorretos.'));
    } finally {
      setBusy(false);
    }
  };

  const doRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.accept) { setError('Para usar o Confere é preciso aceitar os termos.'); return; }
    if (!isValidCnpj(form.cnpj)) { setError('CNPJ inválido. Confira os números.'); return; }
    setBusy(true);
    try {
      await authService.register({
        name: form.name.trim(), email: form.email.trim().toLowerCase(), password: form.password,
        marketName: form.marketName.trim(), marketCnpj: onlyDigits(form.cnpj), intendedPlan: 'FREE',
      });
      // O aceite do formulário vale para esta versão dos termos.
      sessionStorage.setItem(PENDING_ACCEPT, terms?.version ?? '');
      await login(form.email.trim().toLowerCase(), form.password, true);
    } catch (err) {
      setError(errorText(err, 'Não foi possível criar a conta.'));
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: k === 'cnpj' ? maskCnpj(e.target.value) : k === 'accept' ? e.target.checked : e.target.value });

  return (
    <Shell>
      <div className="flex flex-col gap-6 px-5 pb-10 pt-8">
        <div className="flex items-center gap-3">
          <img src="/confere-app/icon-192.png" alt="" className="h-14 w-14 rounded-2xl" />
          <div>
            <p className="text-sm font-semibold text-green-800">MercadoFlow</p>
            <h1 className="text-3xl font-extrabold leading-none">Confere</h1>
          </div>
        </div>
        <div>
          <h2 className="text-3xl font-extrabold leading-tight">Confira a entrega pela nota, em letras grandes.</h2>
          <p className="mt-3 text-lg text-stone-700">
            Aponte a câmera para o código de barras do DANFE: aparecem os produtos, com foto, e as quantidades para ticar.
            Grátis com o certificado A1 do mercado{terms?.trialReads ? `, e ${terms.trialReads} leituras grátis para testar sem ele` : ''}.
          </p>
        </div>
        <div className="grid grid-cols-2 rounded-2xl bg-white p-1" role="tablist">
          {([['criar', 'Criar conta'], ['entrar', 'Já tenho conta']] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setError(null); }}
              className={`h-12 rounded-xl text-lg font-bold ${tab === k ? 'bg-green-700 text-white' : 'text-stone-700'}`}>{l}</button>
          ))}
        </div>
        {error && <p role="alert" className="rounded-2xl bg-red-50 p-4 text-lg text-red-800">{error}</p>}
        {tab === 'entrar' ? (
          <form onSubmit={doLogin} className="flex flex-col gap-4">
            <Field label="E-mail" type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
            <Field label="Senha" type="password" autoComplete="current-password" required value={form.password} onChange={set('password')} />
            <BigButton type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</BigButton>
            <p className="text-center text-base text-stone-600">A mesma conta do MercadoFlow.</p>
          </form>
        ) : (
          <form onSubmit={doRegister} className="flex flex-col gap-4">
            <Field label="Nome do mercado" required value={form.marketName} onChange={set('marketName')} autoComplete="organization" />
            <Field label="CNPJ do mercado" required inputMode="numeric" value={form.cnpj} onChange={set('cnpj')} placeholder="00.000.000/0000-00" />
            <Field label="Seu nome" required value={form.name} onChange={set('name')} autoComplete="name" />
            <Field label="E-mail" type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
            <Field label="Senha" type="password" required value={form.password} onChange={set('password')} autoComplete="new-password"
              hint="8 ou mais caracteres, com maiúscula, minúscula, número e símbolo." />
            <label className="flex items-start gap-3 rounded-2xl bg-white p-4 text-base">
              <input type="checkbox" checked={form.accept} onChange={set('accept')} className="mt-1 h-6 w-6 shrink-0 accent-green-700" />
              <span>
                Li e aceito os termos: <strong>as notas lidas ficam armazenadas pelo MercadoFlow</strong>, ligadas ao meu mercado.{' '}
                <button type="button" onClick={() => setShowTerms((v) => !v)} className="font-semibold text-green-800 underline">{showTerms ? 'Esconder' : 'Ler os termos'}</button>
              </span>
            </label>
            {showTerms && <pre className="whitespace-pre-wrap rounded-2xl bg-white p-4 font-sans text-base text-stone-700">{terms?.text ?? 'Carregando…'}</pre>}
            <BigButton type="submit" disabled={busy}>{busy ? 'Criando…' : 'Criar conta grátis'}</BigButton>
          </form>
        )}
      </div>
    </Shell>
  );
};

export const TermsScreen: React.FC<{ status: ConfereStatus; marketId: string; onAccepted: (s: ConfereStatus) => void }> = ({ status, marketId, onAccepted }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = async () => {
    setBusy(true);
    try {
      onAccepted(await confereService.acceptTerms(marketId, status.termsVersion));
    } catch (e) {
      setError(errorText(e, 'Não foi possível registrar o aceite.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell>
      <div className="flex flex-col gap-5 px-5 pb-10 pt-8">
        <ShieldCheck className="h-12 w-12 text-green-700" />
        <h1 className="text-3xl font-extrabold">Termos do Confere</h1>
        <pre className="whitespace-pre-wrap rounded-2xl bg-white p-5 font-sans text-lg text-stone-800">{status.termsText}</pre>
        {error && <p role="alert" className="text-lg text-red-700">{error}</p>}
        <BigButton onClick={accept} disabled={busy}>{busy ? 'Registrando…' : 'Aceito: as notas ficam armazenadas'}</BigButton>
        {!status.trialGranted && status.trialReads > 0 && <p className="text-center text-lg text-stone-700">Ao aceitar, você ganha {status.trialReads} leituras grátis.</p>}
      </div>
    </Shell>
  );
};
