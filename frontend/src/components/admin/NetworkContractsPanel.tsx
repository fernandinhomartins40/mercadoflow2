import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  Clock,
  ExternalLink,
  FileText,
  Plus,
  RefreshCw,
  Send,
  Wallet,
  X,
} from 'lucide-react';
import subscriptionService, {
  NetworkContract,
  NetworkInvoice,
  ReceivablesResponse,
  SubscriptionRow,
  formatPrice,
} from '../../services/subscription.service';

/**
 * Contratos sob medida (plano Rede) e cobrança por fatura.
 *
 * O valor e os limites são negociados aqui; o Stripe emite a fatura mensal com
 * boleto e a envia por e-mail. A baixa é automática: quando o boleto compensa,
 * o Stripe avisa por webhook no dia útil seguinte.
 */

const fmtDate = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

const daysBetween = (from?: string | null) => {
  if (!from) return 0;
  const d = new Date(from).getTime();
  return Number.isNaN(d) ? 0 : Math.floor((Date.now() - d) / 86400000);
};

const parsePrice = (input: string): number | null => {
  const normalized = input.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
};

const parseLimit = (input: string): number | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed === '-1' || trimmed.toLowerCase() === 'ilimitado') return -1;
  const value = Number(trimmed.replace(/\D/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
};

const INVOICE_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  draft: { label: 'Rascunho', bg: '#f1f5f9', color: '#475569' },
  open: { label: 'Em aberto', bg: '#fef3c7', color: '#92400e' },
  paid: { label: 'Paga', bg: '#dcfce7', color: '#15803d' },
  void: { label: 'Cancelada', bg: '#f1f5f9', color: '#64748b' },
  uncollectible: { label: 'Incobrável', bg: '#fee2e2', color: '#b91c1c' },
};

interface ContractFormState {
  marketId: string;
  marketName: string;
  price: string;
  daysUntilDue: string;
  invoiceLimit: string;
  branchLimit: string;
  pdvPerBranchLimit: string;
  pdvLimit: string;
  seatLimit: string;
  contactName: string;
  contactEmail: string;
  notes: string;
}

const emptyForm = (marketId: string, marketName: string): ContractFormState => ({
  marketId,
  marketName,
  price: '',
  daysUntilDue: '15',
  invoiceLimit: '',
  branchLimit: '',
  pdvPerBranchLimit: '',
  pdvLimit: '',
  seatLimit: '',
  contactName: '',
  contactEmail: '',
  notes: '',
});

interface Props {
  /** Contas disponíveis para receber contrato — vem da aba de assinaturas. */
  markets: SubscriptionRow[];
}

