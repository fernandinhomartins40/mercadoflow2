import React, { useCallback, useEffect, useState } from 'react';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import crmService, { CustomerTask, DunningLog, DunningRule } from '../services/crm.service';
import subscriptionService, { ReceivablesResponse, formatPrice } from '../services/subscription.service';
import {
  AlertTriangle,
  Check,
  Clock,
  Download,
  ExternalLink,
  Play,
  RefreshCw,
  Send,
  Zap,
} from 'lucide-react';

/**
 * Cobrança: inadimplência, régua automática e fila de follow-ups.
 *
 * Reúne o que precisa de ação hoje. A régua roda sozinha uma vez por dia; esta
 * tela mostra o que ela fez e permite disparar na hora.
 */

const fmtDate = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

const daysSince = (v?: string | null) => {
  if (!v) return 0;
  const d = new Date(v).getTime();
  return Number.isNaN(d) ? 0 : Math.floor((Date.now() - d) / 86400000);
};

const ACTION_LABEL: Record<string, string> = {
  RESEND_INVOICE: 'Reenviar fatura',
  CREATE_TASK: 'Abrir follow-up',
  NOTIFY_ADMIN: 'Alertar administrador',
  MARK_PAST_DUE: 'Marcar inadimplente',
};

const SuperAdminCollections: React.FC = () => {
  const [receivables, setReceivables] = useState<ReceivablesResponse | null>(null);
  const [rules, setRules] = useState<DunningRule[]>([]);
  const [logs, setLogs] = useState<DunningLog[]>([]);
  const [tasks, setTasks] = useState<CustomerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rec, ruleList, logList, taskList] = await Promise.all([
        subscriptionService.getReceivables().catch(() => null),
        crmService.listDunningRules().catch(() => [] as DunningRule[]),
        crmService.listDunningLogs().catch(() => [] as DunningLog[]),
        crmService.listTasks().catch(() => [] as CustomerTask[]),
      ]);
      setReceivables(rec);
      setRules(ruleList);
      setLogs(logList);
      setTasks(taskList);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runNow = async () => {
    setSaving(true);
    try {
      const result = await crmService.runDunning();
      setMessage(
        `Régua executada: ${result.invoicesChecked} fatura(s) verificada(s), `
        + `${result.actionsExecuted} ação(ões) aplicada(s).`,
      );
      await load();
    } catch (err: any) {
      setMessage(err?.message || 'Falha ao executar a régua.');
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (rule: DunningRule) => {
    setSaving(true);
    try {
      await crmService.saveDunningRule({ ...rule, isActive: !rule.isActive });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const complete = async (taskId: string) => {
    setSaving(true);
    try {
      await crmService.completeTask(taskId);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const summary = receivables?.summary;

  return (
    <SuperAdminLayout>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Cobrança
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Inadimplência, régua automática e follow-ups
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => crmService.downloadExport('overdue')}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
              style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
            >
              <Download size={14} />
              Exportar vencidas
            </button>
            <button
              type="button"
              onClick={runNow}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60"
              style={{ background: 'var(--brand-500, #22c55e)', color: '#fff' }}
            >
              <Play size={14} />
              Executar régua agora
            </button>
          </div>
        </div>

        {message && (
          <div
            className="flex items-center gap-2 rounded-xl p-3 text-sm"
            style={{ background: '#dcfce7', border: '1px solid #bbf7d0', color: '#15803d' }}
          >
            <Check size={16} />
            {message}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 p-6 text-sm" style={{ color: 'var(--text-muted)' }}>
            <RefreshCw size={16} className="animate-spin" />
            Carregando cobrança...
          </div>
        ) : (
          <>
            {summary && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  ['A receber', formatPrice(summary.openCents), `${summary.openCount} fatura(s)`, 'var(--text-primary)'],
                  ['Vencido', formatPrice(summary.overdueCents), `${summary.overdueCount} fatura(s)`, summary.overdueCents > 0 ? '#b91c1c' : 'var(--text-primary)'],
                  ['Pior atraso', `${summary.worstDelayDays} dias`, '', summary.worstDelayDays > 15 ? '#b91c1c' : 'var(--text-primary)'],
                  ['Recebido (30d)', formatPrice(summary.paidLast30DaysCents), '', '#15803d'],
                ].map(([label, value, hint, tone]) => (
                  <div
                    key={label as string}
                    className="flex flex-col gap-1 rounded-xl p-4"
                    style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
                  >
                    <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</div>
                    <div className="text-xl font-bold" style={{ color: tone as string }}>{value}</div>
                    {hint && <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{hint}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* Faturas vencidas */}
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                <AlertTriangle size={15} style={{ color: '#b45309' }} />
                Faturas vencidas
              </h2>
              {!receivables || receivables.overdue.length === 0 ? (
                <p className="rounded-xl p-4 text-sm" style={{ background: 'var(--surface-soft)', color: 'var(--text-muted)' }}>
                  Nenhuma fatura vencida.
                </p>
              ) : (
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
                          {formatPrice(invoice.amountDueCents)} · venceu {fmtDate(invoice.dueDate)} ·{' '}
                          <strong>{daysSince(invoice.dueDate)} dia(s)</strong>
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
                          Ver <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Follow-ups */}
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                <Clock size={15} />
                Follow-ups abertos ({tasks.length})
              </h2>
              {tasks.length === 0 ? (
                <p className="rounded-xl p-4 text-sm" style={{ background: 'var(--surface-soft)', color: 'var(--text-muted)' }}>
                  Nenhum follow-up pendente.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {tasks.slice(0, 20).map((task) => {
                    const overdue = task.dueDate && new Date(task.dueDate) < new Date();
                    return (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 rounded-xl p-3"
                        style={{
                          background: overdue ? '#fffbeb' : 'var(--surface-base)',
                          border: '1px solid var(--border-soft)',
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {task.title}
                          </div>
                          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {task.market?.name} · {task.dueDate ? `prazo ${fmtDate(task.dueDate)}` : 'sem prazo'}
                            {task.priority === 'HIGH' && ' · alta'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => complete(task.id)}
                          disabled={saving}
                          className="rounded-lg px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
                          style={{ background: '#dcfce7', color: '#15803d' }}
                        >
                          <Check size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Régua */}
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                <Zap size={15} />
                Régua de cobrança
              </h2>
              <p className="mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                Executada automaticamente todo dia às 9h. Nenhuma regra bloqueia acesso — a suspensão
                é sempre uma decisão sua.
              </p>
              <div className="flex flex-col gap-2">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl p-3"
                    style={{
                      background: 'var(--surface-base)',
                      border: '1px solid var(--border-soft)',
                      opacity: rule.isActive ? 1 : 0.5,
                    }}
                  >
                    <span
                      className="rounded px-2 py-0.5 text-[11px] font-bold"
                      style={{ background: 'var(--surface-soft)', color: 'var(--text-primary)' }}
                    >
                      {rule.daysOffset === 0
                        ? 'no vencimento'
                        : rule.daysOffset < 0
                          ? `${Math.abs(rule.daysOffset)}d antes`
                          : `${rule.daysOffset}d depois`}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {rule.name}
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {ACTION_LABEL[rule.action] || rule.action}
                        {rule.message && ` · "${rule.message}"`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleRule(rule)}
                      disabled={saving}
                      className="rounded-lg px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
                      style={{ border: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}
                    >
                      {rule.isActive ? 'Ativa' : 'Inativa'}
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Histórico da régua */}
            {logs.length > 0 && (
              <section>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  <Send size={15} />
                  O que a régua já fez
                </h2>
                <div
                  className="overflow-x-auto rounded-xl"
                  style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
                >
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr style={{ color: 'var(--text-muted)' }}>
                        <th className="px-3 py-2 font-semibold">Quando</th>
                        <th className="px-3 py-2 font-semibold">Ação</th>
                        <th className="px-3 py-2 font-semibold">Detalhe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.slice(0, 20).map((log) => (
                        <tr key={log.id} style={{ borderTop: '1px solid var(--border-soft)' }}>
                          <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                            {fmtDate(log.executedAt)}
                          </td>
                          <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>
                            {ACTION_LABEL[log.action] || log.action}
                          </td>
                          <td className="px-3 py-2" style={{ color: log.success ? 'var(--text-muted)' : '#b91c1c' }}>
                            {log.detail}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminCollections;
