import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle, Clock, Lock, X } from 'lucide-react';
import subscriptionService, { MarketSubscription, SUBSCRIPTION_CHANGED } from '../../services/subscription.service';
import { useAuth } from '../../context/AuthContext';

/**
 * Faixa da assinatura no topo do app: teste grátis correndo, pagamento em
 * atraso ou conta só para consulta. Sem nada a dizer, não aparece.
 *
 * O aviso informativo (teste com folga) pode ser fechado nesta sessão; atraso
 * e restrição ficam, porque pedem uma ação.
 */

const DISMISS_KEY = 'mf.subscriptionBanner.dismissed';

const PALETTE = {
  INFO: { bg: 'var(--surface-soft)', border: 'var(--border-soft)', text: 'var(--text-primary)', accent: 'var(--brand-600, #16a34a)' },
  WARNING: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', accent: '#d97706' },
  DANGER: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', accent: '#dc2626' },
} as const;

const readDismissed = () => {
  try {
    return sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
};

const SubscriptionBanner: React.FC = () => {
  const { marketId } = useAuth();
  const location = useLocation();
  const [sub, setSub] = useState<MarketSubscription | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(readDismissed);

  useEffect(() => {
    if (!marketId) return;
    let cancelled = false;
    const load = () => {
      subscriptionService
        .getSubscription(marketId)
        .then((data) => {
          if (!cancelled) setSub(data);
        })
        .catch(() => {
          // A faixa é acessória: falhar aqui não deve atrapalhar a tela.
        });
    };
    load();
    window.addEventListener(SUBSCRIPTION_CHANGED, load);
    return () => {
      cancelled = true;
      window.removeEventListener(SUBSCRIPTION_CHANGED, load);
    };
  }, [marketId]);

  if (!sub?.bannerMessage || !sub.bannerTone) return null;
  const tone = sub.bannerTone;
  const signature = `${sub.status}:${sub.daysLeft ?? ''}`;
  if (tone === 'INFO' && dismissed === signature) return null;

  const colors = PALETTE[tone];
  const Icon = sub.status === 'RESTRICTED' ? Lock : sub.status === 'TRIAL' ? Clock : AlertTriangle;
  const target = sub.bannerAction === 'Pagar agora' ? '/app/assinatura' : '/app/planos';
  const onPlans = location.pathname === target;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, signature);
    } catch {
      // sem armazenamento: fecha só até recarregar
    }
    setDismissed(signature);
  };

  return (
    <div
      role={tone === 'INFO' ? 'status' : 'alert'}
      className="flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5"
      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
      data-testid="subscription-banner"
    >
      <Icon size={18} className="shrink-0" style={{ color: colors.accent }} />
      <p className="min-w-0 flex-1 text-sm" style={{ color: colors.text }}>
        {sub.bannerMessage}
      </p>
      {sub.bannerAction && !onPlans && (
        <Link
          to={target}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold"
          style={{ background: colors.accent, color: '#fff' }}
        >
          {sub.bannerAction}
        </Link>
      )}
      {tone === 'INFO' && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fechar aviso"
          className="rounded-md p-1"
          style={{ color: colors.text }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};

export default SubscriptionBanner;
