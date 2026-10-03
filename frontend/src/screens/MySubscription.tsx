import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ExternalLink, FileText, Minus, Pause, Play, Plus } from 'lucide-react';
import Layout from '../components/layout/Layout';
import api from '../services/api';
import subscriptionService, { MarketSubscription, PlanFeature, featureText, formatLimit } from '../services/subscription.service';
import { useAuth } from '../context/AuthContext';
import { ActionHub, PageHero } from '../components/flow/Flow';
import { CreditCard as HxCreditCard, Layers as HxLayers, Users as HxUsers } from 'lucide-react';

/**
 * Minha assinatura: plano e estado, o que o plano inclui, uso, créditos,
 * adicionais, faturas e notas, pausa e cancelamento — numa tela só.
 */

interface Addon { code: string; name: string; description?: string; priceCents: number; maxQuantity: number; quantity: number }
interface Invoice { id: string; dueDate?: string; value: number; status: string; method?: string; invoiceUrl?: string; nfseUrl?: string }
interface Overview {
  subscription: MarketSubscription;
  plan: { code: string; name: string; priceCents: number };
  effectivePlan: string;
  features: PlanFeature[];
  usage: { stores: number; storesLimit: number; pdvs: number; pdvsLimit: number; seats: number; seatsLimit: number };
  ai: { balance: number; included?: number; includedMonthly?: number; available?: number };
  confereBalance: number;
  addons: Addon[];
  monthlyTotalCents: number;
  invoices: Invoice[];
  canChangeAddons: boolean;
  canPause: boolean;
  canResume: boolean;
  canCancel: boolean;
  pausedUntil?: string | null;
}

const brl = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const day = (s?: string | null) => (s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString('pt-BR') : '—');
const reasonOf = (err: any, fallback: string) => err?.response?.data?.userMessage || fallback;

const STATUS_LABEL: Record<string, { text: string; bg: string; fg: string }> = {
  FREE: { text: 'Grátis', bg: 'var(--surface-soft)', fg: 'var(--text-primary)' },
  TRIAL: { text: 'Em teste', bg: '#fef3c7', fg: '#92400e' },
  ACTIVE: { text: 'Ativa', bg: '#dcfce7', fg: '#166534' },
  PAST_DUE: { text: 'Pagamento em atraso', bg: '#fef3c7', fg: '#92400e' },
  RESTRICTED: { text: 'Só consulta', bg: '#fee2e2', fg: '#991b1b' },
  PAUSED: { text: 'Pausada', bg: '#e0e7ff', fg: '#3730a3' },
  SUSPENDED: { text: 'Suspensa', bg: '#fee2e2', fg: '#991b1b' },
  PENDING: { text: 'Em análise', bg: 'var(--surface-soft)', fg: 'var(--text-primary)' },
  CANCELLED: { text: 'Cancelada', bg: '#fee2e2', fg: '#991b1b' },
};

const INVOICE_STATUS: Record<string, string> = {
  PENDING: 'Em aberto', OVERDUE: 'Vencida', RECEIVED: 'Paga', CONFIRMED: 'Paga', RECEIVED_IN_CASH: 'Paga', REFUNDED: 'Estornada',
};

const EXIT_REASONS: { code: string; label: string }[] = [
  { code: 'PRECO', label: 'O preço pesou' },
  { code: 'POUCO_USO', label: 'Não usei o suficiente' },
  { code: 'FALTOU_RECURSO', label: 'Faltou algo que eu precisava' },
  { code: 'SAZONAL', label: 'A loja tem temporada fraca' },
  { code: 'FECHOU_LOJA', label: 'Fechei ou vendi a loja' },
  { code: 'OUTRO', label: 'Outro motivo' },
];

const CARD = 'fx-card fx-card-pad flex flex-col gap-3';
const CARD_STYLE = undefined;
const H2 = 'text-base font-bold';

const Meter: React.FC<{ label: string; used: number; limit: number }> = ({ label, used, limit }) => {
  const unlimited = limit < 0;
  const pct = unlimited || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm" style={{ color: 'var(--text-primary)' }}>
        <span>{label}</span>
        <span className="tabular-nums">{used} de {formatLimit(limit)}</span>
      </div>
      {!unlimited && (
        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-soft)' }} role="progressbar"
          aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: used > limit ? '#dc2626' : pct >= 100 ? '#d97706' : 'var(--brand-500, #22c55e)' }} />
        </div>
      )}
    </div>
  );
};

