import React, { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import { AlertTriangle, Barcode, Bell, Check, Clock, CreditCard, ExternalLink, QrCode, Sparkles } from 'lucide-react';
import subscriptionService, {
  AppNotice,
  BillingStatus,
  MarketSubscription,
  MarketUsage,
  PaymentMethod,
  PlanCode,
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

/** Frase do servidor quando ela existe (as rotas de cobrança devolvem { error: "frase" }). */
const reason = (err: any, fallback: string) => {
  const data = err?.response?.data;
  if (typeof data?.userMessage === 'string') return data.userMessage;
  if (typeof data?.error === 'string' && data.error.includes(' ')) return data.error;
  return fallback;
};

const METHOD_LABEL: Record<PaymentMethod, string> = { PIX: 'Pix', BOLETO: 'Boleto', CARTAO: 'Cartão' };
const METHOD_ICON: Record<PaymentMethod, React.ReactNode> = {
  PIX: <QrCode size={14} />,
  BOLETO: <Barcode size={14} />,
  CARTAO: <CreditCard size={14} />,
};

const Plans: React.FC = () => {
  const { marketId } = useAuth();
  const [plans, setPlans] = useState<PlanDescriptor[]>([]);
  const [usage, setUsage] = useState<MarketUsage | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState<PlanCode | 'PORTAL' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sub, setSub] = useState<MarketSubscription | null>(null);
  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [trialing, setTrialing] = useState<PlanCode | null>(null);
  const [trialNotice, setTrialNotice] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<PlanCode | null>(null);
  const [paying, setPaying] = useState(false);
  const [canceling, setCanceling] = useState(false);
  // Volta do pagamento: o plano só muda quando o pagamento é confirmado (webhook), então o aviso diz isso.
  const checkoutResult = new URLSearchParams(window.location.search).get('checkout');
  const checkoutNotice = checkoutResult === 'sucesso'
    ? 'Pagamento enviado. O plano novo é liberado assim que a confirmação chegar, em geral em poucos segundos.'
    : checkoutResult === 'alterado'
      ? 'Plano trocado na sua assinatura atual. A diferença do mês é ajustada proporcionalmente na próxima fatura.'
      : checkoutResult === 'cancelado' ? 'Pagamento não concluído. Nada foi cobrado.' : null;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [planList, usageData, billingData, subData, noticeData] = await Promise.all([
          subscriptionService.getPublicPlans(),
          marketId ? subscriptionService.getMarketUsage(marketId).catch(() => null) : Promise.resolve(null),
          marketId ? subscriptionService.getBillingStatus(marketId).catch(() => null) : Promise.resolve(null),
          marketId ? subscriptionService.getSubscription(marketId).catch(() => null) : Promise.resolve(null),
          marketId ? subscriptionService.getNotices(marketId).catch(() => []) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setPlans(planList);
        setUsage(usageData);
        setBilling(billingData);
        setSub(subData);
        setNotices(noticeData);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [marketId]);

  const subscribe = async (plan: PlanCode, method: PaymentMethod) => {
    if (!marketId) return;
    setRedirecting(plan);
    setError(null);
    try {
      // O backend devolve a página de pagamento: fatura do Asaas (Pix/boleto) ou Checkout do Stripe (cartão).
      window.location.href = await subscriptionService.startCheckout(marketId, plan, method);
    } catch (err: any) {
      setError(reason(err, 'Não foi possível abrir o pagamento.'));
      setRedirecting(null);
    }
  };

  const payNow = async () => {
    if (!marketId) return;
    setPaying(true);
    setError(null);
    try {
      window.location.href = await subscriptionService.openPayment(marketId);
    } catch (err: any) {
      setError(reason(err, 'Não foi possível abrir a fatura.'));
      setPaying(false);
    }
  };

  const cancelPlan = async () => {
    if (!marketId) return;
    const until = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString('pt-BR') : null;
    if (!window.confirm(`Cancelar a assinatura? ${until ? `O plano vale até ${until} e depois` : 'A conta'} volta ao Grátis, sem perder dados.`)) return;
    setCanceling(true);
    setError(null);
    try {
      await subscriptionService.cancelSubscription(marketId);
      setSub(await subscriptionService.getSubscription(marketId));
    } catch (err: any) {
      setError(reason(err, 'Não foi possível cancelar agora.'));
    } finally {
      setCanceling(false);
    }
  };

  const startTrial = async (plan: PlanDescriptor) => {
    if (!marketId) return;
    setTrialing(plan.code);
    setError(null);
    try {
      const updated = await subscriptionService.startTrial(marketId, plan.code);
      setSub(updated);
      const [usageData, noticeData] = await Promise.all([
        subscriptionService.getMarketUsage(marketId).catch(() => null),
        subscriptionService.getNotices(marketId).catch(() => []),
      ]);
      setUsage(usageData);
      setNotices(noticeData);
      setTrialNotice(`Teste do plano ${plan.name} liberado por ${updated.trialDays} dias. Aproveite!`);
    } catch (err: any) {
      setError(err?.response?.data?.userMessage || err?.message || 'Não foi possível começar o teste.');
    } finally {
      setTrialing(null);
    }
  };

  const manageSubscription = async () => {
    if (!marketId) return;
    setRedirecting('PORTAL');
    setError(null);
    try {
      window.location.href = await subscriptionService.openBillingPortal(marketId);
    } catch (err: any) {
      setError(reason(err, 'Não foi possível abrir a gestão da assinatura.'));
      setRedirecting(null);
    }
  };

  /** Formas de pagamento disponíveis para o plano: Pix e boleto (Asaas), cartão (Stripe). */
  const methodsFor = (plan: PlanDescriptor): PaymentMethod[] => {
    if (!billing || (plan.code !== 'ESSENCIAL' && plan.code !== 'PROFISSIONAL')) return [];
    const out: PaymentMethod[] = [];
    if (billing.pixEnabled) out.push('PIX');
    if (billing.boletoEnabled) out.push('BOLETO');
    const cardPrice = plan.code === 'ESSENCIAL' ? billing.essencialAvailable : billing.profissionalAvailable;
    if (billing.checkoutEnabled && cardPrice) out.push('CARTAO');
    return out;
  };
  const canCheckout = (plan: PlanDescriptor) => methodsFor(plan).length > 0;
  const late = sub?.status === 'PAST_DUE' || sub?.status === 'RESTRICTED';
  const paysByGateway = sub?.provider === 'ASAAS' && (sub.status === 'ACTIVE' || late);

  const hasPaidPlan = usage != null && usage.planCode !== 'FREE';

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
              SEU CONSUMO NESTA SEMANA
            </p>
            <p className="mt-1 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {fmt(usage.invoicesUsed)} de {formatLimit(usage.invoiceLimit)} notas fiscais · renova toda segunda-feira
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Plano {usage.planName} · {usage.branchCount} de {formatLimit(usage.branchLimit)} loja(s) ·{' '}
              {usage.pdvCount} de {formatLimit(usage.pdvLimit)} PDV(s) ·{' '}
              {usage.seatCount} de {formatLimit(usage.seatLimit)} usuário(s)
            </p>

            {paysByGateway && sub && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Pago por {sub.paymentMethod === 'BOLETO' ? 'boleto' : 'Pix'}
                  {sub.currentPeriodEnd && ` · plano válido até ${new Date(sub.currentPeriodEnd).toLocaleDateString('pt-BR')}`}
                  {sub.cancelAtPeriodEnd && ' · cancelada, volta ao Grátis depois'}
                </span>
                {!sub.cancelAtPeriodEnd && (
                  <button
                    type="button"
                    disabled={canceling}
                    onClick={cancelPlan}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                    style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
                  >
                    {canceling ? 'Cancelando...' : 'Cancelar assinatura'}
                  </button>
                )}
              </div>
            )}

            {hasPaidPlan && billing?.checkoutEnabled && sub?.provider === 'STRIPE' && (
              <button
                type="button"
                disabled={redirecting !== null}
                onClick={manageSubscription}
                className="mt-3 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
              >
                <CreditCard size={13} />
                {redirecting === 'PORTAL' ? 'Abrindo...' : 'Gerenciar assinatura'}
                <ExternalLink size={12} />
              </button>
            )}
          </div>
        )}

        {late && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl p-3" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            <p className="min-w-0 flex-1 text-sm" style={{ color: '#991b1b' }}>
              {sub?.bannerMessage || 'Há um pagamento em aberto.'}
            </p>
            <button
              type="button"
              disabled={paying}
              onClick={payNow}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
              style={{ background: '#dc2626', color: '#fff' }}
            >
              {paying ? 'Abrindo...' : 'Pagar agora'}
            </button>
          </div>
        )}

        {!late && sub?.pendingInvoiceUrl && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl p-3" style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-soft)' }}>
            <p className="min-w-0 flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>
              A fatura do plano {plans.find((x) => x.code === sub.pendingPlan)?.name || sub.pendingPlan} está esperando o pagamento.
              O plano é liberado assim que o pagamento for confirmado.
            </p>
            <a
              href={sub.pendingInvoiceUrl}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold"
              style={{ background: 'var(--brand-500, #22c55e)', color: '#fff' }}
            >
              Abrir fatura
              <ExternalLink size={13} />
            </a>
          </div>
        )}

        {trialNotice && (
          <div role="status" className="rounded-xl p-3 text-sm" style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}>
            {trialNotice}
          </div>
        )}

        {checkoutNotice && (
          <div role="status" className="rounded-xl p-3 text-sm" style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}>
            {checkoutNotice}
          </div>
        )}

        {error && (
          <div
            className="flex items-center gap-2 rounded-xl p-3 text-sm"
            style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}
          >
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Carregando planos...
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => {
              const inTrial = sub?.status === 'TRIAL' && sub.trialPlan === plan.code;
              const current = usage?.planCode === plan.code && !inTrial;
              const canTrial = !!sub?.trialAvailable && (plan.code === 'ESSENCIAL' || plan.code === 'PROFISSIONAL');
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
                    {inTrial && (
                      <span
                        className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: '#fef3c7', color: '#92400e' }}
                      >
                        <Clock size={10} />
                        Em teste
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

                  {canTrial && (
                    <button
                      type="button"
                      disabled={trialing !== null || redirecting !== null}
                      onClick={() => startTrial(plan)}
                      className="mt-auto flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold disabled:opacity-60"
                      style={{ background: 'var(--brand-500, #22c55e)', color: '#fff' }}
                    >
                      <Clock size={14} />
                      {trialing === plan.code ? 'Liberando...' : `Testar ${sub?.trialDays ?? 7} dias grátis`}
                    </button>
                  )}

                  {!current && plan.code !== 'FREE' && (
                    canCheckout(plan) ? (
                      choosing === plan.code ? (
                        <div className={`${canTrial ? '' : 'mt-auto '}flex flex-col gap-2`} role="group" aria-label={`Forma de pagamento do plano ${plan.name}`}>
                          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Como você quer pagar?</span>
                          <div className="grid grid-cols-3 gap-2">
                            {methodsFor(plan).map((m) => (
                              <button
                                key={m}
                                type="button"
                                disabled={redirecting !== null}
                                onClick={() => subscribe(plan.code, m)}
                                className="flex flex-col items-center gap-1 rounded-lg py-2 text-xs font-semibold disabled:opacity-60"
                                style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
                              >
                                {METHOD_ICON[m]}
                                {redirecting === plan.code ? '...' : METHOD_LABEL[m]}
                              </button>
                            ))}
                          </div>
                          <button type="button" onClick={() => setChoosing(null)} className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Voltar
                          </button>
                        </div>
                      ) : (
                      <button
                        type="button"
                        disabled={redirecting !== null}
                        onClick={() => {
                          const methods = methodsFor(plan);
                          if (methods.length === 1) void subscribe(plan.code, methods[0]);
                          else setChoosing(plan.code);
                        }}
                        className={`${canTrial ? '' : 'mt-auto '}flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold disabled:opacity-60`}
                        style={
                          recommended
                            ? { background: 'var(--brand-500, #22c55e)', color: '#fff' }
                            : { border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }
                        }
                      >
                        <CreditCard size={14} />
                        {redirecting === plan.code ? 'Abrindo pagamento...' : 'Assinar'}
                      </button>
                      )
                    ) : (
                      <a
                        href={`mailto:comercial@mercadoflow.com?subject=Plano%20${encodeURIComponent(plan.name)}`}
                        className="mt-auto flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold"
                        style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
                      >
                        {plan.custom ? 'Montar plano sob medida' : 'Falar com o comercial'}
                        <ExternalLink size={13} />
                      </a>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}

        {notices.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              <Bell size={14} />
              Avisos da conta
            </h2>
            {notices.slice(0, 6).map((n) => (
              <div
                key={n.id}
                className="rounded-xl p-3"
                style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
              >
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{n.title}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{n.body}</p>
                <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {new Date(n.createdAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
            ))}
          </section>
        )}
      </div>
    </Layout>
  );
};

export default Plans;
