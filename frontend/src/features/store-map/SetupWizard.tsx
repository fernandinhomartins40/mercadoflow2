import React, { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import type { DepartmentsReport, StorePlan } from '../../types/storeMap.types';
import PlanView from './PlanView';
import { SIZES, StoreSize, buildTemplate, newId } from './model';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';

/**
 * Primeiro uso: em vez de uma grade vazia, o dono escolhe o tamanho da loja e
 * recebe a planta típica já com os setores que ele vende em cada móvel. Só
 * ajusta o que for diferente.
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

  return (
    <section aria-labelledby="setup-title" className="flex flex-col gap-4">
      <div className="rounded-2xl p-4 sm:p-5" style={{ background: 'var(--surface-success)', border: '1px solid var(--border-success)' }}>
        <h2 id="setup-title" className="flex items-center gap-2 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          <Sparkles className="h-5 w-5" style={{ color: 'var(--brand-700)' }} aria-hidden="true" />
          Qual destas lojas parece mais com a sua?
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          Escolha uma e a planta já vem montada
          {reading ? ' (lendo as vendas da loja)' : soldCount > 0 ? <> com os <strong>{soldCount} setores que a sua loja vende</strong> em cada móvel</> : ' com os setores de um supermercado'}.
          Depois é só arrastar o que estiver em outro lugar. Não precisa cadastrar produto: cada produto vendido é localizado sozinho pela nota fiscal.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {previews.map(({ size, plan }) => (
          <button
            key={size.key}
            type="button"
            disabled={busy || reading}
            onClick={() => onPick(buildTemplate(size.key as StoreSize, report))}
            className={`flex flex-col gap-3 rounded-2xl p-3 text-left transition hover:shadow-md disabled:opacity-60 ${FOCUS}`}
            style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}
          >
            <span className="block overflow-hidden rounded-xl" style={{ background: '#f8fafc' }} aria-hidden="true">
              <PlanView plan={plan} mode="view" selectedId={null} onSelect={() => undefined} />
            </span>
            <span>
              <span className="block text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{size.title}</span>
              <span className="block text-sm" style={{ color: 'var(--text-muted)' }}>{size.text}</span>
            </span>
            <span className="inline-flex min-h-[44px] items-center justify-center rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--brand-700)' }}>
              {busy ? 'Montando...' : reading ? 'Lendo as vendas…' : 'Usar esta planta'}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => onPick({ version: 2, width: 20, height: 14, fixtures: [{ id: newId(), type: 'entrada', x: 16.5, y: 13.5, w: 3, h: 0.5, label: 'Entrada', departments: [] }] })}
        className={`self-start text-sm font-semibold underline ${FOCUS}`}
        style={{ color: 'var(--brand-700)' }}
      >
        Prefiro começar do zero
      </button>
    </section>
  );
};

export default SetupWizard;
