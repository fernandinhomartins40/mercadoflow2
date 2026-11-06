import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Copy, Layers, Minus, Plus, ScanBarcode, Search, Tag, Trash2 } from 'lucide-react';
import ShelfScan from './ShelfScan';
import Modal from '../../../components/common/Modal';
import SegmentedTabs from '../../../components/ui/SegmentedTabs';
import ProductImage from '../../../components/product/ProductImage';
import { confirmDialog } from '../../../components/common/Dialogs';
import { storeMapService } from '../../../services/storeMap.service';
import type {
  Fixture, LocatedProduct, Shelf, ShelfKind, ShelfModule, ShelfProduct, ShelfSlot,
} from '../../../types/storeMap.types';
import { DEPARTMENTS, DEPT_BY_KEY, deptLabel, fixtureName } from '../model';
import {
  MIN_SHARE, SHELF_KINDS, addModule, addSlot, applyLayoutToSide, copySide, defaultSides, equalize, fixtureLengthCm,
  mapModule, mapShelf, moveDivider, moveSlot, removeModule, setShare, setShelfCount, sideKeys, splitBy, splitByFacings,
  usedShare,
} from '../shelves';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';
const BTN = `inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition hover:bg-[var(--surface-soft)] disabled:pointer-events-none disabled:opacity-40 ${FOCUS}`;
const BOX = { border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' };
const pct = (v: number) => `${Math.round(v * 100)}%`;

interface Props {
  open: boolean;
  onClose: () => void;
  fixture: Fixture;
  marketId: string;
  products: Record<string, ShelfProduct>;
  /** Produto escolhido na busca: guarda nome e foto para mostrar na prateleira. */
  onProduct: (id: string, p: ShelfProduct) => void;
  /** Grava um passo no histórico da planta. */
  onChange: (next: Fixture) => void;
}

/** Nome e cor de um espaço da prateleira. */
function slotInfo(sl: ShelfSlot, products: Record<string, ShelfProduct>) {
  if (sl.productId) {
    const p = products[sl.productId];
    return { name: p?.name ?? 'Produto', image: p?.imageUrl ?? null, color: DEPT_BY_KEY[sl.department ?? '']?.color ?? '#64748b' };
  }
  if (sl.department) return { name: deptLabel(sl.department), image: null, color: DEPT_BY_KEY[sl.department]?.color ?? '#64748b' };
  return { name: sl.label ?? '', image: null, color: '#64748b' };
}

/** Campo numérico que grava ao sair ou com Enter. */
const NumberField: React.FC<{ id: string; label: string; value: number; min: number; max: number; suffix: string; onCommit: (v: number) => void; className?: string }> = ({
  id, label, value, min, max, suffix, onCommit, className,
}) => {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = () => {
    const v = Math.round(Number(text.replace(',', '.')));
    if (!Number.isFinite(v)) { setText(String(value)); return; }
    const next = Math.max(min, Math.min(max, v));
    setText(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className ?? ''}`}>
      <label htmlFor={id} className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <div className="relative">
        <input id={id} inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
          className={`h-10 w-full rounded-lg pl-2.5 pr-9 text-sm ${FOCUS}`} style={{ ...BOX, fontVariantNumeric: 'tabular-nums' }} />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-muted)' }}>{suffix}</span>
      </div>
    </div>
  );
};

/** Faixa de uma prateleira: cada espaço com a largura que ocupa; o resto, listrado (livre). */
const ShelfStrip: React.FC<{ slots: ShelfSlot[]; products: Record<string, ShelfProduct>; tall?: boolean }> = ({ slots, products, tall }) => {
  const free = Math.max(0, 1 - usedShare(slots));
  return (
    <>
      {slots.map((sl, i) => {
        const info = slotInfo(sl, products);
        return (
          <span key={i} className="relative flex h-full min-w-0 items-center justify-center overflow-hidden"
            style={{ width: `${sl.share * 100}%`, background: `${info.color}22`, borderRight: '1px solid var(--surface-base)' }}
            title={`${info.name} · ${pct(sl.share)}`}>
            {info.image
              ? <ProductImage src={info.image} alt="" className={`${tall ? 'h-12' : 'h-7'} max-w-full object-contain`} />
              : <span className={`truncate px-1 ${tall ? 'text-xs' : 'text-[10px]'} font-semibold`} style={{ color: info.color }}>{info.name}</span>}
            {tall && <span className="absolute bottom-0.5 right-1 text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>{pct(sl.share)}</span>}
          </span>
        );
      })}
      {free > 0.005 && (
        <span className="flex h-full items-center justify-center text-[10px]" style={{
          width: `${free * 100}%`, color: 'var(--text-muted)',
          background: 'repeating-linear-gradient(135deg, transparent 0 6px, var(--surface-soft) 6px 12px)',
        }}>{tall || free > 0.25 ? `livre ${pct(free)}` : ''}</span>
      )}
    </>
  );
};

/** Busca de produto vendido, setor inteiro ou nome livre para colocar na prateleira. */
const AddItem: React.FC<{ marketId: string; onAdd: (item: Omit<ShelfSlot, 'share'>, product?: LocatedProduct) => void }> = ({ marketId, onAdd }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<LocatedProduct[] | null>(null);
  const [mode, setMode] = useState<'produto' | 'setor' | 'nome'>('produto');

  useEffect(() => {
    if (mode !== 'produto' || q.trim().length < 2) { setResults(null); return undefined; }
    const t = setTimeout(() => { storeMapService.locate(marketId, q.trim()).then(setResults).catch(() => setResults([])); }, 300);
    return () => clearTimeout(t);
  }, [q, marketId, mode]);

  return (
    <div className="flex flex-col gap-2 rounded-xl p-3" style={{ background: 'var(--surface-soft)' }}>
      <div className="flex flex-wrap items-center gap-1 text-sm">
        <span className="mr-1 font-semibold" style={{ color: 'var(--text-primary)' }}>Colocar:</span>
        {([['produto', 'Produto'], ['setor', 'Setor inteiro'], ['nome', 'Outro nome']] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={mode === k} onClick={() => { setMode(k); setQ(''); }}
            className={`min-h-[36px] rounded-full px-3 ${FOCUS}`}
            style={mode === k ? { background: 'var(--brand-700)', color: '#fff' } : { background: 'var(--surface-base)', color: 'var(--text-primary)', border: '1px solid var(--border-soft)' }}>
            {l}
          </button>
        ))}
      </div>

      {mode === 'setor' ? (
        <div className="flex flex-wrap gap-1.5">
          {DEPARTMENTS.filter((d) => d.key !== 'OUTROS').map((d) => (
            <button key={d.key} type="button" onClick={() => onAdd({ department: d.key })}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-sm ${FOCUS}`} style={{ ...BOX, border: '1px solid var(--border-soft)' }}>
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} /> {d.label}
            </button>
          ))}
        </div>
      ) : (
        <form className="relative" onSubmit={(e) => { e.preventDefault(); if (mode === 'nome' && q.trim()) { onAdd({ label: q.trim().slice(0, 40) }); setQ(''); } }}>
          <label htmlFor="shelf-add" className="sr-only">{mode === 'produto' ? 'Buscar produto' : 'Nome do item'}</label>
          {mode === 'produto'
            ? <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
            : <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />}
          <input id="shelf-add" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
            placeholder={mode === 'produto' ? 'Digite o produto (ex.: achocolatado)' : 'Ex.: Promoção da semana — Enter para colocar'}
            className={`h-11 w-full rounded-lg pl-9 pr-3 text-sm ${FOCUS}`} style={BOX} />
          {mode === 'produto' && results && (
            <ul className="mt-1 max-h-64 overflow-y-auto rounded-lg p-1" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}>
              {results.length === 0 ? (
                <li className="px-3 py-2 text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum produto vendido com esse nome nos últimos 90 dias.</li>
              ) : results.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => { onAdd({ productId: p.id, department: p.department }, p); setQ(''); }}
                    className={`flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-[var(--surface-soft)] ${FOCUS}`}>
                    <span className="h-8 w-8 shrink-0 overflow-hidden rounded" style={{ background: 'var(--surface-soft)' }}><ProductImage src={p.imageUrl} alt="" className="h-full w-full object-contain" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                      <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{p.departmentLabel}{p.places?.length ? ` · já está em ${p.places.length} lugar${p.places.length > 1 ? 'es' : ''}` : ''}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}
    </div>
  );
};

