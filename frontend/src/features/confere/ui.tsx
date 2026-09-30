import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight } from 'lucide-react';

/**
 * Peças visuais do Confere: jeito de app nativo, letras grandes e alvos de toque
 * de 48 px ou mais (doca, luva, sol).
 *
 * Cores: fundo #EEF3F0, texto #0F1A14, verde #0A7A3D/#06592C, linha #DCE5DF.
 */

export const errorText = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

export const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-[100dvh] bg-[#EEF3F0] text-[#0F1A14] antialiased" style={{ fontSize: 17 }}>
    <div className="mx-auto w-full max-w-xl">{children}</div>
  </div>
);

/** Cabeçalho de vidro: voltar, título e uma ação opcional à direita. */
export const TopBar: React.FC<{ title: string; back?: string; action?: React.ReactNode }> = ({ title, back = '/confere/', action }) => (
  <header className="cf-glass-header sticky top-0 z-20 flex items-center gap-3 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
    <Link to={back} aria-label="Voltar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-[#DCE5DF] active:scale-95"><ArrowLeft className="h-5 w-5" /></Link>
    <h1 className="min-w-0 flex-1 truncate text-[1.6rem] font-extrabold tracking-tight">{title}</h1>
    {action}
  </header>
);

/** Título grande da aba (Início, Notas, Créditos, Conta). */
export const TabHeader: React.FC<{ title: string; subtitle?: React.ReactNode; action?: React.ReactNode; small?: boolean }> = ({ title, subtitle, action, small }) => (
  <header className="cf-glass-header sticky top-0 z-20 flex items-end gap-3 px-5 pb-3 pt-[max(16px,env(safe-area-inset-top))]">
    <div className="min-w-0 flex-1">
      {subtitle && <p className="truncate text-sm font-semibold text-[#5B6B62]">{subtitle}</p>}
      <h1 className={`font-extrabold leading-tight tracking-tight ${small ? 'line-clamp-2 text-[1.55rem]' : 'truncate text-[2rem]'}`}>{title}</h1>
    </div>
    {action}
  </header>
);

export const Card: React.FC<React.HTMLAttributes<HTMLElement> & { as?: 'section' | 'div' }> = ({ as = 'section', className = '', ...props }) =>
  React.createElement(as, { ...props, className: `rounded-3xl bg-white p-5 shadow-[0_1px_2px_rgba(15,26,20,0.04)] ring-1 ring-[#DCE5DF] ${className}` });

export const SectionTitle: React.FC<{ children: React.ReactNode; action?: React.ReactNode }> = ({ children, action }) => (
  <div className="flex items-center justify-between px-1">
    <h2 className="text-lg font-extrabold tracking-tight">{children}</h2>
    {action}
  </div>
);

/** Grupo de linhas, como nos ajustes do celular. */
export const Group: React.FC<{ children: React.ReactNode; label?: string }> = ({ children, label }) => (
  <div className="flex flex-col gap-1.5">
    {label && <p className="px-4 text-sm font-semibold text-[#5B6B62]">{label}</p>}
    <ul className="divide-y divide-[#E6EDE8] overflow-hidden rounded-3xl bg-white ring-1 ring-[#DCE5DF]">{children}</ul>
  </div>
);

export const Row: React.FC<{
  icon: React.ReactNode; title: string; detail?: React.ReactNode; to?: string; onClick?: () => void;
  tone?: 'green' | 'amber' | 'red' | 'stone'; trailing?: React.ReactNode;
}> = ({ icon, title, detail, to, onClick, tone = 'green', trailing }) => {
  const tones = { green: 'bg-[#E3F4EA] text-[#0A7A3D]', amber: 'bg-amber-100 text-amber-800', red: 'bg-red-50 text-red-700', stone: 'bg-stone-100 text-stone-700' };
  const inner = (
    <>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-base font-bold ${tone === 'red' ? 'text-red-700' : ''}`}>{title}</span>
        {detail && <span className="block truncate text-sm text-[#5B6B62]">{detail}</span>}
      </span>
      {trailing ?? <ChevronRight className="h-5 w-5 shrink-0 text-stone-300" aria-hidden="true" />}
    </>
  );
  const cls = 'flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left active:bg-[#F3F7F4]';
  return <li>{to ? <Link to={to} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>}</li>;
};

export const Field: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }> = ({ label, hint, ...props }) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-base font-semibold">{label}</span>
    <input {...props} className="h-14 rounded-2xl border border-[#CFDAD3] bg-[#F7FAF8] px-4 text-lg outline-none transition focus:border-[#0A7A3D] focus:bg-white focus:ring-4 focus:ring-[#0A7A3D]/15" />
    {hint && <span className="text-sm text-[#5B6B62]">{hint}</span>}
  </label>
);

export const BigButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'green' | 'white' }> = ({ tone = 'green', className = '', ...props }) => (
  <button {...props} className={`flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-lg font-bold transition active:scale-[0.98] disabled:opacity-50 ${
    tone === 'green' ? 'bg-gradient-to-b from-[#0C8A45] to-[#06592C] text-white shadow-[0_8px_20px_-8px_rgba(10,122,61,0.7)]' : 'bg-white text-[#0F1A14] ring-1 ring-[#CFDAD3]'} ${className}`} />
);

export const Spinner: React.FC = () => (
  <Shell>
    <div className="flex h-[80vh] items-center justify-center" role="status">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#0A7A3D] border-t-transparent" />
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
            done ? 'bg-[#0A7A3D] text-white' : active ? 'bg-[#0F1A14] text-white' : 'bg-stone-300 text-stone-600'}`}>
            {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
          </span>
          <span className={`text-xs font-bold ${active ? 'whitespace-nowrap text-stone-900' : `truncate max-[380px]:sr-only ${done ? 'text-green-800' : 'text-stone-500'}`}`}>{label}</span>
          {i < STEPS.length - 1 && <span className={`h-0.5 min-w-2 flex-1 rounded ${done ? 'bg-[#0A7A3D]' : 'bg-[#CFDAD3]'}`} aria-hidden="true" />}
        </li>
      );
    })}
  </ol>
);
