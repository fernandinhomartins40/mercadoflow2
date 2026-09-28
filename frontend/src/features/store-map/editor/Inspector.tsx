import React, { useEffect, useState } from 'react';
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter,
  AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter, Copy, RotateCw, Scaling, Trash2, X,
} from 'lucide-react';
import type { DepartmentsReport, Fixture, FixtureType, StorePlan } from '../../../types/storeMap.types';
import { formatMoney } from '../../../utils/formatters';
import { DEPARTMENTS, DEPT_BY_KEY, FIXTURES, fixtureName } from '../model';
import { Align, align, distribute, duplicate, matchSize, patch, remove, rotate } from './actions';
import { clamp, round2 } from './geometry';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';
const TOOL_BTN = `inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition hover:bg-[var(--surface-soft)] disabled:opacity-40 ${FOCUS}`;

interface Props {
  plan: StorePlan;
  ids: string[];
  report: DepartmentsReport | null;
  /** Aplica e grava um passo no histórico. */
  apply: (next: StorePlan) => void;
  /** Mostra sem gravar (digitação do nome); `settle` fecha o passo. */
  preview: (next: StorePlan) => void;
  settle: () => void;
  onSelect: (ids: string[]) => void;
}

const Label: React.FC<{ children: React.ReactNode; htmlFor?: string }> = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{children}</label>
);

/** Medida em metros: aceita vírgula, grava ao sair do campo ou com Enter. */
export const MeterField: React.FC<{ id: string; label: string; value: number; min: number; max: number; onCommit: (v: number) => void }> = ({
  id, label, value, min, max, onCommit,
}) => {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const [text, setText] = useState(fmt(value));
  useEffect(() => { setText(fmt(value)); }, [value]);
  const commit = () => {
    const v = Number(text.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(v)) { setText(fmt(value)); return; }
    const next = round2(clamp(v, min, max));
    setText(fmt(next));
    if (next !== value) onCommit(next);
  };
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const step = e.shiftKey ? 1 : 0.25;
              onCommit(round2(clamp(value + (e.key === 'ArrowUp' ? step : -step), min, max)));
            }
          }}
          className={`h-10 w-full rounded-lg pl-2.5 pr-7 text-sm ${FOCUS}`}
          style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-muted)' }}>m</span>
      </div>
    </div>
  );
};

const Swatch: React.FC<{ type: FixtureType; size?: number }> = ({ type, size = 16 }) => {
  const m = FIXTURES[type];
  return <span aria-hidden="true" className="shrink-0 rounded" style={{ width: size, height: size, background: m.fill, border: `1.5px solid ${m.stroke}` }} />;
};

