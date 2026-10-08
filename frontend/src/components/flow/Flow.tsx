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

/** Página atual de uma lista longa; volta à 1 quando a lista muda de tamanho. */
export function usePaged<T>(items: T[], size = 12, resetKey?: unknown) {
  const [page, setPage] = React.useState(0);
  const pages = Math.max(1, Math.ceil(items.length / size));
  React.useEffect(() => { setPage(0); }, [resetKey, pages]);
  const safe = Math.min(page, pages - 1);
  return { page: safe, pages, setPage, slice: items.slice(safe * size, safe * size + size), size, total: items.length };
}

/** Controles de página: anterior, números (com reticências) e próxima. */
export const Pager: React.FC<{ page: number; pages: number; total: number; size: number; onPage: (p: number) => void; label?: string }> = ({ page, pages, total, size, onPage, label = 'itens' }) => {
  if (pages <= 1) return null;
  const nums: (number | '…')[] = [];
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  return (
    <nav className="fx-pager" aria-label="Páginas">
      <span>{page * size + 1}–{Math.min(total, (page + 1) * size)} de {total} {label}</span>
      <span className="pages">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page === 0} aria-label="Página anterior">‹</button>
        {nums.map((n, i) => n === '…' ? <span key={`e${i}`} style={{ alignSelf: 'center', padding: '0 2px' }}>…</span> : (
          <button key={n} type="button" onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined}>{n + 1}</button>
        ))}
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages - 1} aria-label="Próxima página">›</button>
      </span>
    </nav>
  );
};

/**
 * Lista longa em páginas de tamanho fixo. A altura trava na maior página já
 * vista, então a última (mais curta) não encolhe o card e o paginador fica
 * sempre no rodapé, no mesmo lugar, para ir passando sem caçar o botão.
 */
export const PagedBox: React.FC<{ page: number; pages: number; total: number; size: number; onPage: (p: number) => void; label?: string; resetKey?: unknown; onOverflow?: () => void; onPageChange?: () => void; children: React.ReactNode }> = ({ page, pages, total, size, onPage, label, resetKey, onOverflow, onPageChange, children }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [minH, setMinH] = React.useState(0);
  React.useEffect(() => { setMinH(0); }, [resetKey, size, total]);
  React.useEffect(() => {
    const reset = () => setMinH(0);
    window.addEventListener('resize', reset);
    return () => window.removeEventListener('resize', reset);
  }, []);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Na altura fixa (lista ao lado do painel), página que não cabe perde uma linha.
    if (onOverflow && el.scrollHeight > el.clientHeight + 2) { onOverflow(); return; }
    const h = el.offsetHeight;
    if (pages > 1 && h > minH) setMinH(h);
  });
  const go = (p: number) => {
    onPage(p);
    const el = ref.current;
    if (el) el.scrollTop = 0;
    if (onPageChange) { onPageChange(); return; }
    // Se o começo da lista saiu da tela, volta até ele; senão a página troca no lugar.
    if (el && el.getBoundingClientRect().top < 72) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div className="fx-paged">
      <div ref={ref} className="fx-paged-body" style={minH && pages > 1 ? { minHeight: minH } : undefined}>{children}</div>
      <Pager page={page} pages={pages} total={total} size={size} onPage={go} label={label} />
    </div>
  );
};

/** Altura tirada da tela pelo cabeçalho e pela doca, quando não dá para medir. */
const PANE_OFFSET = 188;

/** A faixa visível entre o cabeçalho fixo e a doca, medida na tela. */
function paneBand() {
  const top = document.querySelector('.fx-top')?.getBoundingClientRect().bottom ?? 76;
  const dock = document.querySelector('.fx-dock')?.getBoundingClientRect().top ?? window.innerHeight - 112;
  return { top: Math.max(0, top) + 8, bottom: dock - 10 };
}

/**
 * Lista + painel lado a lado: a altura é a faixa entre o cabeçalho e a doca
 * (medida, não chutada), para os dois caberem inteiros na tela com o
 * paginador visível. Devolve a ref do .fx-split e um "alinhar" que rola a
 * página até os dois ficarem inteiros à vista.
 */
export function usePaneFit<T extends HTMLElement = HTMLDivElement>() {
  const ref = React.useRef<T>(null);
  React.useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      if (window.innerWidth < 1100) { el.style.removeProperty('--pane-h'); return; }
      const band = paneBand();
      el.style.setProperty('--pane-h', `${Math.max(360, Math.round(band.bottom - band.top))}px`);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  });
  const align = React.useCallback(() => {
    const el = ref.current;
    if (!el || window.innerWidth < 1100) return;
    const band = paneBand();
    const r = el.getBoundingClientRect();
    if (r.top < band.top - 2 || r.bottom > band.bottom + 2) window.scrollBy({ top: r.top - band.top, behavior: 'smooth' });
  }, []);
  return { ref, align };
}
/**
 * Quantas linhas cabem numa página de lista que divide a tela com um painel.
 * No computador, a lista e o painel têm a altura da tela, então o número de
 * linhas sai da altura: o paginador nunca cai para fora. No celular, fallback.
 */
export function usePaneRows(rowPx: number, chromePx: number, fallback: number) {
  const calc = React.useCallback(() => (typeof window === 'undefined' || window.innerWidth < 1100 ? fallback
    : Math.max(3, Math.floor((Math.max(360, (() => { const b = paneBand(); return b.bottom - b.top; })() || window.innerHeight - PANE_OFFSET) - chromePx) / rowPx))), [rowPx, chromePx, fallback]);
  const [n, setN] = React.useState(calc);
  // Linhas tiradas porque a página medida não coube (a estimativa errou para cima).
  const [cut, setCut] = React.useState(0);
  React.useEffect(() => {
    setN(calc()); setCut(0);
    const on = () => { setN(calc()); setCut(0); };
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [calc]);
  const rows = Math.max(3, n - cut);
  const shrink = React.useCallback(() => setCut((c) => (n - c > 3 ? c + 1 : c)), [n]);
  return { rows, shrink };
}

/** Atalho do PagedBox para uma lista simples: recebe tudo e mostra uma página por vez. */
export function PagedList<T>({ items, size, label, resetKey, render, as: Tag = 'ul', className = 'fx-stack', style, role, ariaLabel, onOverflow }: {
  items: T[]; size: number; label?: string; resetKey?: unknown; render: (item: T, index: number) => React.ReactNode;
  as?: 'ul' | 'div'; className?: string; style?: React.CSSProperties; role?: string; ariaLabel?: string; onOverflow?: () => void;
}) {
  const paged = usePaged(items, size, resetKey);
  const listStyle: React.CSSProperties = Tag === 'ul' ? { listStyle: 'none', margin: 0, padding: 0, ...style } : { ...style };
  return (
    <PagedBox page={paged.page} pages={paged.pages} total={paged.total} size={paged.size} onPage={paged.setPage} label={label} resetKey={resetKey} onOverflow={onOverflow}>
      <Tag className={className} style={listStyle} role={role} aria-label={ariaLabel}>{paged.slice.map((it, i) => render(it, paged.page * paged.size + i))}</Tag>
    </PagedBox>
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
