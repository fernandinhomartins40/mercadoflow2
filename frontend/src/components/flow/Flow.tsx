import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, type LucideIcon } from 'lucide-react';

/**
 * Blocos do visual Flow (styles/flow.css): título com destaque, hub de ações,
 * painel floresta, abas em pílula, linhas selecionáveis, etapas e a faixa de
 * explicação. As telas montam a página com estes blocos.
 */

export const PageHero: React.FC<{ title: React.ReactNode; subtitle?: React.ReactNode; side?: React.ReactNode }> = ({ title, subtitle, side }) => (
  <header className="fx-hero">
    <div className="fx-hero-text">
      <h1 className="fx-title">{title}</h1>
      {subtitle && <p className="fx-sub">{subtitle}</p>}
    </div>
    {side && <div className="fx-hero-side">{side}</div>}
  </header>
);

export interface HubAction {
  label: string;
  icon: LucideIcon;
  to?: string;
  onClick?: () => void;
  href?: string;
}

/** Nó verde-limão ligado por linhas curvas às ações da tela (até 3). */
export const ActionHub: React.FC<{ icon: React.ElementType; actions: HubAction[]; label?: string; onForest?: boolean }> = ({ icon: Icon, actions, label, onForest }) => {
  const list = actions.slice(0, 3);
  const row = 64;
  const h = list.length * row - 12;
  const cy = h / 2;
  return (
    <nav className={`fx-hub ${onForest ? 'on-forest' : ''}`} aria-label={label ?? 'Ações desta tela'}>
      <span className="fx-hub-node" aria-hidden="true"><Icon /></span>
      <svg className="fx-hub-lines" viewBox={`0 0 64 ${h}`} style={{ height: h }} aria-hidden="true" preserveAspectRatio="none">
        {list.map((_, i) => {
          const y = 26 + i * row;
          return (
            <g key={i}>
              <path d={`M0 ${cy} C 30 ${cy}, 30 ${y}, 58 ${y}`} />
              <circle cx={58} cy={y} r={3.2} />
            </g>
          );
        })}
      </svg>
      <div className="fx-hub-actions">
        {list.map((a) => {
          const A = a.icon;
          const inner = <><A aria-hidden="true" />{a.label}</>;
          if (a.to) return <Link key={a.label} to={a.to} className="fx-hub-btn">{inner}</Link>;
          if (a.href) return <a key={a.label} href={a.href} className="fx-hub-btn" target="_blank" rel="noreferrer">{inner}</a>;
          return <button key={a.label} type="button" onClick={a.onClick} className="fx-hub-btn">{inner}</button>;
        })}
      </div>
    </nav>
  );
};

export const Forest: React.FC<React.HTMLAttributes<HTMLElement> & { as?: 'section' | 'div' | 'aside' }> = ({ as = 'section', className = '', children, ...rest }) =>
  React.createElement(as, { className: `fx-forest ${className}`, ...rest }, children);

export const Card: React.FC<React.HTMLAttributes<HTMLElement> & { as?: 'section' | 'div' | 'article'; pad?: boolean }> = ({ as = 'section', pad = true, className = '', children, ...rest }) =>
  React.createElement(as, { className: `fx-card ${pad ? 'fx-card-pad' : ''} ${className}`, ...rest }, children);

export const PanelTitle: React.FC<{ icon?: React.ElementType; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }> = ({ icon: Icon, title, sub, right }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, justifyContent: 'space-between', flexWrap: 'wrap' }}>
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
      {Icon && <span className="fx-icon-tile"><Icon aria-hidden="true" /></span>}
      <div style={{ minWidth: 0 }}>
        <h2 className="fx-panel-title">{title}</h2>
        {sub && <p className="fx-panel-sub">{sub}</p>}
      </div>
    </div>
    {right}
  </div>
);

export interface PillTab<T extends string> { key: T; label: string; icon?: LucideIcon; count?: number }