/** O que está selecionado: o que é, o que tem nele, onde está e quanto mede. */
const Inspector: React.FC<Props> = ({ plan, ids, report, apply, preview, settle, onSelect }) => {
  const sel = plan.fixtures.filter((f) => ids.includes(f.id));
  if (!sel.length) return null;
  const actions = (
    <div className="flex flex-wrap gap-1 border-t pt-3" style={{ borderColor: 'var(--border-soft)', color: 'var(--text-primary)' }}>
      <button type="button" className={TOOL_BTN} onClick={() => apply(rotate(plan, ids))} title="Girar 90° (R)">
        <RotateCw className="h-4 w-4" aria-hidden="true" /> Girar
      </button>
      <button type="button" className={TOOL_BTN} title="Duplicar (Ctrl+D)"
        onClick={() => { const r = duplicate(plan, ids); apply(r.plan); onSelect(r.ids); }}>
        <Copy className="h-4 w-4" aria-hidden="true" /> Duplicar
      </button>
      <button type="button" className={`${TOOL_BTN} ml-auto`} style={{ color: '#b91c1c' }} title="Remover (Delete)"
        aria-label={sel.length === 1 ? `Remover ${fixtureName(sel[0])}` : `Remover ${sel.length} móveis`}
        onClick={() => { apply(remove(plan, ids)); onSelect([]); }}>
        <Trash2 className="h-4 w-4" aria-hidden="true" /> Remover
      </button>
    </div>
  );

  if (sel.length > 1) {
    const alignBtns: Array<[Align, React.ElementType, string]> = [
      ['left', AlignStartVertical, 'Alinhar à esquerda'], ['hcenter', AlignCenterVertical, 'Centralizar na horizontal'],
      ['right', AlignEndVertical, 'Alinhar à direita'], ['top', AlignStartHorizontal, 'Alinhar em cima'],
      ['vcenter', AlignCenterHorizontal, 'Centralizar na vertical'], ['bottom', AlignEndHorizontal, 'Alinhar embaixo'],
    ];
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{sel.length} móveis selecionados</p>
          <button type="button" onClick={() => onSelect([])} aria-label="Limpar seleção" className={`${TOOL_BTN} w-10 px-0`} style={{ color: 'var(--text-muted)' }}>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Alinhar</Label>
          <div className="flex flex-wrap gap-1 rounded-xl p-1" style={{ background: 'var(--surface-soft)', color: 'var(--text-primary)' }}>
            {alignBtns.map(([how, Icon, title]) => (
              <button key={how} type="button" className={`${TOOL_BTN} w-10 px-0`} aria-label={title} title={title} onClick={() => apply(align(plan, ids, how))}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Espaçar e igualar</Label>
          <div className="flex flex-wrap gap-1" style={{ color: 'var(--text-primary)' }}>
            <button type="button" className={TOOL_BTN} disabled={sel.length < 3} onClick={() => apply(distribute(plan, ids, 'x'))} title="Mesmo espaço na horizontal">
              <AlignHorizontalDistributeCenter className="h-4 w-4" aria-hidden="true" /> Lado a lado
            </button>
            <button type="button" className={TOOL_BTN} disabled={sel.length < 3} onClick={() => apply(distribute(plan, ids, 'y'))} title="Mesmo espaço na vertical">
              <AlignVerticalDistributeCenter className="h-4 w-4" aria-hidden="true" /> Um embaixo do outro
            </button>
            <button type="button" className={TOOL_BTN} onClick={() => apply(matchSize(plan, ids))} title={`Todos com o tamanho de ${fixtureName(sel[0])}`}>
              <Scaling className="h-4 w-4" aria-hidden="true" /> Mesmo tamanho
            </button>
          </div>
          {sel.length < 3 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Selecione 3 ou mais para espaçar por igual.</p>}
        </div>
        <ul className="flex flex-col gap-0.5 text-sm" style={{ color: 'var(--text-primary)' }}>
          {sel.slice(0, 8).map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => onSelect([f.id])} className={`flex min-h-[36px] w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-[var(--surface-soft)] ${FOCUS}`}>
                <Swatch type={f.type} size={12} /> <span className="truncate">{fixtureName(f)}</span>
              </button>
            </li>
          ))}
          {sel.length > 8 && <li className="px-2 text-xs" style={{ color: 'var(--text-muted)' }}>e mais {sel.length - 8}</li>}
        </ul>
        {actions}
      </div>
    );
  }

  const f = sel[0];
  const meta = FIXTURES[f.type];
  const sold = report?.departments ?? [];
  const soldKeys = new Set(sold.map((d) => d.key));
  const ordered = [
    ...sold.filter((d) => d.key !== 'OUTROS').map((d) => ({ key: d.key, label: d.label, revenue: d.revenue })),
    ...DEPARTMENTS.filter((d) => !soldKeys.has(d.key) && d.key !== 'OUTROS').map((d) => ({ key: d.key, label: d.label, revenue: 0 })),
  ];
  const coldMismatch = !meta.cold && f.departments.some((d) => DEPT_BY_KEY[d]?.cold);
  const set = (p: Partial<Fixture>) => apply(patch(plan, [f.id], p));
  const toggleDept = (key: string) =>
    set({ departments: f.departments.includes(key) ? f.departments.filter((d) => d !== key) : [...f.departments, key] });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Label htmlFor="fixture-name">Nome do móvel</Label>
          <input
            id="fixture-name"
            value={f.label}
            onChange={(e) => preview(patch(plan, [f.id], { label: e.target.value.slice(0, 40) }))}
            onBlur={settle}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            placeholder={meta.label}
            className={`mt-1 h-10 w-full rounded-lg px-3 text-sm font-medium ${FOCUS}`}
            style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
          />
        </div>
        <button type="button" onClick={() => onSelect([])} aria-label="Fechar edição" className={`${TOOL_BTN} w-10 px-0`} style={{ color: 'var(--text-muted)' }}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {meta.noProducts ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{meta.label} não expõe produtos: serve de referência no mapa e para medir distâncias.</p>
      ) : (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>O que tem aqui</legend>
          <div className="flex flex-wrap gap-1.5">
            {ordered.map((d) => {
              const on = f.departments.includes(d.key);
              return (
                <button key={d.key} type="button" aria-pressed={on} onClick={() => toggleDept(d.key)}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-sm ${FOCUS}`}
                  style={on
                    ? { background: 'var(--brand-700)', color: '#fff', border: '1px solid var(--brand-700)' }
                    : { background: 'var(--surface-base)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' }}>
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: DEPT_BY_KEY[d.key]?.color, boxShadow: on ? '0 0 0 1.5px #fff' : undefined }} />
                  {d.label}
                  {d.revenue > 0 && <span className="text-xs opacity-80">{formatMoney(d.revenue)}</span>}
                </button>
              );
            })}
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Os setores que mais vendem vêm primeiro. Pode marcar mais de um.</p>
          {coldMismatch && (
            <p role="alert" className="rounded-lg px-3 py-2 text-sm" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
              Tem setor de frio num móvel seco. Se for refrigerado, mude o tipo para geladeira, freezer ou balcão.
            </p>
          )}
        </fieldset>
      )}

      <div className="flex flex-col gap-1.5">
        <Label>Posição e tamanho</Label>
        <div className="grid grid-cols-2 gap-2">
          <MeterField id="fx-x" label="Da parede esquerda" value={f.x} min={0} max={Math.max(0, plan.width - f.w)} onCommit={(x) => set({ x })} />
          <MeterField id="fx-y" label="Do fundo da loja" value={f.y} min={0} max={Math.max(0, plan.height - f.h)} onCommit={(y) => set({ y })} />
          <MeterField id="fx-w" label="Largura" value={f.w} min={0.3} max={plan.width - f.x} onCommit={(w) => set({ w })} />
          <MeterField id="fx-h" label="Comprimento" value={f.h} min={0.3} max={plan.height - f.y} onCommit={(h) => set({ h })} />
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Ou arraste as alças do móvel no mapa. Setas movem 25 cm; com Shift, 1 m.</p>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Tipo de móvel</legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
          {(Object.keys(FIXTURES) as FixtureType[]).filter((t) => t !== 'entrada').map((t) => {
            const m = FIXTURES[t];
            const on = t === f.type;
            return (
              <button key={t} type="button" aria-pressed={on} onClick={() => set({ type: t, departments: m.noProducts ? [] : f.departments })}
                className={`flex min-h-[40px] items-center gap-2 rounded-lg px-2 text-left text-xs font-medium ${FOCUS}`}
                style={{ border: `1px solid ${on ? m.stroke : 'var(--border-soft)'}`, background: on ? m.fill : 'var(--surface-base)', color: 'var(--text-primary)' }}>
                <Swatch type={t} size={14} /> {m.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {actions}
    </div>
  );
};

export default Inspector;
