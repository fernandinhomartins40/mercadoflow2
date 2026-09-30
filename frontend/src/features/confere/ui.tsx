import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';

/** Peças visuais do Confere: letras grandes e alvos de toque de 56 px ou mais (doca, luva, sol). */

export const errorText = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

export const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-[100dvh] bg-stone-100 text-stone-900" style={{ fontSize: 17 }}>
    <div className="mx-auto w-full max-w-xl">{children}</div>
  </div>
);

export const TopBar: React.FC<{ title: string; back?: string }> = ({ title, back = '/confere/' }) => (
  <header className="sticky top-0 z-10 flex items-center gap-3 bg-stone-100/95 px-4 py-3 backdrop-blur">
    <Link to={back} aria-label="Voltar" className="flex h-12 w-12 items-center justify-center rounded-full bg-white"><ArrowLeft className="h-6 w-6" /></Link>
    <h1 className="text-2xl font-extrabold">{title}</h1>
  </header>
);

export const Field: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }> = ({ label, hint, ...props }) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-base font-semibold text-stone-800">{label}</span>
    <input {...props} className="h-14 rounded-2xl border-2 border-stone-300 bg-white px-4 text-lg outline-none focus:border-green-700" />
    {hint && <span className="text-sm text-stone-600">{hint}</span>}
  </label>
);

export const BigButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'green' | 'white' }> = ({ tone = 'green', className = '', ...props }) => (
  <button {...props} className={`flex h-16 w-full items-center justify-center gap-2 rounded-2xl text-xl font-bold transition disabled:opacity-50 ${
    tone === 'green' ? 'bg-green-700 text-white active:bg-green-800' : 'border-2 border-stone-300 bg-white text-stone-900'} ${className}`} />
);

export const Spinner: React.FC = () => (
  <Shell>
    <div className="flex h-[80vh] items-center justify-center" role="status">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-700 border-t-transparent" />
      <span className="sr-only">Carregando</span>
    </div>
  </Shell>
);

export const validKey = (k: string) => {
  if (!/^\d{44}$/.test(k)) return false;
  let sum = 0;
  let w = 2;
  for (let i = 42; i >= 0; i--) { sum += Number(k[i]) * w; w = w === 9 ? 2 : w + 1; }
  const dv = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return dv === Number(k[43]);
};

/** Chave de 44 dígitos dentro do que a câmera leu (o QR da NFC-e traz uma URL com a chave). */
export const keyFrom = (raw: string) => {
  const m = raw.replace(/\s/g, '').match(/\d{44}/);
  return m ? m[0] : raw.replace(/\D/g, '');
};

/** Os quatro passos da conferência, do jeito que o conferente vive a entrega. */
export const STEPS = ['Ler nota', 'Conferir', 'Revisar', 'Pronto'] as const;

export const Stepper: React.FC<{ current: 0 | 1 | 2 | 3; className?: string }> = ({ current, className = '' }) => (
  <ol className={`flex items-center gap-1 ${className}`} aria-label={`Passo ${current + 1} de ${STEPS.length}: ${STEPS[current]}`}>
    {STEPS.map((label, i) => {
      const done = i < current;
      const active = i === current;
      return (
        <li key={label} className={`flex items-center gap-1 ${active ? 'flex-none' : 'min-w-0 flex-1'}`} aria-current={active ? 'step' : undefined}>
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
            done ? 'bg-green-700 text-white' : active ? 'bg-stone-900 text-white' : 'bg-stone-300 text-stone-600'}`}>
            {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
          </span>
          <span className={`text-xs font-bold ${active ? 'whitespace-nowrap text-stone-900' : `truncate max-[380px]:sr-only ${done ? 'text-green-800' : 'text-stone-500'}`}`}>{label}</span>
          {i < STEPS.length - 1 && <span className={`h-0.5 min-w-2 flex-1 rounded ${done ? 'bg-green-700' : 'bg-stone-300'}`} aria-hidden="true" />}
        </li>
      );
    })}
  </ol>
);
