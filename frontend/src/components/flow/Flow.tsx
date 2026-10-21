import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, MoreHorizontal, X, type LucideIcon } from 'lucide-react';

/**
 * Blocos do visual Flow (styles/flow.css): título com destaque, hub de ações,
 * painel floresta, abas em pílula, linhas selecionáveis, etapas e a faixa de
 * explicação. As telas montam a página com estes blocos.
 */

/** Nome da tela atual, dado pela casca do mercado (Layout). Fora dela, nulo. */
export const PageNameContext = React.createContext<string | null>(null);

/**
 * Cabeçalho da tela. No painel do mercado o título é o nome da tela ("Decidir",
 * "Pedidos"), sempre igual e no mesmo lugar; a frase da tela vira a linha de
 * baixo. Fora do mercado (indústria, vendas) segue o título recebido.
 */
export const PageHero: React.FC<{ title: React.ReactNode; subtitle?: React.ReactNode; side?: React.ReactNode; name?: React.ReactNode }> = ({ title, subtitle, side, name: own }) => {
  const context = React.useContext(PageNameContext);
  const name = own ?? context;
  return (
    <header className="fx-hero">
      <div className="fx-hero-text">
        {name ? (
          <>
            <h1 className="fx-title">{name}</h1>
            <p className="fx-lead">{title}</p>
          </>
        ) : <h1 className="fx-title">{title}</h1>}
        {subtitle && <p className="fx-sub">{subtitle}</p>}
      </div>
      {side && <div className="fx-hero-side">{side}</div>}
    </header>
  );
};

export interface HubAction {
  label: string;
  icon: LucideIcon;
  to?: string;
  onClick?: () => void;
  href?: string;
}

/**
 * Ações da tela (até 3), como botões simples ao lado do título. Antes era um nó
 * verde-limão ligado por curvas aos botões: parecia desenho, não botão.
 */
export const ActionHub: React.FC<{ icon: React.ElementType; actions: HubAction[]; label?: string; onForest?: boolean }> = ({ actions, label }) => (
  <nav className="fx-hub" aria-label={label ?? 'Ações desta tela'}>
    {actions.slice(0, 3).map((a) => {
      const A = a.icon;
      const inner = <><A aria-hidden="true" />{a.label}</>;
      if (a.to) return <Link key={a.label} to={a.to} className="fx-hub-btn">{inner}</Link>;
      if (a.href) return <a key={a.label} href={a.href} className="fx-hub-btn" target="_blank" rel="noreferrer">{inner}</a>;
      return <button key={a.label} type="button" onClick={a.onClick} className="fx-hub-btn">{inner}</button>;
    })}
  </nav>
);

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
export const PagedBox: React.FC<{ page: number; pages: number; total: number; size: number; onPage: (p: number) => void; label?: string; resetKey?: unknown; fill?: (body: HTMLDivElement) => void; children: React.ReactNode }> = ({ page, pages, total, size, onPage, label, resetKey, fill, children }) => {
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
    // Lista ao lado do painel: a altura vem do painel e a lista mede quantas linhas cabem.
    if (fill) { fill(el); return; }
    const h = el.offsetHeight;
    if (pages > 1 && h > minH) setMinH(h);
  });
  React.useEffect(() => {
    const el = ref.current;
    if (!fill || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => fill(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill]);
  const go = (p: number) => {
    onPage(p);
    const el = ref.current;
    if (el) el.scrollTop = 0;
    // Se o começo da lista saiu da tela, volta até ele; senão a página troca no lugar.
    if (el && el.getBoundingClientRect().top < 72) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div className="fx-paged">
      <div ref={ref} className="fx-paged-body" style={!fill && minH && pages > 1 ? { minHeight: minH } : undefined}>{children}</div>
      <Pager page={page} pages={pages} total={total} size={size} onPage={go} label={label} />
    </div>
  );
};

/** Tela larga o bastante para lista e painel lado a lado (igual ao .fx-split). */
export function useWide(min = 1100) {
  const q = `(min-width: ${min}px)`;
  const [wide, setWide] = React.useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  React.useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return wide;
}

/**
 * Lista ao lado de um painel de altura fixa (.fx-split.panes): quantas linhas
 * cabem na altura que sobra para ela. Mede a área da lista; se a página medida
 * passar da altura, tira uma linha. No celular (lista e painel empilhados), fallback.
 */
export function usePaneFill(rowPx: number, fallback: number) {
  const wide = useWide();
  const [rows, setRows] = React.useState(fallback);
  const lastH = React.useRef(-1);
  const fill = React.useCallback((el: HTMLDivElement) => {
    const h = el.clientHeight;
    if (h <= 0) return;
    if (h !== lastH.current) { lastH.current = h; setRows(Math.max(3, Math.floor((h + 8) / rowPx))); return; }
    if (el.scrollHeight > h + 2) setRows((r) => (r > 3 ? r - 1 : r));
  }, [rowPx]);
  return { rows: wide ? rows : fallback, fill: wide ? fill : undefined };
}

/** Atalho do PagedBox para uma lista simples: recebe tudo e mostra uma página por vez. */
export function PagedList<T>({ items, size, label, resetKey, render, as: Tag = 'ul', className = 'fx-stack', style, role, ariaLabel, fill }: {
  items: T[]; size: number; label?: string; resetKey?: unknown; render: (item: T, index: number) => React.ReactNode;
  as?: 'ul' | 'div'; className?: string; style?: React.CSSProperties; role?: string; ariaLabel?: string; fill?: (body: HTMLDivElement) => void;
}) {
  const paged = usePaged(items, size, resetKey);
  const listStyle: React.CSSProperties = Tag === 'ul' ? { listStyle: 'none', margin: 0, padding: 0, ...style } : { ...style };
  return (
    <PagedBox page={paged.page} pages={paged.pages} total={paged.total} size={paged.size} onPage={paged.setPage} label={label} resetKey={resetKey} fill={fill}>
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

/** Foto ampliada de um produto: o que o visualizador (PhotoViewer) mostra. */
export interface ProductPhoto { src: string; name: string; productId?: string | null; info?: string | null }
const PHOTO_EVENT = 'mf:foto-produto';
/** Abre a foto ampliada de um produto, de qualquer tela. */
export const openProductPhoto = (photo: ProductPhoto) => window.dispatchEvent(new CustomEvent<ProductPhoto>(PHOTO_EVENT, { detail: photo }));

/**
 * Foto do produto, ou um quadrado colorido com as iniciais quando não há foto.
 * Com foto, um toque abre a foto ampliada (mesmo dentro de uma linha clicável).
 */
export const Thumb: React.FC<{ name: string; src?: string | null; size?: number; productId?: string | null; info?: string | null }> = ({ name, src, size = 52, productId, info }) => {
  const [broken, setBroken] = React.useState(false);
  if (src && !broken) {
    const open = (e: React.SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openProductPhoto({ src, name, productId, info });
    };
    return (
      <span role="button" tabIndex={0} className="fx-thumb-zoom" aria-label={`Ampliar a foto de ${name}`} title="Ampliar a foto"
        onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open(e); }}>
        <img src={src} alt="" className="fx-thumb" style={{ width: size, height: size }} loading="lazy" onError={() => setBroken(true)} />
      </span>
    );
  }
  const color = TILE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TILE.length];
  const ini = name.split(/\s+/).filter((w) => /[A-Za-zÀ-ú]/.test(w[0] ?? '')).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  return <span className="fx-thumb" aria-hidden="true" style={{ width: size, height: size, background: color, fontSize: size * 0.3 }}>{ini}</span>;
};

