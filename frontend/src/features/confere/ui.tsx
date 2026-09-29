import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

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
