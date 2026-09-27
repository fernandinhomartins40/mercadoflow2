import React from 'react';
import { Hourglass } from 'lucide-react';

/** Loja conectada, mas com poucos dias de venda: os números ainda não descrevem uma semana. */
const CollectingBanner: React.FC<{ salesDays: number; targetDays: number }> = ({ salesDays, targetDays }) => {
  const percent = Math.min(100, Math.round((salesDays / Math.max(targetDays, 1)) * 100));
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl p-4"
      style={{ border: '1px solid var(--border-info)', background: 'var(--surface-info)' }}
    >
      <Hourglass className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--text-primary)' }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Coletando vendas: {salesDays} de {targetDays} dias
        </p>
        {/* --text-muted sobre --surface-info fica em 4,37:1, abaixo do AA. */}
        <p className="mt-0.5 text-sm" style={{ color: 'var(--text-primary)' }}>
          Os números do Painel ficam mais confiáveis a cada dia de venda.
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-base)' }} aria-hidden="true">
          <div className="h-full rounded-full" style={{ width: `${percent}%`, background: 'var(--brand-700)' }} />
        </div>
      </div>
    </div>
  );
};

export default CollectingBanner;