const MySubscription: React.FC = () => {
  const { marketId } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    if (!marketId) return;
    try {
      const { data: d } = await api.get<Overview>(`/v1/markets/${marketId}/subscription/overview`);
      setData(d);
    } catch (err: any) {
      setError(reasonOf(err, 'Não foi possível carregar a assinatura.'));
    }
  }, [marketId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (key: string, run: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await run();
      await load();
      setNotice(done);
      window.dispatchEvent(new Event('mf:subscription-changed'));
    } catch (err: any) {
      setError(reasonOf(err, 'Não foi possível concluir agora.'));
    } finally {
      setBusy(null);
    }
  };

  const setAddon = (a: Addon, qty: number) => act(`addon-${a.code}`,
    () => api.put(`/v1/markets/${marketId}/subscription/addons/${a.code}`, { quantity: qty }),
    `${a.name}: ${qty === 0 ? 'removido' : `${qty} na assinatura`}. O valor novo já vale na próxima fatura.`);

  const pause = (months: number) => act('pause', async () => {
    await api.post(`/v1/markets/${marketId}/subscription/pause`, { months, reason: reason || 'OUTRO', comment });
    setLeaving(false);
  }, `Assinatura pausada por ${months === 1 ? '1 mês' : '2 meses'}. Os seus dados ficam guardados.`);

  const cancel = () => act('cancel', async () => {
    await api.post(`/v1/markets/${marketId}/subscription/cancel`, { reason: reason || 'OUTRO', comment });
    setLeaving(false);
  }, 'Assinatura cancelada. O plano vale até o fim do período pago e depois a conta vai para o Grátis.');

  const resume = () => act('resume', () => api.post(`/v1/markets/${marketId}/subscription/resume`), 'Assinatura de volta. Tudo liberado.');

  const payNow = async () => {
    if (!marketId) return;
    setBusy('pay');
    try {
      window.location.href = await subscriptionService.openPayment(marketId);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Não foi possível abrir a fatura.');
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <Layout>
        <p className="text-sm" style={{ color: error ? '#991b1b' : 'var(--text-muted)' }}>{error || 'Carregando assinatura...'}</p>
      </Layout>
    );
  }

  const s = data.subscription;
  const status = STATUS_LABEL[s.status] || STATUS_LABEL.FREE;
  const late = s.status === 'PAST_DUE' || s.status === 'RESTRICTED';
  const paidAddons = data.addons.filter((a) => a.quantity > 0);
  const method = s.paymentMethod === 'BOLETO' ? 'Boleto' : s.paymentMethod === 'PIX' ? 'Pix' : s.paymentMethod === 'CARTAO' ? 'Cartão' : null;
  const enabledFeatures = data.features.filter((f) => f.enabled);

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <PageHero title={<>Sua assinatura, <mark>sem surpresa.</mark></>} subtitle="Plano, uso, adicionais e faturas da sua conta." side={<ActionHub icon={HxCreditCard} actions={[{ label: 'Comparar planos', icon: HxLayers, to: '/app/planos' }, { label: 'Equipe e acessos', icon: HxUsers, to: '/app/equipe' }]} />} />

        {notice && <p role="status" className="rounded-xl p-3 text-sm" style={{ background: 'var(--surface-soft)', color: 'var(--text-primary)' }}>{notice}</p>}
        {error && <p role="alert" className="rounded-xl p-3 text-sm" style={{ background: '#fef2f2', color: '#991b1b' }}>{error}</p>}

        {/* Plano e estado */}
        <section className="fx-forest flex flex-col gap-3" aria-label="Plano atual">
          <div className="flex flex-wrap items-center gap-2">
            <h2 style={{ margin: 0, fontSize: 'clamp(24px, 2.6vw, 34px)', fontWeight: 800, letterSpacing: '-.035em' }}>Plano {data.plan.name}</h2>
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: status.bg, color: status.fg }} data-testid="sub-status">
              {status.text}
            </span>
          </div>
          {data.monthlyTotalCents > 0 && (
            <p style={{ margin: 0 }}>
              <span className="fx-money" style={{ fontSize: 30 }}>{brl(data.monthlyTotalCents)}</span><span className="text-sm" style={{ color: 'var(--fx-on-forest-muted)' }}> /mês</span>
            </p>
          )}
          <p style={{ margin: 0, fontSize: 15, color: 'var(--fx-on-forest-muted)' }}>
            {s.status === 'TRIAL' && s.trialEndsAt && `Teste grátis até ${day(s.trialEndsAt)}. `}
            {s.status === 'PAUSED' && data.pausedUntil && `Pausada até ${day(data.pausedUntil)}; a conta usa os limites do Grátis. `}
            {s.currentPeriodEnd && s.status !== 'FREE' && (s.cancelAtPeriodEnd
              ? `Cancelada: o plano vale até ${day(s.currentPeriodEnd)} e depois a conta vai para o Grátis. `
              : `Próxima cobrança em ${day(s.currentPeriodEnd)}. `)}
            {method && `Pagamento por ${method}.`}
            {s.status === 'FREE' && 'O plano Grátis é para sempre. Assine quando quiser mais.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/app/planos" className="fx-btn lime">
              {s.status === 'FREE' || s.status === 'TRIAL' ? 'Ver planos' : 'Mudar de plano'}
            </Link>
            {late && (
              <button type="button" disabled={busy !== null} onClick={payNow} className="fx-btn" style={{ background: 'var(--fx-red)', color: '#fff' }}>
                {busy === 'pay' ? 'Abrindo...' : 'Pagar agora'}
              </button>
            )}
            {data.canResume && (
              <button type="button" disabled={busy !== null} onClick={resume} className="fx-btn ghost">
                <Play size={14} /> Voltar agora
              </button>
            )}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* O que inclui */}
          <section className={CARD} style={CARD_STYLE} aria-label="O que o plano inclui">
            <h2 className={H2} style={{ color: 'var(--text-primary)' }}>O que o seu plano inclui</h2>
            <ul className="flex flex-col gap-2">
              {enabledFeatures.map((f) => (
                <li key={f.key} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                  <Check size={14} className="mt-0.5 shrink-0" style={{ color: '#16a34a' }} />
                  {featureText(f)}
                </li>
              ))}
            </ul>
          </section>

          {/* Uso e créditos */}
          <section className={CARD} style={CARD_STYLE} aria-label="Uso da conta">
            <h2 className={H2} style={{ color: 'var(--text-primary)' }}>Uso</h2>
            <Meter label="Lojas" used={data.usage.stores} limit={data.usage.storesLimit} />
            <Meter label="Caixas" used={data.usage.pdvs} limit={data.usage.pdvsLimit} />
            <Meter label="Pessoas com acesso" used={data.usage.seats} limit={data.usage.seatsLimit} />
            <div className="mt-1 flex flex-col gap-1 rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {data.ai.available ?? data.ai.balance} créditos de IA para usar
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {data.ai.includedMonthly
                  ? `${data.ai.included ?? 0} de ${data.ai.includedMonthly} do plano neste mês (renovam todo mês) + ${data.ai.balance} comprados (não vencem).`
                  : `${data.ai.balance} comprados.`}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{data.confereBalance} leituras do Confere.</p>
              <Link to="/app/configuracoes" className="text-xs font-semibold text-green-700 hover:underline">Comprar mais créditos</Link>
            </div>
          </section>
        </div>

        {/* Adicionais */}
        <section className={CARD} style={CARD_STYLE} aria-label="Adicionais">
          <div>
            <h2 className={H2} style={{ color: 'var(--text-primary)' }}>Adicionais</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {data.canChangeAddons
                ? 'Cobrados na mesma assinatura. Mudou a quantidade, a próxima fatura já vem com o valor novo.'
                : s.paymentMethod === 'CARTAO'
                  ? 'Na assinatura pelo cartão, peça adicionais ao comercial (comercial@mercadoflow.com).'
                  : 'Para contratar adicionais, tenha uma assinatura ativa por Pix ou boleto.'}
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {data.addons.map((a) => (
              <li key={a.code} className="flex flex-wrap items-center gap-3 rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{a.name} · {brl(a.priceCents)}/mês</p>
                  {a.description && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{a.description}</p>}
                </div>
                <div className="flex items-center gap-2" role="group" aria-label={`Quantidade de ${a.name}`}>
                  <button type="button" aria-label={`Menos ${a.name}`} disabled={!data.canChangeAddons || busy !== null || a.quantity === 0}
                    onClick={() => setAddon(a, a.quantity - 1)} className="rounded-md p-1.5 disabled:opacity-40" style={{ border: '1px solid var(--border-soft)' }}>
                    <Minus size={14} />
                  </button>
                  <span className="w-6 text-center text-sm font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{a.quantity}</span>
                  <button type="button" aria-label={`Mais ${a.name}`} disabled={!data.canChangeAddons || busy !== null || a.quantity >= a.maxQuantity}
                    onClick={() => setAddon(a, a.quantity + 1)} className="rounded-md p-1.5 disabled:opacity-40" style={{ border: '1px solid var(--border-soft)' }}>
                    <Plus size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {paidAddons.length > 0 && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Plano {brl(data.plan.priceCents)} + adicionais {brl(paidAddons.reduce((t, a) => t + a.priceCents * a.quantity, 0))} = {brl(data.monthlyTotalCents)} por mês.
            </p>
          )}
        </section>

        {/* Faturas */}
        <section className={CARD} style={CARD_STYLE} aria-label="Faturas">
          <h2 className={H2} style={{ color: 'var(--text-primary)' }}>Faturas e notas fiscais</h2>
          {data.invoices.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {s.paymentMethod === 'CARTAO' ? 'As faturas do cartão ficam em "Gerenciar assinatura", na tela de planos.' : 'Nenhuma fatura ainda.'}
            </p>
          ) : (
            <ul className="flex flex-col divide-y" style={{ borderColor: 'var(--border-soft)' }}>
              {data.invoices.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                  <span className="w-24 tabular-nums">{day(i.dueDate)}</span>
                  <span className="w-24 font-semibold tabular-nums">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(i.value)}</span>
                  <span className="min-w-0 flex-1" style={{ color: i.status === 'OVERDUE' ? '#b91c1c' : 'var(--text-muted)' }}>
                    {INVOICE_STATUS[i.status] || i.status}{i.method ? ` · ${i.method === 'BOLETO' ? 'Boleto' : i.method === 'PIX' ? 'Pix' : i.method}` : ''}
                  </span>
                  {i.invoiceUrl && (
                    <a href={i.invoiceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline">
                      Fatura <ExternalLink size={12} />
                    </a>
                  )}
                  {i.nfseUrl && (
                    <a href={i.nfseUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline">
                      <FileText size={12} /> Nota fiscal
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pausar ou cancelar */}
        {(data.canCancel || data.canPause) && (
          <section className={CARD} style={CARD_STYLE} aria-label="Pausar ou cancelar">
            {!leaving ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="min-w-0 flex-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                  Precisa dar um tempo? Dá para pausar por 1 ou 2 meses sem perder nada, ou cancelar quando quiser.
                </p>
                <button type="button" onClick={() => setLeaving(true)} className="rounded-lg px-3 py-1.5 text-sm font-semibold"
                  style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}>
                  Pausar ou cancelar
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <h2 className={H2} style={{ color: 'var(--text-primary)' }}>Antes de ir: o que aconteceu?</h2>
                <fieldset className="grid gap-2 sm:grid-cols-2">
                  <legend className="sr-only">Motivo</legend>
                  {EXIT_REASONS.map((r) => (
                    <label key={r.code} className="flex items-center gap-2 rounded-lg p-2 text-sm" style={{ background: 'var(--surface-soft)', color: 'var(--text-primary)' }}>
                      <input type="radio" name="exit-reason" value={r.code} checked={reason === r.code} onChange={() => setReason(r.code)} />
                      {r.label}
                    </label>
                  ))}
                </fieldset>
                <label className="flex flex-col gap-1 text-sm" style={{ color: 'var(--text-primary)' }}>
                  Quer contar mais? (opcional)
                  <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={600}
                    className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-soft)' }} />
                </label>
                {data.canPause && (
                  <div className="flex flex-col gap-2 rounded-lg p-3" style={{ background: '#eef2ff' }}>
                    <p className="text-sm" style={{ color: '#3730a3' }}>
                      Uma pausa guarda tudo e não cobra nada nesse tempo. O que você já pagou continua valendo depois.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[1, 2].map((m) => (
                        <button key={m} type="button" disabled={busy !== null} onClick={() => pause(m)}
                          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
                          style={{ background: '#4f46e5', color: '#fff' }}>
                          <Pause size={14} /> {busy === 'pause' ? 'Pausando...' : m === 1 ? 'Pausar 1 mês' : 'Pausar 2 meses'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {data.canCancel && (
                    <button type="button" disabled={busy !== null || !reason} onClick={cancel}
                      className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50" style={{ border: '1px solid #fecaca', color: '#b91c1c' }}>
                      {busy === 'cancel' ? 'Cancelando...' : 'Cancelar assinatura'}
                    </button>
                  )}
                  <button type="button" onClick={() => setLeaving(false)} className="rounded-lg px-3 py-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                    Voltar
                  </button>
                </div>
                {!reason && data.canCancel && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Escolha um motivo para cancelar.</p>}
              </div>
            )}
          </section>
        )}
      </div>
    </Layout>
  );
};

export default MySubscription;
