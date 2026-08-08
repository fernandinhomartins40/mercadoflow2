import React, { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import { Check, Sparkles } from 'lucide-react';
import subscriptionService, {
  MarketUsage,
  PlanDescriptor,
  formatLimit,
  formatPrice,
} from '../services/subscription.service';
import { useAuth } from '../context/AuthContext';

/**
 * Comparativo de planos com o consumo atual do mercado em destaque.
 *
 * Mostra onde o usuário está hoje e o que ele ganha ao subir — o argumento de
 * upgrade fica ancorado no consumo real dele, não em promessa genérica.
 */

const fmt = (v?: number | null) => new Intl.NumberFormat('pt-BR').format(Number(v || 0));

const Plans: React.FC = () => {
  const { marketId } = useAuth();
  const [plans, setPlans] = useState<PlanDescriptor[]>([]);
  const [usage, setUsage] = useState<MarketUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [planList, usageData] = await Promise.all([
          subscriptionService.getPublicPlans(),
          marketId ? subscriptionService.getMarketUsage(marketId).catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setPlans(planList);
        setUsage(usageData);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [marketId]);

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Planos
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Comece de graça e cresça conforme sua operação
          </p>
        </div>

        {usage && (
          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
          >
            <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
              SEU CONSUMO NESTE CICLO
            </p>
            <p className="mt-1 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {fmt(usage.invoicesUsed)} de {formatLimit(usage.invoiceLimit)} notas fiscais
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Plano {usage.planName} · {usage.branchCount} de {formatLimit(usage.branchLimit)} loja(s) ·{' '}
              {usage.pdvCount} de {formatLimit(usage.pdvLimit)} PDV(s) ·{' '}
              {usage.seatCount} de {formatLimit(usage.seatLimit)} usuário(s)
            </p>
          </div>
        )}

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Carregando planos...
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => {
              const current = usage?.planCode === plan.code;
              const recommended = plan.code === 'ESSENCIAL';
              return (
                <div
                  key={plan.code}
                  className="flex flex-col gap-3 rounded-xl p-5"
                  style={{
                    background: 'var(--surface-base)',
                    border: recommended ? '2px solid var(--brand-500, #22c55e)' : '1px solid var(--border-soft)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                      {plan.name}
                    </h2>
                    {recommended && (
                      <span
                        className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: '#dcfce7', color: '#15803d' }}
                      >
                        <Sparkles size={10} />
                        Recomendado
                      </span>
                    )}
                    {current && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: 'var(--surface-soft)', color: 'var(--text-muted)' }}
                      >
                        Plano atual
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {formatPrice(plan.monthlyPriceCents)}
                    </span>
                    {plan.monthlyPriceCents > 0 && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {' '}/mês
                      </span>
                    )}
                  </div>

                  <ul className="flex flex-col gap-2">
                    {(plan.highlights || []).map((item) => (
                      <li key={item} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <Check size={13} className="mt-0.5 shrink-0" style={{ color: '#16a34a' }} />
                        {item}
                      </li>
                    ))}
                  </ul>

                  {!current && (
                    <a
                      href="mailto:comercial@mercadoflow.com?subject=Upgrade%20de%20plano"
                      className="mt-auto rounded-lg py-2 text-center text-sm font-semibold"
                      style={
                        recommended
                          ? { background: 'var(--brand-500, #22c55e)', color: '#fff' }
                          : { border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }
                      }
                    >
                      {plan.code === 'FREE'
                        ? 'Plano gratuito'
                        : plan.custom
                          ? 'Montar plano sob medida'
                          : 'Assinar'}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Plans;
