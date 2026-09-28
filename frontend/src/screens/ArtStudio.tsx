import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDown, ArrowLeft, ArrowUp, Check, CheckCircle2, ClipboardList, Copy, Download, ExternalLink, FileText, ImagePlus,
  Loader2, Megaphone, Plus, Printer, Search, Send, Sparkles, Star, Trash2, TrendingDown, TrendingUp, Upload, Users, X,
} from 'lucide-react';
import Layout from '../components/layout/Layout';
import { useAuth } from '../context/AuthContext';
import { artService, apiMessage } from '../services/art.service';
import type {
  ArtBrand, ArtCampaign, ArtProduct, ArtTheme, CampaignContent, CampaignItem, FormatKey, SuggestionGroup,
} from '../types/art.types';
import { BUILTIN_THEME, BUILTIN_THEME_ID, FORMATS, FORMAT_KEYS, UNITS, readyFormats, themeFormat } from '../features/art-studio/formats';
import { buildScene, useScene } from '../features/art-studio/scene';
import { brDate, formatPrice } from '../features/art-studio/render';
import { canvasBlob, downloadBlob, jpegPagesToPdf, posterPages, sceneCanvas, slugify } from '../features/art-studio/export';
import { loadImage } from '../features/art-studio/assets';
import ArtCanvas from '../features/art-studio/ArtCanvas';

/**
 * Encartes e cartazes (F18). O lojista diz o que quer ofertar — ou aceita a
 * sugestão tirada das vendas — e a arte se monta sozinha no tema escolhido.
 * Sai em PNG para as redes, PDF para a gráfica, cartazes de gôndola em lote e
 * um link de ofertas para mandar no WhatsApp.
 */

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';
const INPUT = `h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:border-[var(--brand-600)] ${FOCUS}`;
const inputStyle: React.CSSProperties = { borderColor: 'var(--border-soft)', background: 'var(--surface-base)', color: 'var(--text-primary)' };
const BTN = `inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50 ${FOCUS}`;
const BTN_PRIMARY = `${BTN} bg-[var(--brand-600)] text-white hover:bg-[var(--brand-700)]`;
const BTN_SECONDARY = `${BTN} border hover:bg-[var(--surface-soft)]`;
const SAVE_DELAY = 1000;

const Panel: React.FC<{ title?: string; children: React.ReactNode; action?: React.ReactNode; className?: string }> = ({ title, children, action, className = '' }) => (
  <section className={`flex flex-col gap-3 rounded-2xl p-4 ${className}`} style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
    {title && (
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
        {action}
      </div>
    )}
    {children}
  </section>
);