const NetworkContractsPanel: React.FC<Props> = ({ markets }) => {
  const [contracts, setContracts] = useState<NetworkContract[]>([]);
  const [receivables, setReceivables] = useState<ReceivablesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const [form, setForm] = useState<ContractFormState | null>(null);
  const [invoicesOf, setInvoicesOf] = useState<{ name: string; rows: NetworkInvoice[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, rec] = await Promise.all([
        subscriptionService.getContracts(),
        subscriptionService.getReceivables().catch(() => null),
      ]);
      setContracts(list.filter((c) => c.status === 'ACTIVE'));
      setReceivables(rec);
    } catch (err: any) {
      setMessage({ text: err?.message || 'Falha ao carregar contratos.', tone: 'warn' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Contas sem contrato ativo: candidatas a virar rede.
  const availableMarkets = useMemo(() => {
    const withContract = new Set(contracts.map((c) => c.market?.id));
    return markets.filter((m) => !withContract.has(m.marketId) && !m.parentMarketId);
  }, [markets, contracts]);

  const submit = async () => {
    if (!form) return;
    const cents = parsePrice(form.price);
    if (cents === null) {
      setMessage({ text: 'Informe um valor mensal válido (ex.: 1.250,00).', tone: 'warn' });
      return;
    }

    setSaving(true);
    try {
      const result = await subscriptionService.saveContract(form.marketId, {
        monthlyPriceCents: cents,
        daysUntilDue: Number(form.daysUntilDue) || 15,
        invoiceLimit: parseLimit(form.invoiceLimit),
        branchLimit: parseLimit(form.branchLimit),
        pdvPerBranchLimit: parseLimit(form.pdvPerBranchLimit),
        pdvLimit: parseLimit(form.pdvLimit),
        seatLimit: parseLimit(form.seatLimit),
        contactName: form.contactName || undefined,
        contactEmail: form.contactEmail || undefined,
        notes: form.notes || undefined,
      });
      setForm(null);
      await load();
      setMessage(
        result.warning
          ? { text: result.warning, tone: 'warn' }
          : { text: 'Contrato salvo e cobrança configurada no Stripe.', tone: 'ok' },
      );
    } catch (err: any) {
      setMessage({ text: err?.message || 'Falha ao salvar o contrato.', tone: 'warn' });
    } finally {
      setSaving(false);
    }
  };

  const openInvoices = async (contract: NetworkContract) => {
    if (!contract.market) return;
    try {
      const rows = await subscriptionService.getMarketInvoices(contract.market.id);
      setInvoicesOf({ name: contract.market.name, rows });
    } catch (err: any) {
      setMessage({ text: err?.message || 'Falha ao carregar faturas.', tone: 'warn' });
    }
  };

  const resend = async (invoiceId: string) => {
    setSaving(true);
    try {
      const result = await subscriptionService.resendInvoice(invoiceId);
      setMessage(
        result.warning
          ? { text: result.warning, tone: 'warn' }
          : { text: 'Fatura reenviada por e-mail.', tone: 'ok' },
      );
    } catch (err: any) {
      setMessage({ text: err?.message || 'Falha ao reenviar.', tone: 'warn' });
    } finally {
      setSaving(false);
    }
  };

  const endContract = async (contract: NetworkContract) => {
    if (!contract.market) return;
    if (!window.confirm(`Encerrar o contrato de ${contract.market.name}? A cobrança será cancelada.`)) {
      return;
    }
    setSaving(true);
    try {
      const result = await subscriptionService.endContract(contract.market.id, false, 'Encerrado pelo painel');
      await load();
      setMessage(
        result.warning
          ? { text: result.warning, tone: 'warn' }
          : { text: 'Contrato encerrado; cobrança cancelada ao fim do período.', tone: 'ok' },
      );
    } catch (err: any) {
      setMessage({ text: err?.message || 'Falha ao encerrar.', tone: 'warn' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        <RefreshCw size={16} className="animate-spin" />
        Carregando contratos...
      </div>
    );
  }

  const summary = receivables?.summary;

  return (
    <div className="flex flex-col gap-5">
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

      {/* Contas a receber */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl p-4" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Wallet size={13} /> A receber
            </div>
            <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {formatPrice(summary.openCents)}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {summary.openCount} fatura(s) em aberto
            </div>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <AlertTriangle size={13} /> Vencido
            </div>
            <div className="text-xl font-bold" style={{ color: summary.overdueCents > 0 ? '#b45309' : 'var(--text-primary)' }}>
              {formatPrice(summary.overdueCents)}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {summary.overdueCount} fatura(s)
              {summary.worstDelayDays > 0 && ` · pior atraso ${summary.worstDelayDays}d`}
            </div>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Check size={13} /> Recebido (30d)
            </div>
            <div className="text-xl font-bold" style={{ color: '#15803d' }}>
              {formatPrice(summary.paidLast30DaysCents)}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {formatPrice(summary.paidLast90DaysCents)} em 90 dias
            </div>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Building2 size={13} /> Redes ativas
            </div>
            <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {contracts.length}
            </div>
          </div>
        </div>
      )}

      {/* Inadimplência */}
      {receivables && receivables.overdue.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: '#b45309' }}>
            <Clock size={15} />
            Faturas vencidas
          </h3>
          <div className="flex flex-col gap-2">
            {receivables.overdue.map((invoice) => (
              <div
                key={invoice.id}
                className="flex flex-wrap items-center gap-3 rounded-xl p-3"
                style={{ background: '#fffbeb', border: '1px solid #fde68a' }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold" style={{ color: '#92400e' }}>
                    {invoice.market?.name || '—'}
                  </div>
                  <div className="text-[11px]" style={{ color: '#92400e', opacity: 0.85 }}>
                    {formatPrice(invoice.amountDueCents)} · venceu em {fmtDate(invoice.dueDate)} ·{' '}
                    <strong>{daysBetween(invoice.dueDate)} dia(s) de atraso</strong>
                  </div>
                </div>
                {invoice.hostedInvoiceUrl && (
                  <a
                    href={invoice.hostedInvoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                    style={{ background: 'var(--surface-base)', color: '#92400e' }}
                  >
                    Ver boleto <ExternalLink size={11} />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => resend(invoice.id)}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
                  style={{ background: '#b45309', color: '#fff' }}
                >
                  <Send size={11} /> Reenviar
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Contratos */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            Contratos de rede
          </h3>
          {availableMarkets.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const market = availableMarkets.find((m) => m.marketId === e.target.value);
                if (market) setForm(emptyForm(market.marketId, market.marketName));
              }}
              className="rounded-lg px-3 py-2 text-xs"
              style={{
                border: '1px solid var(--border-soft)',
                background: 'var(--surface-base)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="">+ Novo contrato de rede...</option>
              {availableMarkets.map((m) => (
                <option key={m.marketId} value={m.marketId}>
                  {m.marketName}
                </option>
              ))}
            </select>
          )}
        </div>

        {contracts.length === 0 ? (
          <p className="rounded-xl p-4 text-sm" style={{ background: 'var(--surface-soft)', color: 'var(--text-muted)' }}>
            Nenhum contrato de rede ativo. Escolha uma conta acima para definir valor e limites sob medida.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {contracts.map((contract) => (
              <div
                key={contract.id}
                className="flex flex-wrap items-center gap-3 rounded-xl p-3"
                style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {contract.market?.name || '—'}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {formatPrice(contract.monthlyPriceCents)}/mês · vence em {contract.daysUntilDue} dias ·
                    desde {fmtDate(contract.startedAt)}
                    {contract.contactEmail && ` · fatura para ${contract.contactEmail}`}
                  </div>
                  {!contract.stripeSubscriptionId && (
                    <div className="mt-1 text-[11px]" style={{ color: '#b45309' }}>
                      Sem cobrança ativa no Stripe
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openInvoices(contract)}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                  style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
                >
                  <FileText size={12} /> Faturas
                </button>
                <button
                  type="button"
                  onClick={() =>
                    contract.market
                      && setForm({
                        ...emptyForm(contract.market.id, contract.market.name),
                        price: (contract.monthlyPriceCents / 100).toFixed(2).replace('.', ','),
                        daysUntilDue: String(contract.daysUntilDue),
                        invoiceLimit: contract.invoiceLimit != null ? String(contract.invoiceLimit) : '',
                        branchLimit: contract.branchLimit != null ? String(contract.branchLimit) : '',
                        pdvPerBranchLimit: contract.pdvPerBranchLimit != null ? String(contract.pdvPerBranchLimit) : '',
                        pdvLimit: contract.pdvLimit != null ? String(contract.pdvLimit) : '',
                        seatLimit: contract.seatLimit != null ? String(contract.seatLimit) : '',
                        contactName: contract.contactName || '',
                        contactEmail: contract.contactEmail || '',
                        notes: contract.notes || '',
                      })
                  }
                  className="rounded-lg px-2.5 py-1 text-[11px] font-medium"
                  style={{ border: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => endContract(contract)}
                  disabled={saving}
                  className="rounded-lg px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
                  style={{ border: '1px solid #fecaca', color: '#b91c1c' }}
                >
                  Encerrar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Formulário de contrato */}
      {form && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.5)' }}
          onClick={() => setForm(null)}
        >
          <div
            className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl p-5"
            style={{ background: 'var(--surface-base)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
              Contrato de rede — {form.marketName}
            </h3>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              O Stripe emite a fatura mensal com boleto e envia por e-mail. Deixe um limite em branco
              para herdar o padrão, ou use <strong>-1</strong> para ilimitado.
            </p>

            <div className="mt-4 grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Valor mensal (R$) *
                  </label>
                  <input
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="1.250,00"
                    inputMode="decimal"
                    autoFocus
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Vencimento (dias)
                  </label>
                  <input
                    value={form.daysUntilDue}
                    onChange={(e) => setForm({ ...form, daysUntilDue: e.target.value })}
                    inputMode="numeric"
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                Limites contratados
              </p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['invoiceLimit', 'Notas/mês'],
                  ['branchLimit', 'Lojas'],
                  ['pdvPerBranchLimit', 'PDVs por loja'],
                  ['pdvLimit', 'PDVs no total'],
                  ['seatLimit', 'Usuários'],
                ] as const).map(([field, label]) => (
                  <div key={field}>
                    <label className="mb-1 block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {label}
                    </label>
                    <input
                      value={form[field]}
                      onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                      placeholder="-1 = ilimitado"
                      className="w-full rounded-lg px-3 py-2 text-sm"
                      style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Contato
                  </label>
                  <input
                    value={form.contactName}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    E-mail da fatura
                  </label>
                  <input
                    value={form.contactEmail}
                    onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                    type="email"
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Observações
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold disabled:opacity-60"
                style={{ background: 'var(--brand-500, #22c55e)', color: '#fff' }}
              >
                <Plus size={14} />
                {saving ? 'Salvando...' : 'Salvar e cobrar'}
              </button>
              <button
                type="button"
                onClick={() => setForm(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium"
                style={{ border: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Faturas da rede */}
      {invoicesOf && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.5)' }}
          onClick={() => setInvoicesOf(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl p-5"
            style={{ background: 'var(--surface-base)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
              Faturas — {invoicesOf.name}
            </h3>

            {invoicesOf.rows.length === 0 ? (
              <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                Nenhuma fatura emitida ainda. A primeira sai no próximo ciclo.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr style={{ color: 'var(--text-muted)' }}>
                      <th className="px-2 py-2 font-semibold">Número</th>
                      <th className="px-2 py-2 font-semibold">Valor</th>
                      <th className="px-2 py-2 font-semibold">Status</th>
                      <th className="px-2 py-2 font-semibold">Vencimento</th>
                      <th className="px-2 py-2 font-semibold">Pago em</th>
                      <th className="px-2 py-2 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {invoicesOf.rows.map((invoice) => {
                      const meta = INVOICE_STATUS[invoice.status] ?? INVOICE_STATUS.draft;
                      return (
                        <tr key={invoice.id} style={{ borderTop: '1px solid var(--border-soft)' }}>
                          <td className="px-2 py-2" style={{ color: 'var(--text-primary)' }}>
                            {invoice.invoiceNumber || '—'}
                          </td>
                          <td className="px-2 py-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {formatPrice(invoice.amountDueCents)}
                          </td>
                          <td className="px-2 py-2">
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                              style={{ background: meta.bg, color: meta.color }}
                            >
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-2 py-2" style={{ color: 'var(--text-muted)' }}>
                            {fmtDate(invoice.dueDate)}
                          </td>
                          <td className="px-2 py-2" style={{ color: 'var(--text-muted)' }}>
                            {fmtDate(invoice.paidAt)}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {invoice.hostedInvoiceUrl && (
                              <a
                                href={invoice.hostedInvoiceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] font-semibold underline"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                abrir
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <button
              type="button"
              onClick={() => setInvoicesOf(null)}
              className="mt-4 w-full rounded-lg py-2 text-sm font-semibold"
              style={{ background: 'var(--surface-soft)', color: 'var(--text-primary)' }}
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NetworkContractsPanel;
