import React from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Minus, Plus, RotateCw, Trash2, X } from 'lucide-react';
import type { DepartmentsReport, Fixture, FixtureType } from '../../types/storeMap.types';
import { formatMoney } from '../../utils/formatters';
import { DEPARTMENTS, DEPT_BY_KEY, FIXTURES, fixtureName } from './model';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';
const ICON_BTN = `inline-flex h-11 w-11 items-center justify-center rounded-lg ${FOCUS}`;

interface Props {
  fixture: Fixture;
  report: DepartmentsReport | null;
  onChange: (patch: Partial<Fixture>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onClose: () => void;
}

/** O móvel selecionado: o que ele é, o que tem nele e onde está. */
const FixtureEditor: React.FC<Props> = ({ fixture, report, onChange, onDuplicate, onRemove, onClose }) => {
  const meta = FIXTURES[fixture.type];
  const sold = report?.departments ?? [];
  const soldKeys = new Set(sold.map((d) => d.key));
  const ordered = [
    ...sold.filter((d) => d.key !== 'OUTROS').map((d) => ({ key: d.key, label: d.label, share: d.revenueShare, revenue: d.revenue })),
    ...DEPARTMENTS.filter((d) => !soldKeys.has(d.key) && d.key !== 'OUTROS').map((d) => ({ key: d.key, label: d.label, share: 0, revenue: 0 })),
  ];
  const coldMismatch = !meta.cold && fixture.departments.some((d) => DEPT_BY_KEY[d]?.cold);
  const vertical = fixture.h > fixture.w;
  const length = vertical ? fixture.h : fixture.w;

  const toggleDept = (key: string) => {
    const has = fixture.departments.includes(key);
    onChange({ departments: has ? fixture.departments.filter((d) => d !== key) : [...fixture.departments, key] });
  };
  const setLength = (value: number) => {
    const v = Math.max(0.5, Math.min(30, Math.round(value * 2) / 2));
    onChange(vertical ? { h: v } : { w: v });
  };
  const nudge = (dx: number, dy: number) => onChange({ x: Math.max(0, fixture.x + dx), y: Math.max(0, fixture.y + dy) });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="fixture-name" className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Nome do móvel</label>
          <input
            id="fixture-name"
            value={fixture.label}
            onChange={(e) => onChange({ label: e.target.value.slice(0, 40) })}
            placeholder={meta.label}
            className={`mt-1 h-11 w-full rounded-lg px-3 text-sm ${FOCUS}`}
            style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
          />
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar edição" className={ICON_BTN} style={{ color: 'var(--text-muted)' }}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Tipo</legend>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(FIXTURES) as FixtureType[]).filter((t) => t !== 'entrada').map((t) => {
            const m = FIXTURES[t];
            const active = t === fixture.type;
            return (
              <button key={t} type="button" aria-pressed={active} onClick={() => onChange({ type: t })}
                className={`flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-left text-xs font-medium ${FOCUS}`}
                style={{ border: `1px solid ${active ? m.stroke : 'var(--border-soft)'}`, background: active ? m.fill : 'var(--surface-base)', color: 'var(--text-primary)' }}>
                <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded" style={{ background: m.fill, border: `1.5px solid ${m.stroke}` }} />
                {m.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {meta.noProducts ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{meta.label} não expõe produtos: serve de referência no mapa e para medir distâncias.</p>
      ) : (
        <fieldset>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>O que tem aqui</legend>
          <p className="mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>Os setores que a loja mais vende vêm primeiro. Pode marcar mais de um (os dois lados da gôndola, por exemplo).</p>
          <div className="flex flex-wrap gap-1.5">
            {ordered.map((d) => {
              const active = fixture.departments.includes(d.key);
              return (
                <button key={d.key} type="button" aria-pressed={active} onClick={() => toggleDept(d.key)}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-sm ${FOCUS}`}
                  style={active
                    ? { background: 'var(--brand-700)', color: '#fff', border: '1px solid var(--brand-700)' }
                    : { background: 'var(--surface-base)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' }}>
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: DEPT_BY_KEY[d.key]?.color }} />
                  {d.label}
                  {d.revenue > 0 && <span className="text-xs opacity-80">{formatMoney(d.revenue)}</span>}
                </button>
              );
            })}
          </div>
          {coldMismatch && (
            <p role="alert" className="mt-2 rounded-lg px-3 py-2 text-sm" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
              Tem setor de frio num móvel seco. Se for refrigerado, mude o tipo para geladeira, freezer ou balcão.
            </p>
          )}
        </fieldset>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Comprimento</p>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Diminuir" onClick={() => setLength(length - 0.5)} className={ICON_BTN} style={{ border: '1px solid var(--border-strong)' }}><Minus className="h-4 w-4" /></button>
            <span className="min-w-[3.5rem] text-center text-sm font-semibold" style={{ color: 'var(--text-primary)' }} aria-live="polite">{length.toLocaleString('pt-BR')} m</span>
            <button type="button" aria-label="Aumentar" onClick={() => setLength(length + 0.5)} className={ICON_BTN} style={{ border: '1px solid var(--border-strong)' }}><Plus className="h-4 w-4" /></button>
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Mover</p>
          <div className="grid w-fit grid-cols-4 gap-1">
            <button type="button" aria-label="Mover para a esquerda" onClick={() => nudge(-0.5, 0)} className={ICON_BTN} style={{ border: '1px solid var(--border-strong)' }}><ArrowLeft className="h-4 w-4" /></button>
            <button type="button" aria-label="Mover para cima" onClick={() => nudge(0, -0.5)} className={ICON_BTN} style={{ border: '1px solid var(--border-strong)' }}><ArrowUp className="h-4 w-4" /></button>
            <button type="button" aria-label="Mover para baixo" onClick={() => nudge(0, 0.5)} className={ICON_BTN} style={{ border: '1px solid var(--border-strong)' }}><ArrowDown className="h-4 w-4" /></button>
            <button type="button" aria-label="Mover para a direita" onClick={() => nudge(0.5, 0)} className={ICON_BTN} style={{ border: '1px solid var(--border-strong)' }}><ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: 'var(--border-soft)' }}>
        <button type="button" onClick={() => onChange({ w: fixture.h, h: fixture.w })}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium ${FOCUS}`} style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}>
          <RotateCw className="h-4 w-4" aria-hidden="true" /> Girar
        </button>
        <button type="button" onClick={onDuplicate}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium ${FOCUS}`} style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}>
          <Copy className="h-4 w-4" aria-hidden="true" /> Duplicar
        </button>
        <button type="button" onClick={onRemove} aria-label={`Remover ${fixtureName(fixture)}`}
          className={`ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium ${FOCUS}`} style={{ border: '1px solid #fecaca', color: '#b91c1c', background: '#fef2f2' }}>
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Remover
        </button>
      </div>
    </div>
  );
};

export default FixtureEditor;