const newKey = () => Math.random().toString(36).slice(2, 10);
const isoToday = (plus = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + plus);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const parseMoney = (text: string): number | null => {
  const clean = text.replace(/[^\d,.-]/g, '');
  if (!clean) return null;
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};
const moneyText = (v: number | null | undefined) => (v == null ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** Nome de nota fiscal vem em caixa alta e abreviado; deixa legível. */
const tidyName = (name: string) => {
  const lower = name.toLowerCase().replace(/\s+/g, ' ').trim();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

const fromProduct = (p: ArtProduct): CampaignItem => ({
  key: newKey(), productId: p.productId, name: tidyName(p.name), price: p.price, unit: p.unit || 'un', imageUrl: p.imageUrl,
});

const MoneyField: React.FC<{ value: number | null | undefined; onChange: (v: number | null) => void; label: string; id: string; placeholder?: string }> = ({
  value, onChange, label, id, placeholder,
}) => {
  const [text, setText] = useState(moneyText(value));
  useEffect(() => { setText(moneyText(value)); }, [value]);
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>R$</span>
        <input id={id} inputMode="decimal" className={`${INPUT} pl-9 tabular-nums`} style={inputStyle} value={text} placeholder={placeholder}
          onChange={(e) => setText(e.target.value)} onBlur={() => { const v = parseMoney(text); onChange(v); setText(moneyText(v)); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      </div>
    </label>
  );
};

// ── Linha de produto ─────────────────────────────────────────────────────

const ItemRow: React.FC<{
  item: CampaignItem; index: number; total: number; selected: boolean; heroCount: number;
  onSelect: () => void; onChange: (patch: Partial<CampaignItem>) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void;
}> = ({ item, index, total, selected, heroCount, onSelect, onChange, onMove, onRemove }) => {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => { if (selected) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [selected]);
  return (
    <li ref={ref} className="rounded-xl" style={{ border: `1px solid ${selected ? 'var(--brand-600)' : 'var(--border-soft)'}`, background: 'var(--surface-base)' }}>
      <div className="flex items-center gap-2 p-2">
        <button type="button" onClick={onSelect} className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left ${FOCUS}`} aria-expanded={selected}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg" style={{ background: 'var(--surface-soft)' }}>
            {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-contain" loading="lazy" /> : <ImagePlus className="h-4 w-4" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{item.name || 'Sem nome'}</span>
            <span className="block text-xs tabular-nums" style={{ color: item.price == null ? '#b45309' : 'var(--text-muted)' }}>
              {item.price == null ? 'Falta o preço' : `${formatPrice(item.price)} ${item.unit === 'kg' ? 'o kg' : item.unit === 'un' ? '' : item.unit}`}
              {item.deal ? `, ${item.deal}` : ''}
            </span>
          </span>
        </button>
        <button type="button" onClick={() => onChange({ hero: !item.hero })} disabled={!item.hero && heroCount >= 2}
          className={`rounded-lg p-2 transition disabled:opacity-30 ${FOCUS}`} aria-pressed={!!item.hero}
          aria-label={item.hero ? 'Tirar o destaque' : 'Destacar (fica maior na arte)'} title={item.hero ? 'Tirar o destaque' : 'Destacar'}>
          <Star className="h-4 w-4" style={{ color: item.hero ? '#d97706' : 'var(--text-muted)', fill: item.hero ? '#f59e0b' : 'none' }} />
        </button>
      </div>
      {selected && (
        <div className="grid grid-cols-2 gap-3 border-t p-3" style={{ borderColor: 'var(--border-soft)' }}>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Nome na arte</span>
            <input className={INPUT} style={inputStyle} value={item.name} onChange={(e) => onChange({ name: e.target.value })} maxLength={80} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Detalhe</span>
            <input className={INPUT} style={inputStyle} value={item.detail ?? ''} placeholder="500 g, 2 litros" onChange={(e) => onChange({ detail: e.target.value })} maxLength={40} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Vendido por</span>
            <select className={INPUT} style={inputStyle} value={item.unit} onChange={(e) => onChange({ unit: e.target.value })}>
              {UNITS.map((u) => <option key={u} value={u}>{u === 'un' ? 'unidade' : u}</option>)}
            </select>
          </label>
          <MoneyField id={`price-${item.key}`} label="Preço da oferta" value={item.price} onChange={(v) => onChange({ price: v })} />
          <MoneyField id={`old-${item.key}`} label="Preço de antes (opcional)" value={item.oldPrice ?? null} onChange={(v) => onChange({ oldPrice: v })} />
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Condição (opcional)</span>
            <input className={INPUT} style={inputStyle} value={item.deal ?? ''} placeholder="Leve 3 pague 2" list="deal-options" onChange={(e) => onChange({ deal: e.target.value })} maxLength={30} />
          </label>
          <div className="col-span-2 flex items-center justify-between gap-2">
            <div className="flex gap-1">
              <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className={`${BTN_SECONDARY} h-9 px-2.5`} style={{ borderColor: 'var(--border-soft)' }} aria-label="Subir"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className={`${BTN_SECONDARY} h-9 px-2.5`} style={{ borderColor: 'var(--border-soft)' }} aria-label="Descer"><ArrowDown className="h-4 w-4" /></button>
            </div>
            <button type="button" onClick={onRemove} className={`${BTN} h-9 px-3 text-red-700 hover:bg-red-50`}><Trash2 className="h-4 w-4" />Tirar do encarte</button>
          </div>
        </div>
      )}
    </li>
  );
};

// ── Aba Produtos ─────────────────────────────────────────────────────────

const GROUP_ICON = { traffic: Users, falling: TrendingDown, rising: TrendingUp } as const;

const ProductsTab: React.FC<{
  marketId: string; items: CampaignItem[]; selectedKey: string | null; onSelect: (k: string | null) => void;
  onItems: (next: CampaignItem[]) => void;
}> = ({ marketId, items, selectedKey, onSelect, onItems }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ArtProduct[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [groups, setGroups] = useState<SuggestionGroup[] | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [paste, setPaste] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const inList = useMemo(() => new Set(items.map((i) => i.productId).filter(Boolean)), [items]);
  const heroCount = items.filter((i) => i.hero).length;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults(null); return undefined; }
    setSearching(true);
    const t = setTimeout(() => {
      artService.searchProducts(marketId, q).then(setResults).catch(() => setResults([])).finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, marketId]);

  const add = (products: ArtProduct[]) => {
    const fresh = products.filter((p) => !inList.has(p.productId)).map(fromProduct);
    if (!fresh.length) return;
    onItems([...items, ...fresh]);
    onSelect(fresh[fresh.length - 1].key);
  };

  const loadSuggestions = async () => {
    setLoadingGroups(true);
    try { setGroups(await artService.suggestions(marketId)); } catch { setGroups([]); } finally { setLoadingGroups(false); }
  };

  /** "Arroz tipo 1 5kg 24,90" por linha: o último número vira o preço. */
  const addPasted = async () => {
    if (!paste) return;
    setPasting(true);
    const lines = paste.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 40);
    const parsed: CampaignItem[] = lines.map((line) => {
      const m = line.match(/^(.*?)[\s;:\-–]*(?:R\$\s*)?(\d{1,5}(?:[.,]\d{1,2})?)\s*(kg|un)?\s*$/i);
      const name = (m ? m[1] : line).replace(/[;:\-–]+$/, '').trim();
      return { key: newKey(), name: tidyName(name || line), price: m ? parseMoney(m[2]) : null, unit: m?.[3]?.toLowerCase() === 'kg' ? 'kg' : 'un' };
    });
    // Tenta achar cada um nas vendas para trazer foto e produto.
    const enriched = await Promise.all(parsed.map(async (item) => {
      try {
        const [hit] = await artService.searchProducts(marketId, item.name.split(' ').slice(0, 3).join(' '));
        return hit ? { ...item, productId: hit.productId, imageUrl: hit.imageUrl, price: item.price ?? hit.price, unit: item.unit === 'un' ? hit.unit : item.unit } : item;
      } catch { return item; }
    }));
    onItems([...items, ...enriched]);
    setPaste(null);
    setPasting(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
        <input className={`${INPUT} pl-9`} style={inputStyle} value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar produto vendido ou código de barras" aria-label="Buscar produto" />
        {query && <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1" aria-label="Limpar a busca"><X className="h-4 w-4" style={{ color: 'var(--text-muted)' }} /></button>}
      </div>
      {results && (
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-xl p-1" style={{ border: '1px solid var(--border-soft)' }} aria-label="Resultados da busca">
          {results.length === 0 && <li className="p-3 text-sm" style={{ color: 'var(--text-muted)' }}>{searching ? 'Buscando…' : 'Nada vendido com esse nome nos últimos 90 dias.'}</li>}
          {results.map((p) => (
            <li key={p.productId}>
              <button type="button" onClick={() => add([p])} disabled={inList.has(p.productId)}
                className={`flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-[var(--surface-soft)] disabled:opacity-50 ${FOCUS}`}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded" style={{ background: 'var(--surface-soft)' }}>
                  {p.imageUrl && <img src={p.imageUrl} alt="" className="h-full w-full object-contain" loading="lazy" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{tidyName(p.name)}</span>
                  <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{p.price != null ? `${formatPrice(p.price)} na última venda` : 'sem preço'}, {p.baskets} compras</span>
                </span>
                {inList.has(p.productId) ? <Check className="h-4 w-4" style={{ color: 'var(--brand-700)' }} aria-label="Já está no encarte" /> : <Plus className="h-4 w-4" style={{ color: 'var(--brand-700)' }} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={loadSuggestions} disabled={loadingGroups} className={BTN_SECONDARY} style={{ borderColor: 'var(--border-soft)', color: 'var(--text-primary)' }}>
          {loadingGroups ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" style={{ color: 'var(--brand-700)' }} />}
          Sugerir pelas vendas
        </button>
        <button type="button" onClick={() => setPaste(paste === null ? '' : null)} className={BTN_SECONDARY} style={{ borderColor: 'var(--border-soft)', color: 'var(--text-primary)' }}>
          <ClipboardList className="h-4 w-4" />Colar lista
        </button>
        <button type="button" onClick={() => { const item = { key: newKey(), name: 'Novo produto', price: null, unit: 'un' }; onItems([...items, item]); onSelect(item.key); }}
          className={BTN_SECONDARY} style={{ borderColor: 'var(--border-soft)', color: 'var(--text-primary)' }}>
          <Plus className="h-4 w-4" />Item avulso
        </button>
      </div>

      {paste !== null && (
        <div className="flex flex-col gap-2">
          <label htmlFor="paste" className="text-sm" style={{ color: 'var(--text-muted)' }}>Um produto por linha, com o preço no fim. Ex.: <em>Picanha 59,90 kg</em></label>
          <textarea id="paste" rows={5} className={`${INPUT} h-auto py-2`} style={inputStyle} value={paste} onChange={(e) => setPaste(e.target.value)} />
          <button type="button" onClick={addPasted} disabled={!paste.trim() || pasting} className={BTN_PRIMARY}>
            {pasting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Adicionar à lista
          </button>
        </div>
      )}

      {groups && (
        <div className="flex flex-col gap-3">
          {groups.every((g) => g.products.length === 0) && (
            <p className="rounded-lg p-3 text-sm" style={{ background: 'var(--surface-soft)', color: 'var(--text-muted)' }}>Ainda não há vendas suficientes para sugerir. Busque os produtos pelo nome.</p>
          )}
          {groups.filter((g) => g.products.length).map((g) => {
            const Icon = GROUP_ICON[g.key];
            const missing = g.products.filter((p) => !inList.has(p.productId));
            return (
              <details key={g.key} className="rounded-xl" style={{ border: '1px solid var(--border-soft)' }} open={g.key === 'traffic'}>
                <summary className="flex cursor-pointer list-none items-center gap-2 p-3">
                  <Icon className="h-4 w-4 shrink-0" style={{ color: 'var(--brand-700)' }} aria-hidden="true" />
                  <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{g.title}</span>
                  {missing.length > 0 && (
                    <button type="button" onClick={(e) => { e.preventDefault(); add(missing.slice(0, 8)); }} className="text-sm font-semibold" style={{ color: 'var(--brand-700)' }}>
                      Pôr {Math.min(8, missing.length)}
                    </button>
                  )}
                </summary>
                <p className="px-3 text-xs" style={{ color: 'var(--text-muted)' }}>{g.hint}</p>
                <ul className="flex flex-col p-1">
                  {g.products.map((p) => (
                    <li key={p.productId}>
                      <button type="button" onClick={() => add([p])} disabled={inList.has(p.productId)}
                        className={`flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-[var(--surface-soft)] disabled:opacity-50 ${FOCUS}`}>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded" style={{ background: 'var(--surface-soft)' }}>
                          {p.imageUrl && <img src={p.imageUrl} alt="" className="h-full w-full object-contain" loading="lazy" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{tidyName(p.name)}</span>
                          <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{formatPrice(p.price)}. {p.reason}</span>
                        </span>
                        {inList.has(p.productId) ? <Check className="h-4 w-4" style={{ color: 'var(--brand-700)' }} aria-label="Já está no encarte" /> : <Plus className="h-4 w-4" style={{ color: 'var(--brand-700)' }} aria-hidden="true" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>No encarte ({items.length})</h3>
        {items.length > 0 && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>A estrela destaca (até 2)</span>}
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl p-4 text-sm" style={{ background: 'var(--surface-soft)', color: 'var(--text-muted)' }}>
          Nenhum produto ainda. Comece por <strong>Sugerir pelas vendas</strong>: o sistema mostra o que puxa cliente e o que precisa girar.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => (
            <ItemRow key={item.key} item={item} index={i} total={items.length} selected={selectedKey === item.key} heroCount={heroCount}
              onSelect={() => onSelect(selectedKey === item.key ? null : item.key)}
              onChange={(patch) => onItems(items.map((it) => (it.key === item.key ? { ...it, ...patch } : it)))}
              onMove={(dir) => {
                const next = [...items];
                const j = i + dir;
                [next[i], next[j]] = [next[j], next[i]];
                onItems(next);
              }}
              onRemove={() => { onItems(items.filter((it) => it.key !== item.key)); onSelect(null); }} />
          ))}
        </ul>
      )}
      <datalist id="deal-options">
        {['Leve 3 pague 2', 'Leve 2 pague 1', 'Na compra de 2', 'Só hoje', 'Preço de atacado', 'Oferta relâmpago'].map((d) => <option key={d} value={d} />)}
      </datalist>
    </div>
  );
};

// ── Aba Visual ───────────────────────────────────────────────────────────

const ThemeThumb: React.FC<{ theme: ArtTheme; format: FormatKey }> = ({ theme, format }) => {
  const tf = themeFormat(theme, format) ?? theme.formats.find((f) => f.backgroundUrl);
  if (theme.id === BUILTIN_THEME_ID || !tf?.backgroundUrl) {
    return (
      <div className="flex h-full w-full flex-col" style={{ background: '#fff4c7' }}>
        <div className="flex h-1/4 items-center justify-center text-[11px] font-bold uppercase text-white" style={{ background: theme.palette.tag }}>Ofertas</div>
        <div className="grid flex-1 grid-cols-2 gap-1 p-1.5">{[0, 1, 2, 3].map((i) => <div key={i} className="rounded-sm bg-white" />)}</div>
      </div>
    );
  }
  return <img src={tf.backgroundUrl} alt="" className="h-full w-full object-cover object-top" loading="lazy" />;
};

const VisualTab: React.FC<{
  themes: ArtTheme[]; theme: ArtTheme; format: FormatKey; content: CampaignContent;
  onTheme: (t: ArtTheme) => void; onContent: (patch: Partial<CampaignContent>) => void;
}> = ({ themes, theme, format, content, onTheme, onContent }) => {
  const occasions = useMemo(() => Array.from(new Set(themes.map((t) => t.occasion).filter(Boolean))) as string[], [themes]);
  const [occasion, setOccasion] = useState<string | null>(null);
  const shown = themes.filter((t) => !occasion || t.occasion === occasion);
  return (
    <div className="flex flex-col gap-4">
      {occasions.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por ocasião">
          {[null, ...occasions].map((o) => (
            <button key={o ?? 'todas'} type="button" onClick={() => setOccasion(o)} aria-pressed={occasion === o}
              className={`rounded-full px-3 py-1 text-sm font-medium transition ${FOCUS}`}
              style={occasion === o ? { background: 'var(--brand-600)', color: '#fff' } : { background: 'var(--surface-soft)', color: 'var(--text-primary)' }}>
              {o ?? 'Todas'}
            </button>
          ))}
        </div>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {shown.map((t) => {
          const active = t.id === theme.id;
          return (
            <li key={t.id}>
              <button type="button" onClick={() => onTheme(t)} aria-pressed={active}
                className={`group flex w-full flex-col overflow-hidden rounded-xl text-left transition ${FOCUS}`}
                style={{ border: `2px solid ${active ? 'var(--brand-600)' : 'var(--border-soft)'}` }}>
                <span className="relative block aspect-[4/5] overflow-hidden" style={{ background: 'var(--surface-soft)' }}>
                  <ThemeThumb theme={t} format={format} />
                  {t.sealUrl && <img src={t.sealUrl} alt="" className="absolute right-1 top-1 h-10 w-10 object-contain drop-shadow" loading="lazy" />}
                  {active && <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full" style={{ background: 'var(--brand-600)' }}><Check className="h-4 w-4 text-white" /></span>}
                </span>
                <span className="truncate px-2 py-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {theme.sealUrl && (
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
          <input type="checkbox" checked={!content.hideSeal} onChange={(e) => onContent({ hideSeal: !e.target.checked })} className="h-4 w-4 accent-[var(--brand-600)]" />
          Mostrar o selo do tema
        </label>
      )}
      {theme.id === BUILTIN_THEME_ID && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Título</span>
          <input className={INPUT} style={inputStyle} value={content.headline ?? 'Ofertas da semana'} maxLength={40}
            onChange={(e) => onContent({ headline: e.target.value })} />
        </label>
      )}
    </div>
  );
};

// ── Aba Marca ────────────────────────────────────────────────────────────

const BrandTab: React.FC<{ marketId: string; brand: ArtBrand; onBrand: (b: ArtBrand) => void }> = ({ marketId, brand, onBrand }) => {
  const [draft, setDraft] = useState(brand);
  const [status, setStatus] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  useEffect(() => { setDraft(brand); }, [brand]);

  const save = async (patch: Partial<ArtBrand>) => {
    try {
      onBrand(await artService.saveBrand(marketId, patch));
      setStatus('Salvo');
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setStatus(apiMessage(err, 'Não foi possível salvar.'));
    }
  };

  const field = (key: keyof ArtBrand, label: string, placeholder = '', max = 120) => (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
      <input className={INPUT} style={inputStyle} value={(draft[key] as string) ?? ''} placeholder={placeholder} maxLength={max}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        onBlur={() => (draft[key] ?? '') !== (brand[key] ?? '') && save({ [key]: draft[key] })} />
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => logoInput.current?.click()} className={`flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl ${FOCUS}`}
          style={{ border: '1px dashed var(--border-soft)', background: 'repeating-conic-gradient(#e7e5e4 0% 25%, #fafaf9 0% 50%) 50% / 14px 14px' }}
          aria-label={brand.logoUrl ? 'Trocar a logo' : 'Enviar a logo'}>
          {brand.logoUrl ? <img src={brand.logoUrl} alt="Logo do mercado" className="max-h-20 max-w-20 object-contain" /> : <Upload className="h-6 w-6" style={{ color: 'var(--text-muted)' }} />}
        </button>
        <div className="flex flex-col gap-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          <span>PNG com fundo transparente fica melhor sobre qualquer tema.</span>
          <div className="flex gap-3">
            <button type="button" onClick={() => logoInput.current?.click()} className="font-semibold" style={{ color: 'var(--brand-700)' }}>{brand.logoUrl ? 'Trocar' : 'Enviar logo'}</button>
            {brand.logoUrl && <button type="button" onClick={async () => onBrand(await artService.removeLogo(marketId))} className="font-semibold text-red-700">Remover</button>}
          </div>
        </div>
        <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try { onBrand(await artService.uploadLogo(marketId, file)); } catch (err) { setStatus(apiMessage(err, 'Não foi possível enviar a logo.')); }
          }} />
      </div>
      {field('displayName', 'Nome na arte', 'Mercado Bom Preço')}
      {field('addressLine', 'Endereço', 'Rua das Flores, 120 - Centro', 200)}
      <div className="grid grid-cols-2 gap-3">
        {field('whatsapp', 'WhatsApp', '(11) 98888-7777', 40)}
        {field('phone', 'Telefone', '(11) 3333-4444', 40)}
      </div>
      {field('instagram', 'Instagram', 'mercadobompreco', 60)}
      {field('footerNote', 'Aviso no rodapé', 'Imagens ilustrativas. Aceitamos todos os cartões.', 240)}
      {status && <p role="status" className="text-sm" style={{ color: status === 'Salvo' ? 'var(--brand-700)' : '#b91c1c' }}>{status}</p>}
    </div>
  );
};

// ── Diálogos ─────────────────────────────────────────────────────────────

const Dialog: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="dlg-title" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: 'var(--surface-base)' }}>
        <div className="flex items-center justify-between">
          <h2 id="dlg-title" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
          <button type="button" onClick={onClose} className={`rounded-lg p-2 hover:bg-[var(--surface-soft)] ${FOCUS}`} aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

// ── Editor ───────────────────────────────────────────────────────────────

const CampaignEditor: React.FC<{ marketId: string; id: string }> = ({ marketId, id }) => {
  const [campaign, setCampaign] = useState<ArtCampaign | null>(null);
  const [themes, setThemes] = useState<ArtTheme[]>([BUILTIN_THEME]);
  const [brand, setBrand] = useState<ArtBrand | null>(null);
  const [tab, setTab] = useState<'produtos' | 'visual' | 'marca'>('produtos');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'posters' | 'published' | null>(null);
  const [perPage, setPerPage] = useState<1 | 2 | 4>(1);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useRef<ArtCampaign | null>(null);
  const proxy = useCallback((url: string) => artService.proxiedImage(marketId, url), [marketId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([artService.campaign(marketId, id), artService.themes(marketId).catch(() => []), artService.brand(marketId)])
      .then(([c, t, b]) => {
        if (cancelled) return;
        setCampaign(c);
        latest.current = c;
        setThemes([...t, BUILTIN_THEME]);
        setBrand(b);
        if (!c.content.products?.length) setTab('produtos');
      })
      .catch((err) => setError(apiMessage(err, 'Não foi possível abrir o encarte.')));
    return () => { cancelled = true; };
  }, [marketId, id]);

  const persist = useCallback(async () => {
    timer.current = undefined;
    const c = latest.current;
    if (!c) return;
    setSaveState('saving');
    try {
      await artService.saveCampaign(marketId, c.id, {
        title: c.title, themeId: c.themeId === BUILTIN_THEME_ID ? null : c.themeId, content: c.content, validFrom: c.validFrom, validUntil: c.validUntil,
      });
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [marketId]);

  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); persist(); } }, [persist]);

  const update = (patch: Partial<ArtCampaign>) => {
    setCampaign((c) => {
      if (!c) return c;
      const next = { ...c, ...patch };
      latest.current = next;
      return next;
    });
    setSaveState('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(persist, SAVE_DELAY);
  };
  const updateContent = (patch: Partial<CampaignContent>) => campaign && update({ content: { ...campaign.content, ...patch } });

  const theme = themes.find((t) => t.id === campaign?.themeId) ?? BUILTIN_THEME;
  const formats = theme.id === BUILTIN_THEME_ID ? FORMAT_KEYS : readyFormats(theme);
  const format: FormatKey = campaign?.content.format && formats.includes(campaign.content.format) ? campaign.content.format : formats[0] ?? 'post';
  const items = campaign?.content.products ?? [];

  const sceneInput = (fmt: FormatKey, selected: string | null) => (campaign && brand ? {
    theme, format: fmt, items, brand, validFrom: campaign.validFrom, validUntil: campaign.validUntil,
    showSeal: !campaign.content.hideSeal, headline: campaign.content.headline, selectedKey: selected, proxy,
  } : null);
  const scene = useScene(sceneInput(format, selectedKey), [campaign, brand, theme, format, selectedKey]);

  const exportPng = async () => {
    const input = sceneInput(format, null);
    if (!input || !campaign) return;
    setBusy('png');
    try {
      const canvas = sceneCanvas(await buildScene(input));
      downloadBlob(await canvasBlob(canvas, 'image/png'), `${slugify(campaign.title)}-${format}.png`);
    } catch { setError('Não foi possível gerar a imagem. Tente de novo.'); } finally { setBusy(null); }
  };

  const exportPdf = async () => {
    const input = sceneInput('a4', null);
    if (!input || !campaign) return;
    setBusy('pdf');
    try {
      const canvas = sceneCanvas(await buildScene(input));
      downloadBlob(await jpegPagesToPdf([canvas]), `${slugify(campaign.title)}-a4.pdf`);
    } catch { setError('Não foi possível gerar o PDF. Tente de novo.'); } finally { setBusy(null); }
  };

  const exportPosters = async () => {
    if (!campaign || !brand) return;
    setBusy('posters');
    try {
      const seal = !campaign.content.hideSeal ? await loadImage(theme.sealUrl) : null;
      const validity = campaign.validUntil ? `Válido até ${brDate(campaign.validUntil)}` : '';
      const pages = posterPages(items, { palette: theme.palette, brandName: brand.displayName || brand.marketName || '', seal, validity, perPage });
      downloadBlob(await jpegPagesToPdf(pages), `${slugify(campaign.title)}-cartazes.pdf`);
      setDialog(null);
    } catch { setError('Não foi possível gerar os cartazes. Tente de novo.'); } finally { setBusy(null); }
  };

  const publish = async () => {
    if (!campaign) return;
    setBusy('publish');
    setError(null);
    try {
      if (timer.current) { clearTimeout(timer.current); await persist(); }
      const files: Array<{ format: string; blob: Blob }> = [];
      for (const fmt of formats) {
        const input = sceneInput(fmt, null);
        if (!input) continue;
        files.push({ format: fmt, blob: await canvasBlob(sceneCanvas(await buildScene(input)), 'image/jpeg', 0.9) });
      }
      const next = await artService.publish(marketId, campaign.id, files);
      setCampaign(next);
      latest.current = next;
      setDialog('published');
    } catch (err) {
      setError(apiMessage(err, 'Não foi possível publicar. Tente de novo.'));
    } finally {
      setBusy(null);
    }
  };

  if (error && !campaign) return <Panel><p className="text-sm text-red-700">{error}</p><Link to="/app/encartes" className="text-sm font-semibold" style={{ color: 'var(--brand-700)' }}>Voltar aos encartes</Link></Panel>;
  if (!campaign || !brand) return <div className="flex min-h-[300px] items-center justify-center" role="status"><Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--brand-600)' }} /><span className="sr-only">Abrindo o encarte</span></div>;

  const missingPrice = items.filter((i) => i.price == null).length;
  const publicUrl = campaign.publicSlug ? `${window.location.origin}/encarte/${campaign.publicSlug}` : null;
  const saveLabel = { idle: '', pending: 'Alterações não salvas', saving: 'Salvando…', saved: 'Salvo', error: 'Não salvou' }[saveState];
  const secondary = { borderColor: 'var(--border-soft)', color: 'var(--text-primary)' };

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/app/encartes" className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border ${FOCUS}`} style={secondary} aria-label="Voltar aos encartes">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <input className={`h-11 min-w-[12rem] flex-1 rounded-lg border border-transparent bg-transparent px-2 text-xl font-bold hover:border-[var(--border-soft)] focus:border-[var(--brand-600)] focus:outline-none`}
          style={{ color: 'var(--text-primary)' }} value={campaign.title} maxLength={160} aria-label="Nome do encarte"
          onChange={(e) => update({ title: e.target.value })} />
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          <label className="flex items-center gap-1.5">De
            <input type="date" className={`h-10 rounded-lg border px-2 text-sm outline-none ${FOCUS}`} style={inputStyle} value={campaign.validFrom ?? ''} onChange={(e) => update({ validFrom: e.target.value || null })} />
          </label>
          <label className="flex items-center gap-1.5">até
            <input type="date" className={`h-10 rounded-lg border px-2 text-sm outline-none ${FOCUS}`} style={inputStyle} value={campaign.validUntil ?? ''} min={campaign.validFrom ?? undefined} onChange={(e) => update({ validUntil: e.target.value || null })} />
          </label>
        </div>
      </div>
      <div className="-mt-2 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm" role="status" style={{ color: saveState === 'error' ? '#b91c1c' : 'var(--text-muted)' }}>
          {saveState === 'saved' && <CheckCircle2 className="mr-1 inline h-4 w-4" style={{ color: 'var(--brand-700)' }} aria-hidden="true" />}
          {saveLabel}
          {saveState === 'error' && <button type="button" onClick={persist} className="ml-2 font-semibold underline">Tentar de novo</button>}
          {campaign.status === 'PUBLISHED' && publicUrl && (
            <a href={publicUrl} target="_blank" rel="noreferrer" className="ml-3 inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--brand-700)' }}>
              Publicado <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </span>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportPng} disabled={!items.length || !!busy} className={BTN_SECONDARY} style={secondary}>
            {busy === 'png' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}PNG
          </button>
          {formats.includes('a4') && (
            <button type="button" onClick={exportPdf} disabled={!items.length || !!busy} className={BTN_SECONDARY} style={secondary}>
              {busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}PDF A4
            </button>
          )}
          <button type="button" onClick={() => setDialog('posters')} disabled={!items.length || !!busy} className={BTN_SECONDARY} style={secondary}>
            <Printer className="h-4 w-4" />Cartazes
          </button>
          <button type="button" onClick={publish} disabled={!items.length || !!busy} className={BTN_PRIMARY}>
            {busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {campaign.status === 'PUBLISHED' ? 'Atualizar publicação' : 'Publicar'}
          </button>
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[400px_minmax(0,1fr)]">
        {/* Painel lateral */}
        <Panel className="order-2 lg:order-1 lg:max-h-[calc(100vh-13rem)] lg:overflow-y-auto">
          <div role="tablist" aria-label="Etapas do encarte" className="grid grid-cols-3 gap-1 rounded-lg p-1" style={{ background: 'var(--surface-soft)' }}>
            {([['produtos', 'Produtos'], ['visual', 'Visual'], ['marca', 'Marca']] as const).map(([key, label]) => (
              <button key={key} role="tab" type="button" aria-selected={tab === key} onClick={() => setTab(key)}
                className={`rounded-md py-2 text-sm font-semibold transition ${FOCUS}`}
                style={tab === key ? { background: 'var(--surface-base)', color: 'var(--text-primary)', boxShadow: '0 1px 2px rgba(0,0,0,.08)' } : { color: 'var(--text-muted)' }}>
                {label}{key === 'produtos' && items.length ? ` (${items.length})` : ''}
              </button>
            ))}
          </div>
          {tab === 'produtos' && (
            <ProductsTab marketId={marketId} items={items} selectedKey={selectedKey} onSelect={setSelectedKey}
              onItems={(next) => updateContent({ products: next })} />
          )}
          {tab === 'visual' && (
            <VisualTab themes={themes} theme={theme} format={format} content={campaign.content}
              onTheme={(t) => update({ themeId: t.id })} onContent={updateContent} />
          )}
          {tab === 'marca' && <BrandTab marketId={marketId} brand={brand} onBrand={setBrand} />}
        </Panel>

        {/* Prévia */}
        <div className="order-1 flex flex-col gap-3 lg:order-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="tablist" aria-label="Formato" className="flex flex-wrap gap-1 rounded-lg p-1" style={{ background: 'var(--surface-soft)' }}>
              {formats.map((key) => (
                <button key={key} role="tab" type="button" aria-selected={format === key} onClick={() => updateContent({ format: key })}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${FOCUS}`} title={FORMATS[key].hint}
                  style={format === key ? { background: 'var(--surface-base)', color: 'var(--text-primary)', boxShadow: '0 1px 2px rgba(0,0,0,.08)' } : { color: 'var(--text-muted)' }}>
                  {FORMATS[key].label}
                </button>
              ))}
            </div>
            <span className="text-sm" style={{ color: missingPrice ? '#b45309' : 'var(--text-muted)' }}>
              {missingPrice ? `${missingPrice} sem preço (não aparecem com etiqueta)` : 'Toque num produto da arte para editar'}
            </span>
          </div>
          <div className="rounded-2xl p-3 sm:p-5" style={{ background: 'var(--surface-soft)' }}>
            {items.length ? (
              <ArtCanvas scene={scene} label={`Prévia do encarte ${campaign.title}`} maxHeight={760}
                onPick={(key) => { setSelectedKey(key); if (key) setTab('produtos'); }} />
            ) : (
              <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center">
                <Megaphone className="h-10 w-10" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                <p className="max-w-xs text-sm" style={{ color: 'var(--text-muted)' }}>Coloque produtos na lista ao lado e a arte se monta aqui, no tema escolhido.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {dialog === 'posters' && (
        <Dialog title="Cartazes de gôndola" onClose={() => setDialog(null)}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Um cartaz por produto com preço ({items.filter((i) => i.price != null).length}), nas cores do tema, em PDF para imprimir.
          </p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Cartazes por folha">
            {([1, 2, 4] as const).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={perPage === n} onClick={() => setPerPage(n)}
                className={`flex flex-col items-center gap-2 rounded-xl p-3 text-sm font-medium transition ${FOCUS}`}
                style={{ border: `2px solid ${perPage === n ? 'var(--brand-600)' : 'var(--border-soft)'}`, color: 'var(--text-primary)' }}>
                <span className={`grid h-16 w-12 gap-0.5 rounded-sm border p-0.5 ${n === 4 ? 'grid-cols-2' : 'grid-cols-1'}`} style={{ borderColor: 'var(--border-soft)' }}>
                  {Array.from({ length: n }).map((_, i) => <span key={i} className="rounded-[2px]" style={{ background: theme.palette.tag, opacity: 0.8 }} />)}
                </span>
                {n === 1 ? 'Folha inteira' : n === 2 ? 'Meia folha' : '4 por folha'}
              </button>
            ))}
          </div>
          <button type="button" onClick={exportPosters} disabled={!!busy} className={BTN_PRIMARY}>
            {busy === 'posters' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}Baixar PDF dos cartazes
          </button>
        </Dialog>
      )}

      {dialog === 'published' && publicUrl && (
        <Dialog title="Encarte publicado" onClose={() => setDialog(null)}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            As artes de {formats.map((f) => FORMATS[f].label).join(', ')} estão numa página de ofertas. Mande o link no WhatsApp ou ponha na bio.
          </p>
          <div className="flex items-center gap-2 rounded-lg p-2" style={{ background: 'var(--surface-soft)' }}>
            <span className="min-w-0 flex-1 truncate font-mono text-sm" style={{ color: 'var(--text-primary)' }}>{publicUrl}</span>
            <button type="button" onClick={() => navigator.clipboard?.writeText(publicUrl)} className={`${BTN_SECONDARY} h-9 px-3`} style={secondary}><Copy className="h-4 w-4" />Copiar</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(`${campaign.title} — confira as ofertas: ${publicUrl}`)}`} target="_blank" rel="noreferrer" className={BTN_PRIMARY}>
              <Send className="h-4 w-4" />Mandar no WhatsApp
            </a>
            <a href={publicUrl} target="_blank" rel="noreferrer" className={BTN_SECONDARY} style={secondary}><ExternalLink className="h-4 w-4" />Abrir a página</a>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {campaign.publishedImages.map((img) => (
              <a key={img.url} href={img.url} download className="overflow-hidden rounded-lg" style={{ border: '1px solid var(--border-soft)' }} title={`Baixar ${FORMATS[img.format as FormatKey]?.label ?? img.format}`}>
                <img src={img.url} alt={`Arte ${FORMATS[img.format as FormatKey]?.label ?? img.format}`} className="aspect-square w-full object-cover object-top" />
              </a>
            ))}
          </div>
        </Dialog>
      )}
    </div>
  );
};

// ── Lista ────────────────────────────────────────────────────────────────

const CampaignList: React.FC<{ marketId: string }> = ({ marketId }) => {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<ArtCampaign[] | null>(null);
  const [themes, setThemes] = useState<ArtTheme[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    artService.campaigns(marketId).then(setCampaigns).catch((err) => { setCampaigns([]); setError(apiMessage(err, 'Não foi possível carregar os encartes.')); });
  }, [marketId]);
  useEffect(() => { load(); artService.themes(marketId).then(setThemes).catch(() => {}); }, [load, marketId]);

  const create = async () => {
    setCreating(true);
    try {
      const c = await artService.createCampaign(marketId, {
        title: 'Ofertas da semana', themeId: themes[0]?.id ?? null, validFrom: isoToday(), validUntil: isoToday(6),
        content: { format: themes[0] ? readyFormats(themes[0])[0] ?? 'post' : 'post', products: [] },
      });
      navigate(`/app/encartes/${c.id}`);
    } catch (err) {
      setError(apiMessage(err, 'Não foi possível criar o encarte.'));
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Encartes e cartazes</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Monte a arte das ofertas em minutos, com os preços e os produtos que as vendas indicam.</p>
        </div>
        <button type="button" onClick={create} disabled={creating} className={BTN_PRIMARY}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Novo encarte
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {campaigns === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-2xl" style={{ background: 'var(--surface-soft)' }} />)}</div>
      ) : campaigns.length === 0 ? (
        <Panel>
          <div className="grid items-center gap-6 py-6 md:grid-cols-[1fr_1.2fr]">
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Seu primeiro encarte</h2>
              <ol className="flex flex-col gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                <li><strong style={{ color: 'var(--text-primary)' }}>1. O que ofertar.</strong> Aceite a sugestão das vendas ou busque os produtos.</li>
                <li><strong style={{ color: 'var(--text-primary)' }}>2. Como vai ficar.</strong> Escolha o tema; a arte se monta sozinha em story, post, A4 e TV.</li>
                <li><strong style={{ color: 'var(--text-primary)' }}>3. Divulgar.</strong> Baixe, imprima os cartazes ou publique o link para o WhatsApp.</li>
              </ol>
              <button type="button" onClick={create} disabled={creating} className={`${BTN_PRIMARY} self-start`}>Começar agora</button>
            </div>
            <div className="hidden justify-center md:flex"><Sparkles className="h-24 w-24" style={{ color: 'var(--brand-600)', opacity: 0.25 }} aria-hidden="true" /></div>
          </div>
        </Panel>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {campaigns.map((c) => {
            const cover = c.publishedImages.find((i) => i.format === 'post') ?? c.publishedImages[0];
            const count = c.content.products?.length ?? 0;
            return (
              <li key={c.id} className="flex flex-col overflow-hidden rounded-2xl" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                <Link to={`/app/encartes/${c.id}`} className={`relative block aspect-[4/5] overflow-hidden ${FOCUS}`} style={{ background: 'var(--surface-soft)' }}>
                  {cover ? <img src={cover.url} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
                    : <span className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>Rascunho</span>}
                  <span className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={c.status === 'PUBLISHED' ? { background: 'var(--brand-600)', color: '#fff' } : { background: 'rgba(255,255,255,.92)', color: '#44403c' }}>
                    {c.status === 'PUBLISHED' ? 'Publicado' : 'Rascunho'}
                  </span>
                </Link>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <Link to={`/app/encartes/${c.id}`} className="truncate font-semibold hover:underline" style={{ color: 'var(--text-primary)' }}>{c.title}</Link>
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {count} {count === 1 ? 'produto' : 'produtos'}{c.validUntil ? `, até ${brDate(c.validUntil)}` : ''}
                  </span>
                  <div className="mt-auto flex gap-3 pt-2 text-sm font-semibold">
                    <button type="button" style={{ color: 'var(--brand-700)' }} onClick={async () => { const d = await artService.duplicateCampaign(marketId, c.id); navigate(`/app/encartes/${d.id}`); }}>Duplicar</button>
                    {c.publicSlug && c.status === 'PUBLISHED' && <a href={`/encarte/${c.publicSlug}`} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-700)' }}>Ver página</a>}
                    <button type="button" className="ml-auto text-red-700" onClick={async () => {
                      if (!window.confirm(`Excluir "${c.title}"? A página publicada sai do ar.`)) return;
                      await artService.deleteCampaign(marketId, c.id);
                      load();
                    }}>Excluir</button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const ArtStudio: React.FC = () => {
  const { marketId } = useAuth();
  const { campaignId } = useParams();
  return (
    <Layout>
      {!marketId ? null : campaignId ? <CampaignEditor key={campaignId} marketId={marketId} id={campaignId} /> : <CampaignList marketId={marketId} />}
    </Layout>
  );
};

export default ArtStudio;
