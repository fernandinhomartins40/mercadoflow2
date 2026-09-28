import React, { useMemo, useState } from 'react';
import { PencilRuler, Sparkles } from 'lucide-react';
import type { DepartmentsReport, StorePlan } from '../../types/storeMap.types';
import { StaticPlan } from './editor/FixtureGlyph';
import { SIZES, StoreSize, buildTemplate, newId } from './model';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';

/** Loja vazia só com a entrada, no canto da frente. */
export const blankPlan = (width: number, height: number): StorePlan => ({
  version: 2, width, height,
  fixtures: [{ id: newId(), type: 'entrada', x: Math.max(0, width - 4), y: height - 0.5, w: 3, h: 0.5, label: 'Entrada', departments: [] }],
});

/**
 * Primeiro uso: o dono escolhe a loja mais parecida com a dele e recebe a
 * planta já com os setores que vende em cada móvel — ou começa do zero só
 * informando as medidas. Nos dois casos, o resto se ajusta no editor.
 */
const SetupWizard: React.FC<{
  report: DepartmentsReport | null;
  onPick: (plan: StorePlan) => void;
  busy: boolean;
  /** Vendas ainda chegando: a planta sairia sem os setores da loja. */
  reading?: boolean;
}> = ({ report, onPick, busy, reading = false }) => {
  const previews = useMemo(
    () => SIZES.map((s) => ({ size: s, plan: buildTemplate(s.key as StoreSize, report) })),
    [report],
  );
  const soldCount = (report?.departments ?? []).filter((d) => d.key !== 'OUTROS').length;
  const [w, setW] = useState('20');
  const [h, setH] = useState('14');
  const num = (v: string) => Number(v.replace(',', '.'));
  const valid = num(w) >= 4 && num(w) <= 200 && num(h) >= 4 && num(h) <= 200;

  return (
    <section aria-labelledby="setup-title" className="flex flex-col gap-5">
      <div>
        <h2 id="setup-title" className="flex items-center gap-2 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          <Sparkles className="h-5 w-5" style={{ color: 'var(--brand-700)' }} aria-hidden="true" />
          Qual destas lojas parece mais com a sua?
        </h2>
        <p className="mt-1 max-w-3xl text-sm" style={{ color: 'var(--text-muted)' }}>
          A planta já vem montada
          {reading ? ' (lendo as vendas da loja)' : soldCount > 0 ? <> com os <strong>{soldCount} setores que a sua loja vende</strong> em cada móvel</> : ' com os setores de um supermercado'}.
          Depois você arrasta, estica e troca o que for diferente. Não precisa cadastrar produto: cada item vendido é localizado sozinho pela nota fiscal.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {previews.map(({ size, plan }) => (
          <button
            key={size.key}
            type="button"
            disabled={busy || reading}
            onClick={() => onPick(buildTemplate(size.key as StoreSize, report))}
            className={`group flex flex-col gap-3 rounded-2xl p-3 text-left transition hover:border-[var(--brand-500)] disabled:opacity-60 ${FOCUS}`}
            style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}
          >
            <span className="block overflow-hidden rounded-xl" style={{ background: '#e9ede8' }}>
              <StaticPlan plan={plan} className="block h-auto w-full" />
            </span>
            <span>
              <span className="block text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{size.title}</span>
              <span className="block text-sm" style={{ color: 'var(--text-muted)' }}>{size.text}, {size.w} × {size.h} m</span>
            </span>
            <span className="inline-flex min-h-[44px] items-center justify-center rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--brand-700)' }}>
              {busy ? 'Montando...' : reading ? 'Lendo as vendas…' : 'Usar esta planta'}
            </span>
          </button>
        ))}
      </div>

      <form
        className="flex flex-wrap items-end gap-3 rounded-2xl p-4"
        style={{ border: '1px dashed var(--border-strong)', background: 'var(--surface-base)' }}
        onSubmit={(e) => { e.preventDefault(); if (valid) onPick(blankPlan(num(w), num(h))); }}
      >
        <div className="flex min-w-[12rem] flex-1 items-start gap-3">
          <PencilRuler className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Desenhar do zero</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Informe as medidas do salão e monte com os móveis e o gerador de corredores.</p>
          </div>
        </div>
        {([['blank-w', 'Largura', w, setW], ['blank-h', 'Fundo', h, setH]] as const).map(([id, label, value, set]) => (
          <div key={id} className="flex flex-col gap-1">
            <label htmlFor={id} className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{label} (m)</label>
            <input id={id} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)}
              className={`h-11 w-24 rounded-lg px-3 text-sm ${FOCUS}`}
              style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
          </div>
        ))}
        <button type="submit" disabled={busy || !valid}
          className={`inline-flex min-h-[44px] items-center rounded-lg px-4 text-sm font-semibold disabled:opacity-50 ${FOCUS}`}
          style={{ border: '1px solid var(--brand-700)', color: 'var(--brand-700)' }}>
          Começar do zero
        </button>
        {!valid && <p className="w-full text-xs" style={{ color: '#b91c1c' }}>As medidas vão de 4 a 200 metros.</p>}
      </form>
    </section>
  );
};

export default SetupWizard;