export function PillTabs<T extends string>({ tabs, value, onChange, label }: { tabs: PillTab<T>[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="fx-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => {
        const I = t.icon;
        return (
          <button key={t.key} type="button" role="tab" aria-selected={value === t.key} className="fx-tab" onClick={() => onChange(t.key)}>
            {I && <I size={17} aria-hidden="true" />}{t.label}{t.count != null && t.count > 0 && <span className="fx-count">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export const Chip: React.FC<{ tone?: 'red' | 'green' | 'lime' | 'amber' | 'ghost' | 'gray'; children: React.ReactNode; icon?: LucideIcon }> = ({ tone = 'gray', children, icon: I }) => (
  <span className={`fx-chip ${tone}`}>{I && <I size={14} aria-hidden="true" />}{children}</span>
);

/** Linha clicável de lista; a selecionada ganha a borda verde-limão. */
export const Row: React.FC<{ selected?: boolean; onClick?: () => void; to?: string; children: React.ReactNode; chevron?: boolean; label?: string }> = ({ selected, onClick, to, children, chevron = true, label }) => {
  const body = <>{children}{chevron && <ChevronRight className="fx-chev" size={20} aria-hidden="true" />}</>;
  if (to) return <Link to={to} className={`fx-row ${selected ? 'selected' : ''}`} aria-current={selected || undefined} aria-label={label}>{body}</Link>;
  return <button type="button" onClick={onClick} className={`fx-row ${selected ? 'selected' : ''}`} aria-current={selected || undefined} aria-label={label}>{body}</button>;
};

const TILE = ['#2E7D5B', '#B4541A', '#6A4BC4', '#1F6FB2', '#A83262', '#5E7A10', '#8A5A00', '#2E7D7A'];
/** Foto do produto, ou um quadrado colorido com as iniciais quando não há foto. */
export const Thumb: React.FC<{ name: string; src?: string | null; size?: number }> = ({ name, src, size = 52 }) => {
  if (src) return <img src={src} alt="" className="fx-thumb" style={{ width: size, height: size }} loading="lazy" />;
  const color = TILE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TILE.length];
  const ini = name.split(/\s+/).filter((w) => /[A-Za-zÀ-ú]/.test(w[0] ?? '')).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  return <span className="fx-thumb" aria-hidden="true" style={{ width: size, height: size, background: color, fontSize: size * 0.3 }}>{ini}</span>;
};

export interface Step { label: string; hint?: string; state: 'done' | 'now' | 'next' }
export const StepTrack: React.FC<{ steps: Step[] }> = ({ steps }) => (
  <ol className="fx-steps" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
    {steps.map((s, i) => (
      <React.Fragment key={s.label}>
        {i > 0 && <span className="fx-step-line" aria-hidden="true" />}
        <li className={`fx-step ${s.state}`} aria-current={s.state === 'now' ? 'step' : undefined}>
          <i>{s.state === 'done' ? '✓' : i + 1}</i>
          <span><b>{s.label}</b>{s.hint && <small>{s.hint}</small>}</span>
        </li>
      </React.Fragment>
    ))}
  </ol>
);

export const ExplainStrip: React.FC<{ items: { icon: LucideIcon; title: string; text: string }[] }> = ({ items }) => (
  <div className="fx-explain">
    {items.map((it) => {
      const I = it.icon;
      return (
        <div key={it.title}>
          <span className="ic"><I size={18} aria-hidden="true" /></span>
          <span><b>{it.title}</b><span>{it.text}</span></span>
        </div>
      );
    })}
  </div>
);

export const Kpi: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon }> = ({ label, value, hint, icon: I }) => (
  <div className="fx-kpi">
    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>{label}{I && <I size={20} aria-hidden="true" style={{ color: 'var(--fx-green)' }} />}</span>
    <b>{value}</b>
    {hint && <small>{hint}</small>}
  </div>
);

export const brl = (v: number | null | undefined, max = 2) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: Math.abs(Number(v)) >= 1000 ? 0 : max });
