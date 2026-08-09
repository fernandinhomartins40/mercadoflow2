import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CreditCard,
  Pencil,
  RefreshCw,
  TrendingUp,
  X,
} from 'lucide-react';
import subscriptionService, {
  PlanCatalogEntry,
  PlanCode,
  PlanPriceHistoryEntry,
  formatLimit,
  formatPrice,
} from '../../services/subscription.service';

/**
 * Catálogo de planos editável, com sincronização para o Stripe.
 *
 * Alterar o preço aqui cria um novo Price no Stripe automaticamente — o painel
 * é a fonte de verdade, e não é preciso abrir o painel deles.
 */

const fmtDate = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

const parsePrice = (input: string): number | null => {
  const normalized = input.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
};

interface PriceDialogState {
  plan: PlanCatalogEntry;
  input: string;
  migrate: boolean;
  reason: string;
}

const PlanCatalogPanel: React.FC = () => {
  const [plans, setPlans] = useState<PlanCatalogEntry[]>([]);
  const [history, setHistory] = useState<PlanPriceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const [dialog, setDialog] = useState<PriceDialogState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catalog, priceHistory] = await Promise.all([
        subscriptionService.getCatalog(),
        subscriptionService.getPriceHistory().catch(() => [] as PlanPriceHistoryEntry[]),
      ]);
      setPlans(catalog);
      setHistory(priceHistory);
    } catch (err: any) {
      setMessage({ text: err?.message || 'Falha ao carregar os planos.', tone: 'warn' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applyPrice = async () => {
    if (!dialog) return;
    const cents = parsePrice(dialog.input);
    if (cents === null) {
      setMessage({ text: 'Valor inválido. Use o formato 197,00.', tone: 'warn' });
      return;
    }

    setSaving(true);
    try {
      const result = await subscriptionService.changePlanPrice(
        dialog.plan.code,
        cents,
        dialog.migrate,
        dialog.reason || undefined,
      );
      setDialog(null);
      await load();

      if (result.warning) {
        setMessage({ text: result.warning, tone: 'warn' });
      } else {
        const migrated = result.migratedSubscriptions > 0
          ? ` ${result.migratedSubscriptions} assinatura(s) migrada(s).`
          : ' Vale para novas contratações.';
        setMessage({ text: `Preço atualizado no sistema e no Stripe.${migrated}`, tone: 'ok' });
      }
    } catch (err: any) {
      setMessage({ text: err?.message || 'Falha ao alterar o preço.', tone: 'warn' });
    } finally {
      setSaving(false);
    }
  };

  const syncStripe = async () => {
    setSaving(true);
    try {
      const results = await subscriptionService.syncCatalogToStripe();
      setMessage({ text: results.join(' · ') || 'Nada a sincronizar.', tone: 'ok' });
      await load();
    } catch (err: any) {
      setMessage({ text: err?.message || 'Falha ao sincronizar com o Stripe.', tone: 'warn' });
    } finally {
      setSaving(false);
    }
  };

  const toggleField = async (plan: PlanCatalogEntry, field: 'purchasable' | 'isActive') => {
    setSaving(true);
    try {
      await subscriptionService.updatePlan(plan.code, { [field]: !plan[field] } as any);
      await load();
    } catch (err: any) {
      setMessage({ text: err?.message || 'Falha ao atualizar o plano.', tone: 'warn' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        <RefreshCw size={16} className="animate-spin" />
        Carregando planos...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Alterar o preço cria um novo valor no Stripe automaticamente.
        </p>
        <button
          type="button"
          onClick={syncStripe}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60"
          style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
          title="Cria no Stripe os produtos e preços dos planos que ainda não têm"
        >
          <RefreshCw size={13} />
          Sincronizar com o Stripe
        </button>
      </div>

      {message && (
        <div
          className="flex items-start gap-2 rounded-xl p-3 text-sm"
          style={
            message.tone === 'ok'
              ? { background: '#dcfce7', border: '1px solid #bbf7d0', color: '#15803d' }
              : { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }
          }
        >
          {message.tone === 'ok' ? <Check size={16} /> : <AlertTriangle size={16} />}
          <span className="flex-1">{message.text}</span>
          <button type="button" onClick={() => setMessage(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {plans.map((plan) => (
          <div
            key={plan.code}
            className="flex flex-col gap-3 rounded-xl p-4"
            style={{
              background: 'var(--surface-base)',
              border: '1px solid var(--border-soft)',
              opacity: plan.isActive ? 1 : 0.6,
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {plan.displayName}
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {plan.description || plan.code}
                </p>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                  {formatPrice(plan.monthlyPriceCents)}
                </div>
                {plan.priceChangedAt && (
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    alterado em {fmtDate(plan.priceChangedAt)}
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <span>{formatLimit(plan.monthlyInvoiceLimit)} notas/mês</span>
              <span>
                {formatLimit(plan.branchLimit)} loja(s) · {formatLimit(plan.pdvPerBranchLimit)} PDV(s) por loja ·{' '}
                {formatLimit(plan.pdvLimit)} no total
              </span>
              <span>
                {formatLimit(plan.userSeatLimit)} usuário(s) ·{' '}
                {formatLimit(plan.historyRetentionDays)} dias de histórico
              </span>
              <span>{plan.fullInsights ? 'Inteligência completa' : 'Prévia da inteligência'}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              {plan.stripePriceId ? (
                <span
                  className="rounded px-1.5 py-0.5 font-mono"
                  style={{ background: '#dcfce7', color: '#15803d' }}
                  title="Preço vinculado no Stripe"
                >
                  {plan.stripePriceId.slice(0, 20)}…
                </span>
              ) : (
                <span
                  className="rounded px-1.5 py-0.5"
                  style={{ background: '#fef3c7', color: '#92400e' }}
                >
                  sem preço no Stripe
                </span>
              )}
            </div>

            <div className="mt-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setDialog({
                    plan,
                    input: plan.monthlyPriceCents > 0
                      ? (plan.monthlyPriceCents / 100).toFixed(2).replace('.', ',')
                      : '',
                    migrate: false,
                    reason: '',
                  })
                }
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
              >
                <Pencil size={12} />
                Alterar preço
              </button>
              <button
                type="button"
                onClick={() => toggleField(plan, 'purchasable')}
                disabled={saving}
                className="rounded-lg px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
                style={{ border: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}
              >
                {plan.purchasable ? 'Vendável online' : 'Só sob consulta'}
              </button>
              <button
                type="button"
                onClick={() => toggleField(plan, 'isActive')}
                disabled={saving}
                className="rounded-lg px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
                style={{ border: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}
              >
                {plan.isActive ? 'Ativo' : 'Inativo'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {history.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            <TrendingUp size={15} />
            Histórico de preços
          </h3>
          <div
            className="overflow-x-auto rounded-xl"
            style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
          >
            <table className="w-full text-left text-xs">
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th className="px-3 py-2 font-semibold">Data</th>
                  <th className="px-3 py-2 font-semibold">Plano</th>
                  <th className="px-3 py-2 font-semibold">De</th>
                  <th className="px-3 py-2 font-semibold">Para</th>
                  <th className="px-3 py-2 font-semibold">Migradas</th>
                  <th className="px-3 py-2 font-semibold">Por</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 15).map((row) => (
                  <tr key={row.id} style={{ borderTop: '1px solid var(--border-soft)' }}>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{fmtDate(row.createdAt)}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>{row.planCode}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{formatPrice(row.fromPriceCents)}</td>
                    <td className="px-3 py-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{formatPrice(row.toPriceCents)}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{row.migratedCount}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{row.actorEmail || 'sistema'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Diálogo de alteração de preço */}
      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.5)' }}
          onClick={() => setDialog(null)}
        >
          <div
            className="w-full max-w-md rounded-xl p-5"
            style={{ background: 'var(--surface-base)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
              Alterar preço — {dialog.plan.displayName}
            </h3>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              Valor atual: {formatPrice(dialog.plan.monthlyPriceCents)}
            </p>

            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Novo valor mensal (R$)
                </label>
                <input
                  value={dialog.input}
                  onChange={(e) => setDialog({ ...dialog, input: e.target.value })}
                  placeholder="197,00"
                  inputMode="decimal"
                  autoFocus
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{
                    border: '1px solid var(--border-strong)',
                    background: 'var(--surface-base)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <label className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={dialog.migrate}
                  onChange={(e) => setDialog({ ...dialog, migrate: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <strong style={{ color: 'var(--text-primary)' }}>Migrar quem já assina</strong>
                  <br />
                  Sem marcar, o novo valor vale só para novas contratações e os
                  assinantes atuais seguem no preço contratado.
                </span>
              </label>

              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Motivo (opcional)
                </label>
                <input
                  value={dialog.reason}
                  onChange={(e) => setDialog({ ...dialog, reason: e.target.value })}
                  placeholder="Ex.: reajuste anual"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{
                    border: '1px solid var(--border-strong)',
                    background: 'var(--surface-base)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={applyPrice}
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold disabled:opacity-60"
                style={{ background: 'var(--brand-500, #22c55e)', color: '#fff' }}
              >
                <CreditCard size={14} />
                {saving ? 'Aplicando...' : 'Aplicar'}
              </button>
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium"
                style={{ border: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanCatalogPanel;
