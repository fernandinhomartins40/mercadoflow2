import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Gauge } from 'lucide-react';
import subscriptionService, { MarketUsage, isUnlimited } from '../../services/subscription.service';
import { useAuth } from '../../context/AuthContext';

/**
 * Medidor de consumo do plano.
 *
 * Aparece só quando há algo a comunicar: o usuário passou de 80% do limite ou
 * já estourou. Abaixo disso o banner seria ruído — e um aviso permanente perde
 * o efeito justamente quando passa a importar.
 */

const fmt = (v?: number | null) => new Intl.NumberFormat('pt-BR').format(Number(v || 0));

const UsageBanner: React.FC = () => {
  const { marketId } = useAuth();
  const [usage, setUsage] = useState<MarketUsage | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!marketId) return;
    let cancelled = false;
    subscriptionService
      .getMarketUsage(marketId)
      .then((data) => {
        if (!cancelled) setUsage(data);
      })
      .catch(() => {
        // O medidor é acessório: falhar aqui não deve poluir a tela.
      });
    return () => {
      cancelled = true;
    };
  }, [marketId]);

  if (!usage || dismissed) return null;
  if (isUnlimited(usage.invoiceLimit)) return null;
  if (!usage.limitReached && !usage.nearLimit) return null;

  const reached = usage.limitReached;
  const palette = reached
    ? { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', accent: '#dc2626' }
    : { bg: '#fffbeb', border: '#fde68a', text: '#92400e', accent: '#d97706' };

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-xl p-3"
      style={{ background: palette.bg, border: `1px solid ${palette.border}` }}
    >
      <div style={{ color: palette.accent }}>
        {reached ? <AlertTriangle size={18} /> : <Gauge size={18} />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: palette.text }}>
          {reached
            ? `Limite do plano ${usage.planName} atingido`
            : `Você já usou ${usage.usagePercent}% do plano ${usage.planName}`}
        </p>
        <p className="text-xs" style={{ color: palette.text, opacity: 0.85 }}>
          {fmt(usage.invoicesUsed)} de {fmt(usage.invoiceLimit)} notas neste mês.{' '}
          {reached
            ? 'Novas notas não estão sendo recebidas até a virada do ciclo. Tudo que já foi coletado continua disponível.'
            : `Restam ${fmt(usage.invoicesRemaining)} notas até o fim do ciclo.`}
        </p>
      </div>

      <a
        href="/app/planos"
        className="flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
        style={{ background: palette.accent, color: '#fff' }}
      >
        Ver planos
        <ArrowUpRight size={13} />
      </a>

      {!reached && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 text-xs font-medium"
          style={{ color: palette.text, opacity: 0.7 }}
        >
          Dispensar
        </button>
      )}
    </div>
  );
};

export default UsageBanner;