/** Prateleira selecionada em tamanho grande: divisórias arrastáveis e a lista de espaços. */
const ShelfDetail: React.FC<{
  shelf: Shelf; index: number; total: number; widthCm: number; marketId: string;
  products: Record<string, ShelfProduct>;
  onSlots: (slots: ShelfSlot[], dept?: string) => void;
  onKind: (k: ShelfKind) => void;
  onProduct: (id: string, p: ShelfProduct) => void;
  /** Abre o bipar nesta prateleira (some enquanto já está bipando). */
  onScan?: () => void;
}> = ({ shelf, index, total, widthCm, marketId, products, onSlots, onKind, onProduct, onScan }) => {
  const bar = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<ShelfSlot[] | null>(null);
  const drag = useRef<{ i: number; x: number; base: ShelfSlot[] } | null>(null);
  const slots = draft ?? shelf.slots;
  const free = Math.max(0, 1 - usedShare(slots));
  const allFacings = slots.length > 1 && slots.every((s) => s.facings);

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !bar.current) return;
    setDraft(moveDivider(d.base, d.i, (e.clientX - d.x) / bar.current.clientWidth));
  };
  const onUp = () => {
    if (drag.current && draft) onSlots(draft);
    drag.current = null;
    setDraft(null);
  };

  let edge = 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {index + 1}ª prateleira de cima <span className="font-normal" style={{ color: 'var(--text-muted)' }}>de {total} · {widthCm} cm</span>
        </p>
        <label className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
          Tipo
          <select value={shelf.kind} onChange={(e) => onKind(e.target.value as ShelfKind)} className={`h-9 rounded-lg px-2 text-sm font-normal ${FOCUS}`} style={BOX}>
            {(Object.keys(SHELF_KINDS) as ShelfKind[]).map((k) => <option key={k} value={k}>{SHELF_KINDS[k]}</option>)}
          </select>
        </label>
      </div>

      <div ref={bar} className="relative flex h-20 w-full touch-none overflow-hidden rounded-lg" style={{ border: '1px solid var(--border-strong)' }}
        onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {slots.length === 0
          ? <span className="flex w-full items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>Prateleira vazia: coloque um produto, um setor ou um nome abaixo.</span>
          : <ShelfStrip slots={slots} products={products} tall />}
        {slots.slice(0, -1).map((sl, i) => {
          edge += sl.share;
          return (
            <button key={i} type="button" aria-label={`Divisória entre o ${i + 1}º e o ${i + 2}º espaço: setas mudam 5%`}
              className={`absolute inset-y-0 z-10 w-5 -translate-x-1/2 cursor-ew-resize ${FOCUS}`} style={{ left: `${edge * 100}%` }}
              onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { i, x: e.clientX, base: slots }; }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); onSlots(moveDivider(slots, i, e.key === 'ArrowRight' ? 0.05 : -0.05)); }
              }}>
              <span aria-hidden="true" className="mx-auto block h-full w-1 rounded-full" style={{ background: 'var(--brand-700)' }} />
            </button>
          );
        })}
      </div>

      {slots.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="mr-1 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Dividir</span>
          <button type="button" className={BTN} style={BOX} onClick={() => onSlots(equalize(slots))}>Igual</button>
          {slots.length === 2 && ([[50, 50], [60, 40], [70, 30], [80, 20]] as const).map((w) => (
            <button key={w.join()} type="button" className={BTN} style={BOX} onClick={() => onSlots(splitBy(slots, [...w]))}>{w[0]}/{w[1]}</button>
          ))}
          <button type="button" className={BTN} style={BOX} disabled={!allFacings} onClick={() => onSlots(splitByFacings(slots))}
            title={allFacings ? 'Proporção pelas frentes de cada um' : 'Preencha as frentes de todos os itens'}>Pelas frentes</button>
        </div>
      )}

      {slots.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {slots.map((sl, i) => {
            const info = slotInfo(sl, products);
            return (
              <li key={`${i}-${sl.productId ?? sl.department ?? sl.label}`} className="flex flex-wrap items-center gap-2 rounded-lg p-2" style={{ border: '1px solid var(--border-soft)' }}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded" style={{ background: `${info.color}22` }}>
                  {info.image ? <ProductImage src={info.image} alt="" className="h-full w-full object-contain" /> : <Layers className="h-4 w-4" style={{ color: info.color }} aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{info.name}</span>
                  <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                    {sl.productId ? 'Produto' : sl.department ? 'Setor inteiro' : 'Item'} · cerca de {Math.round(sl.share * widthCm)} cm
                  </span>
                </span>
                <NumberField id={`share-${shelf.id}-${i}`} label="Espaço" suffix="%" className="w-24" value={Math.round(sl.share * 100)} min={Math.round(MIN_SHARE * 100)} max={100}
                  onCommit={(v) => onSlots(setShare(slots, i, v / 100))} />
                <NumberField id={`facings-${shelf.id}-${i}`} label="Frentes" suffix="fr" className="w-24" value={sl.facings ?? 0} min={0} max={99}
                  onCommit={(v) => onSlots(slots.map((s, j) => (j === i ? { ...s, facings: v || undefined } : s)))} />
                <span className="flex gap-0.5 self-end">
                  <button type="button" className={`${BTN} w-10 px-0`} disabled={i === 0} aria-label="Mover para a esquerda" onClick={() => onSlots(moveSlot(slots, i, -1))}><ArrowLeft className="h-4 w-4" aria-hidden="true" /></button>
                  <button type="button" className={`${BTN} w-10 px-0`} disabled={i === slots.length - 1} aria-label="Mover para a direita" onClick={() => onSlots(moveSlot(slots, i, 1))}><ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
                  <button type="button" className={`${BTN} w-10 px-0`} style={{ color: '#b91c1c' }} aria-label={`Tirar ${info.name} da prateleira`} onClick={() => onSlots(slots.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {free > 0.005 && slots.length > 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Espaço livre: {pct(free)} (cerca de {Math.round(free * widthCm)} cm).</p>}

      {onScan && (
        <button type="button" onClick={onScan} className={`${BTN} min-h-[44px] text-white`} style={{ background: 'var(--brand-700)' }}>
          <ScanBarcode className="h-5 w-5" aria-hidden="true" /> Bipar os produtos desta prateleira
        </button>
      )}

      <AddItem marketId={marketId} onAdd={(item, p) => {
        if (p) onProduct(p.id, { name: p.name, imageUrl: p.imageUrl });
        onSlots(addSlot(slots, item), item.department);
      }} />
    </div>
  );
};

/**
 * Montar as prateleiras de um móvel: cada lado com seus módulos (largura
 * própria), cada módulo com quantas prateleiras tiver e cada prateleira
 * dividida entre produtos, setores ou nomes, na proporção que o mercadista quiser.
 */
const ShelfEditor: React.FC<Props> = ({ open, onClose, fixture, marketId, products, onProduct, onChange }) => {
  const keys = sideKeys(fixture.type);
  const [sideKey, setSideKey] = useState<'A' | 'B'>('A');
  const [sel, setSel] = useState<{ moduleId: string; shelfId: string | null } | null>(null);
  const [scanning, setScanning] = useState(false);
  const side = fixture.sides?.find((s) => s.key === sideKey);
  const mod = side?.modules.find((m) => m.id === sel?.moduleId) ?? side?.modules[0];
  const shelfIndex = mod?.shelves.findIndex((s) => s.id === sel?.shelfId) ?? -1;
  const shelf = shelfIndex >= 0 ? mod!.shelves[shelfIndex] : null;
  const totalCm = side?.modules.reduce((s, m) => s + m.widthCm, 0) ?? 0;
  const lengthCm = fixtureLengthCm(fixture);

  const commitModule = (fn: (m: ShelfModule) => ShelfModule) => mod && onChange(mapModule(fixture, sideKey, mod.id, fn));
  const commitShelf = (fn: (s: Shelf) => Shelf, dept?: string) => {
    if (!mod || !shelf) return;
    const next = mapShelf(fixture, sideKey, mod.id, shelf.id, fn);
    // Produto ou setor colocado aqui marca o setor no móvel, para o calor de vendas e o "onde fica?".
    onChange(dept && !next.departments.includes(dept) ? { ...next, departments: [...next.departments, dept] } : next);
  };

  /** Produto bipado entra na prateleira selecionada, com o setor dele no móvel. */
  const placeScanned = (p: LocatedProduct) => {
    onProduct(p.id, { name: p.name, imageUrl: p.imageUrl });
    commitShelf((s) => ({ ...s, slots: addSlot(s.slots, { productId: p.id, department: p.department }) }), p.department);
  };

  /** Prateleira de baixo; na última do módulo, a de cima do próximo módulo. */
  const nextShelf = () => {
    if (!side || !mod) return false;
    const mi = side.modules.indexOf(mod);
    const target = shelfIndex + 1 < mod.shelves.length
      ? { moduleId: mod.id, shelfId: mod.shelves[shelfIndex + 1].id }
      : side.modules[mi + 1] ? { moduleId: side.modules[mi + 1].id, shelfId: side.modules[mi + 1].shelves[0]?.id ?? null } : null;
    if (!target?.shelfId) return false;
    setSel(target);
    return true;
  };

  const startScan = (moduleId: string, shelfId: string) => { setSel({ moduleId, shelfId }); setScanning(true); };

  return (
    <Modal open={open} onClose={onClose} size="xl" titleId="shelf-editor-title"
      kicker="Montar prateleiras"
      title={<h3 id="shelf-editor-title" className="text-base font-semibold sm:text-lg" style={{ color: 'var(--text-primary)' }}>{fixtureName(fixture)}</h3>}
      headerActions={<button type="button" onClick={onClose} className={`${BTN} text-white`} style={{ background: 'var(--brand-700)' }}>Pronto</button>}>
      {!fixture.sides?.length ? (
        <div className="flex flex-col items-start gap-3 py-4">
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
            Comece pelo padrão e mude só o que for diferente na sua loja: {Math.max(1, Math.round(lengthCm / 100))} módulo(s) de cerca de 1 m
            {keys.length > 1 ? ', nos dois lados' : ''}, com prateleiras do jeito mais comum para {fixtureName(fixture).toLowerCase()}.
          </p>
          <button type="button" className={`${BTN} text-white`} style={{ background: 'var(--brand-700)' }}
            onClick={() => onChange({ ...fixture, sides: defaultSides(fixture) })}>
            <Layers className="h-4 w-4" aria-hidden="true" /> Começar com o padrão
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {keys.length > 1 ? (
              <SegmentedTabs<'A' | 'B'> fit label="Lado do móvel" value={sideKey}
                onChange={(k) => { setSideKey(k); setSel(null); setScanning(false); }}
                tabs={keys.map((k) => ({ key: k, label: `Lado ${k}` }))} />
            ) : <span />}
            {keys.length > 1 && (
              <button type="button" className={BTN} style={BOX} onClick={async () => {
                const to = sideKey === 'A' ? 'B' : 'A';
                const target = fixture.sides?.find((s) => s.key === to);
                const filled = target?.modules.some((m) => m.shelves.some((sh) => sh.slots.length));
                if (!filled || await confirmDialog(`O lado ${to} já tem produtos. Trocar tudo pelo lado ${sideKey}?`)) onChange(copySide(fixture, sideKey, to));
              }}>
                <Copy className="h-4 w-4" aria-hidden="true" /> Copiar para o lado {sideKey === 'A' ? 'B' : 'A'}
              </button>
            )}
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max items-stretch gap-1.5">
              {side?.modules.map((m, mi) => (
                <div key={m.id} className="flex flex-col gap-1 rounded-lg p-1.5"
                  style={{ width: Math.max(120, Math.min(280, m.widthCm * 1.5)), background: m.id === mod?.id ? 'var(--surface-soft)' : 'transparent', border: `1px solid ${m.id === mod?.id ? 'var(--brand-700)' : 'var(--border-soft)'}` }}>
                  <button type="button" onClick={() => setSel({ moduleId: m.id, shelfId: null })} aria-pressed={m.id === mod?.id && !shelf}
                    className={`rounded px-1 text-left text-xs font-semibold ${FOCUS}`} style={{ color: 'var(--text-primary)' }}>
                    Módulo {mi + 1} <span className="font-normal" style={{ color: 'var(--text-muted)' }}>· {m.widthCm} cm</span>
                  </button>
                  {m.shelves.map((sh, si) => (
                    <button key={sh.id} type="button" onClick={() => setSel({ moduleId: m.id, shelfId: sh.id })}
                      aria-label={`Módulo ${mi + 1}, ${si + 1}ª prateleira de cima: ${sh.slots.length ? `${sh.slots.length} item(ns), ${pct(usedShare(sh.slots))} ocupado` : 'vazia'}`}
                      aria-pressed={sh.id === shelf?.id}
                      className={`flex h-10 w-full overflow-hidden rounded ${FOCUS}`}
                      style={{ border: sh.id === shelf?.id ? '2px solid var(--brand-700)' : '1px solid var(--border-strong)', background: 'var(--surface-base)' }}>
                      <ShelfStrip slots={sh.slots} products={products} />
                    </button>
                  ))}
                </div>
              ))}
              <button type="button" onClick={() => onChange(addModule(fixture, sideKey))}
                className={`flex w-24 flex-col items-center justify-center gap-1 rounded-lg text-sm font-medium ${FOCUS}`}
                style={{ border: '1px dashed var(--border-strong)', color: 'var(--text-muted)' }}>
                <Plus className="h-5 w-5" aria-hidden="true" /> Módulo
              </button>
            </div>
          </div>
          <p className="text-xs" style={{ color: Math.abs(totalCm - lengthCm) > 10 ? '#b45309' : 'var(--text-muted)' }}>
            Os módulos somam {(totalCm / 100).toLocaleString('pt-BR')} m; o móvel tem {(lengthCm / 100).toLocaleString('pt-BR')} m na planta.
            {Math.abs(totalCm - lengthCm) > 10 ? ' Confira a largura dos módulos ou o tamanho do móvel.' : ''}
          </p>

          {mod && (
            <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
              <section className="flex flex-col gap-3 rounded-xl p-3" style={{ border: '1px solid var(--border-soft)' }} aria-label="Módulo selecionado">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Módulo {(side?.modules.indexOf(mod) ?? 0) + 1}</p>
                <NumberField id={`mod-w-${mod.id}`} label="Largura" suffix="cm" value={mod.widthCm} min={20} max={400}
                  onCommit={(widthCm) => commitModule((m) => ({ ...m, widthCm }))} />
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Prateleiras</span>
                  <div className="flex items-center gap-2">
                    <button type="button" className={`${BTN} w-10 px-0`} style={BOX} disabled={mod.shelves.length <= 1} aria-label="Uma prateleira a menos"
                      onClick={async () => {
                        const last = mod.shelves[mod.shelves.length - 1];
                        if (!last.slots.length || await confirmDialog('A prateleira de baixo tem produtos. Tirar mesmo assim?')) commitModule((m) => setShelfCount(m, m.shelves.length - 1));
                      }}><Minus className="h-4 w-4" aria-hidden="true" /></button>
                    <span className="min-w-8 text-center text-base font-semibold" style={{ color: 'var(--text-primary)' }} aria-live="polite">{mod.shelves.length}</span>
                    <button type="button" className={`${BTN} w-10 px-0`} style={BOX} disabled={mod.shelves.length >= 12} aria-label="Uma prateleira a mais"
                      onClick={() => commitModule((m) => setShelfCount(m, m.shelves.length + 1))}><Plus className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Entram e saem por baixo.</p>
                </div>
                <button type="button" className={BTN} style={BOX} disabled={(side?.modules.length ?? 0) < 2}
                  onClick={() => onChange(applyLayoutToSide(fixture, sideKey, mod.id))}>
                  Aplicar a todos os módulos
                </button>
                <p className="-mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>Copia largura e prateleiras; os produtos ficam onde estão.</p>
                <button type="button" className={BTN} style={{ color: '#b91c1c' }} disabled={(side?.modules.length ?? 0) < 2}
                  onClick={async () => {
                    const filled = mod.shelves.some((sh) => sh.slots.length);
                    if (!filled || await confirmDialog('Este módulo tem produtos. Remover mesmo assim?')) { onChange(removeModule(fixture, sideKey, mod.id)); setSel(null); }
                  }}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Remover módulo
                </button>
              </section>

              <section className="flex min-w-0 flex-col gap-3 rounded-xl p-3" style={{ border: '1px solid var(--border-soft)' }} aria-label="Prateleira selecionada">
                {shelf && scanning && (
                  <ShelfScan marketId={marketId} where={`módulo ${(side?.modules.indexOf(mod) ?? 0) + 1}, ${shelfIndex + 1}ª prateleira de cima`}
                    onFound={placeScanned} onNext={nextShelf} onClose={() => setScanning(false)} />
                )}
                {shelf ? (
                  <ShelfDetail onScan={scanning ? undefined : () => setScanning(true)} key={shelf.id} shelf={shelf} index={shelfIndex} total={mod.shelves.length} widthCm={mod.widthCm}
                    marketId={marketId} products={products} onProduct={onProduct}
                    onSlots={(slots, dept) => commitShelf((s) => ({ ...s, slots }), dept)}
                    onKind={(kind) => commitShelf((s) => ({ ...s, kind }))} />
                ) : (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Toque numa prateleira acima para dizer o que tem nela e quanto espaço cada item ocupa.</p>
                    {mod.shelves[0] && (
                      <button type="button" onClick={() => startScan(mod.id, mod.shelves[0].id)} className={`${BTN} min-h-[44px] text-white`} style={{ background: 'var(--brand-700)' }}>
                        <ScanBarcode className="h-5 w-5" aria-hidden="true" /> Bipar a partir da prateleira de cima
                      </button>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default ShelfEditor;
