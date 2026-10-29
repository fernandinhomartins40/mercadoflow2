import React, { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import Layout from '../components/layout/Layout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PageHero } from '../components/flow/Flow';

/**
 * Planos e Minha assinatura dentro do app MercadoFlow Gestão. A Play Store e a
 * App Store só deixam vender assinatura dentro do app pela cobrança delas, e o
 * MercadoFlow cobra pelo Asaas. Por isso o app mostra o plano em uso e não
 * oferece compra, troca de plano, adicionais nem link de pagamento.
 */

interface Overview {
  subscription: { status: string; trialEndsAt?: string | null; currentPeriodEnd?: string | null };
  plan: { code: string; name: string };
  usage: { stores: number; storesLimit: number; pdvs: number; pdvsLimit: number; seats: number; seatsLimit: number };
}

const STATUS_TEXT: Record<string, string> = {
  FREE: 'Grátis', TRIAL: 'Em teste', ACTIVE: 'Ativa', PAST_DUE: 'Pagamento em atraso', RESTRICTED: 'Só consulta',
  PAUSED: 'Pausada', SUSPENDED: 'Suspensa', PENDING: 'Em análise', CANCELLED: 'Cancelada',
};

const limit = (used: number, max: number) => (max < 0 ? `${used} (sem limite)` : `${used} de ${max}`);

const AppPlanInfo: React.FC = () => {
  const { marketId } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!marketId) return;
    api.get<Overview>(`/v1/markets/${marketId}/subscription/overview`)
      .then(({ data: d }) => setData(d))
      .catch((err) => setError(err?.message || 'Não foi possível carregar o plano.'));
  }, [marketId]);

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <PageHero title="O plano da sua loja." />
        {error && <p role="alert" className="rounded-xl p-3 text-sm" style={{ background: '#fef2f2', color: '#991b1b' }}>{error}</p>}
        {!data && !error && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Carregando...</p>}
        {data && (
          <section className="fx-forest flex flex-col gap-2" aria-label="Plano atual">
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-.03em' }}>Plano {data.plan.name}</h2>
            <p style={{ margin: 0, fontSize: 15, color: 'var(--fx-on-forest-muted)' }}>
              Situação: {STATUS_TEXT[data.subscription.status] || data.subscription.status}
            </p>
          </section>
        )}
        {data && (
          <div className="fx-card fx-card-pad flex flex-col gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
            <p className="flex justify-between"><span>Lojas</span><span className="tabular-nums">{limit(data.usage.stores, data.usage.storesLimit)}</span></p>
            <p className="flex justify-between"><span>Caixas (PDVs)</span><span className="tabular-nums">{limit(data.usage.pdvs, data.usage.pdvsLimit)}</span></p>
            <p className="flex justify-between"><span>Pessoas na equipe</span><span className="tabular-nums">{limit(data.usage.seats, data.usage.seatsLimit)}</span></p>
          </div>
        )}
        <div className="fx-card fx-card-pad flex items-start gap-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          <CreditCard size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p style={{ margin: 0 }}>Assinatura, pagamentos e faturas não são tratados pelo aplicativo.</p>
        </div>
      </div>
    </Layout>
  );
};

export default AppPlanInfo;
