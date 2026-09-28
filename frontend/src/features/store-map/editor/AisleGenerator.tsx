import React, { useState } from 'react';
import { Rows3 } from 'lucide-react';
import type { StorePlan } from '../../../types/storeMap.types';
import { AisleSpec, generateAisles } from './actions';
import { MeterField } from './Inspector';
import { StaticPlan } from './FixtureGlyph';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';

/**
 * Corredores de uma vez: quantas gôndolas, o comprimento e a largura do
 * corredor. A prévia mostra o resultado antes de colocar na planta.
 */
const AisleGenerator: React.FC<{ plan: StorePlan; onApply: (next: StorePlan, ids: string[]) => void }> = ({ plan, onApply }) => {
  const [spec, setSpec] = useState<AisleSpec>(() => ({
    count: Math.max(2, Math.min(8, Math.floor((plan.width - 6) / 2.6))),
    length: Math.max(3, Math.min(10, Math.round(plan.height - 7))),
    aisle: 1.6,
    orientation: 'vertical',
    endCaps: true,
  }));
  const set = (p: Partial<AisleSpec>) => setSpec((s) => ({ ...s, ...p }));
  const preview = generateAisles({ ...plan, fixtures: [] }, spec).plan;
  const vertical = spec.orientation === 'vertical';

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl" style={{ background: '#e9ede8' }}>
        <StaticPlan plan={{ ...preview, fixtures: [...plan.fixtures.map((f) => ({ ...f, label: '' })), ...preview.fixtures] }} className="block h-auto max-h-44 w-full" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="gen-count" className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Gôndolas</label>
          <div className="flex items-center gap-1">
            {[-1, 1].map((d) => (
              <button key={d} type="button" onClick={() => set({ count: Math.max(1, Math.min(30, spec.count + d)) })}
                aria-label={d < 0 ? 'Menos uma gôndola' : 'Mais uma gôndola'}
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg font-semibold ${FOCUS} ${d > 0 ? 'order-3' : ''}`}
                style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}>{d < 0 ? '−' : '+'}</button>
            ))}
            <output id="gen-count" className="order-2 min-w-[2rem] text-center text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{spec.count}</output>
          </div>
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Direção</legend>
          <div className="grid grid-cols-2 gap-1 rounded-lg p-0.5" style={{ background: 'var(--surface-soft)' }}>
            {(['vertical', 'horizontal'] as const).map((o) => (
              <button key={o} type="button" aria-pressed={spec.orientation === o} onClick={() => set({ orientation: o })}
                className={`h-9 rounded-md text-xs font-medium ${FOCUS}`}
                style={spec.orientation === o ? { background: 'var(--surface-base)', color: 'var(--text-primary)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' } : { color: 'var(--text-muted)' }}>
                {o === 'vertical' ? 'Em pé' : 'Deitadas'}
              </button>
            ))}
          </div>
        </fieldset>
        <MeterField id="gen-length" label="Comprimento" value={spec.length} min={1} max={(vertical ? plan.height : plan.width) - 1}
          onCommit={(length) => set({ length })} />
        <MeterField id="gen-aisle" label="Corredor" value={spec.aisle} min={0.8} max={4} onCommit={(aisle) => set({ aisle })} />
      </div>
      <label className="flex min-h-[36px] cursor-pointer items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
        <input type="checkbox" checked={spec.endCaps} onChange={(e) => set({ endCaps: e.target.checked })} className="h-4 w-4 accent-[var(--brand-700)]" />
        Com ponta de gôndola na frente
      </label>
      <button type="button" onClick={() => { const r = generateAisles(plan, spec); onApply(r.plan, r.ids); }}
        className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white ${FOCUS}`}
        style={{ background: 'var(--brand-700)' }}>
        <Rows3 className="h-4 w-4" aria-hidden="true" /> Colocar {spec.count} gôndolas
      </button>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Elas entram no meio da loja já selecionadas: arraste o grupo para o lugar certo.</p>
    </div>
  );
};

export default AisleGenerator;