/**
 * Foto ampliada do produto, por cima da tela: a foto grande, o nome inteiro,
 * uma linha útil e o caminho para a página do produto. Montado uma vez na casca.
 */
export const PhotoViewer: React.FC = () => {
  const [photo, setPhoto] = React.useState<ProductPhoto | null>(null);
  const location = useLocation();
  React.useEffect(() => {
    const on = (e: Event) => setPhoto((e as CustomEvent<ProductPhoto>).detail);
    window.addEventListener(PHOTO_EVENT, on);
    return () => window.removeEventListener(PHOTO_EVENT, on);
  }, []);
  React.useEffect(() => { setPhoto(null); }, [location.pathname]);
  React.useEffect(() => {
    if (!photo) return undefined;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPhoto(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [photo]);
  if (!photo) return null;
  const productPage = photo.productId ? `/app/produtos/${photo.productId}` : null;
  return (
    <div className="fx-photo-shade" role="dialog" aria-modal="true" aria-label={`Foto de ${photo.name}`} onClick={() => setPhoto(null)}>
      <figure className="fx-photo" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="fx-photo-close" onClick={() => setPhoto(null)} aria-label="Fechar a foto"><X aria-hidden="true" /></button>
        <div className="fx-photo-img"><img src={photo.src} alt={`Foto de ${photo.name}`} /></div>
        <figcaption>
          <b>{photo.name}</b>
          {photo.info && <span>{photo.info}</span>}
          {productPage && location.pathname !== productPage && <Link to={productPage} className="fx-btn dark small">Ver o produto</Link>}
        </figcaption>
      </figure>
    </div>
  );
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

export interface MoreAction { label: string; icon?: LucideIcon; onClick: () => void; danger?: boolean; disabled?: boolean }

/**
 * Menu "⋯" para ações raras ou perigosas (remover, excluir). Fica longe da
 * ação principal: um botão vermelho ao lado de "Publicar" convidava ao erro.
 */
export const MoreMenu: React.FC<{ label: string; actions: MoreAction[] }> = ({ label, actions }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="fx-more-menu" ref={ref}>
      <button type="button" className="fx-more-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal aria-hidden="true" />
      </button>
      {open && (
        <div className="fx-more-pop" role="menu">
          {actions.map((a) => {
            const I = a.icon;
            return (
              <button key={a.label} type="button" role="menuitem" disabled={a.disabled} className={a.danger ? 'danger' : ''}
                onClick={() => { setOpen(false); a.onClick(); }}>
                {I && <I aria-hidden="true" />}{a.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
