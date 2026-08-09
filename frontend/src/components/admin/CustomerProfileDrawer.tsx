import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  Check,
  ExternalLink,
  FileText,
  HeartPulse,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  User,
  X,
} from 'lucide-react';
import crmService, {
  ActivityType,
  CustomerProfile,
  HealthBand,
  TaskPriority,
} from '../../services/crm.service';
import { formatLimit, formatPrice } from '../../services/subscription.service';

/**
 * Ficha 360 de um cliente.
 *
 * Reúne num só lugar o que estava espalhado entre quatro abas — assinatura,
 * consumo, faturas, histórico e follow-ups — para que a decisão comercial não
 * dependa de cruzar telas de cabeça.
 */

const fmtDate = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

const fmtDateTime = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const HEALTH: Record<HealthBand, { label: string; bg: string; color: string }> = {
  SAUDAVEL: { label: 'Saudável', bg: '#dcfce7', color: '#15803d' },
  ATENCAO: { label: 'Atenção', bg: '#fef3c7', color: '#92400e' },
  RISCO: { label: 'Risco', bg: '#fee2e2', color: '#b91c1c' },
};

const ACTIVITY_META: Record<ActivityType, { label: string; icon: React.ReactNode }> = {
  NOTE: { label: 'Anotação', icon: <MessageSquare size={12} /> },
  CALL: { label: 'Ligação', icon: <Phone size={12} /> },
  EMAIL: { label: 'E-mail', icon: <Mail size={12} /> },
  MEETING: { label: 'Reunião', icon: <Calendar size={12} /> },
  WHATSAPP: { label: 'WhatsApp', icon: <MessageSquare size={12} /> },
  PLAN_CHANGE: { label: 'Plano', icon: <RefreshCw size={12} /> },
  PAYMENT: { label: 'Pagamento', icon: <Check size={12} /> },
  INVOICE_SENT: { label: 'Fatura', icon: <FileText size={12} /> },
  LIMIT_REACHED: { label: 'Limite', icon: <AlertTriangle size={12} /> },
  SIGNUP: { label: 'Cadastro', icon: <User size={12} /> },
};

const INVOICE_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  draft: { label: 'Rascunho', bg: '#f1f5f9', color: '#475569' },
  open: { label: 'Em aberto', bg: '#fef3c7', color: '#92400e' },
  paid: { label: 'Paga', bg: '#dcfce7', color: '#15803d' },
  void: { label: 'Cancelada', bg: '#f1f5f9', color: '#64748b' },
  uncollectible: { label: 'Incobrável', bg: '#fee2e2', color: '#b91c1c' },
};

type Tab = 'resumo' | 'faturas' | 'historico' | 'tarefas';

interface Props {
  marketId: string;
  onClose: () => void;
  onChanged?: () => void;
}

const CustomerProfileDrawer: React.FC<Props> = ({ marketId, onClose, onChanged }) => {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [tab, setTab] = useState<Tab>('resumo');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [noteType, setNoteType] = useState<ActivityType>('NOTE');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('NORMAL');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProfile(await crmService.getCustomer(marketId));
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar a ficha do cliente.');
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addNote = async () => {
    if (!noteTitle.trim()) return;
    setSaving(true);
    try {
      await crmService.addActivity(marketId, {
        activityType: noteType,
        title: noteTitle.trim(),
        body: noteBody.trim() || undefined,
      });
      setNoteTitle('');
      setNoteBody('');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao registrar.');
    } finally {
      setSaving(false);
    }
  };

  const addTask = async () => {
    if (!taskTitle.trim()) return;
    setSaving(true);
    try {
      await crmService.createTask(marketId, {
        title: taskTitle.trim(),
        dueDate: taskDue || undefined,
        priority: taskPriority,
      });
      setTaskTitle('');
      setTaskDue('');
      await load();
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || 'Falha ao criar o follow-up.');
    } finally {
      setSaving(false);
    }
  };

  const completeTask = async (taskId: string) => {
    setSaving(true);
    try {
      await crmService.completeTask(taskId);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const health = profile?.health;
  const healthMeta = health ? HEALTH[health.band] ?? HEALTH.ATENCAO : null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: 'rgba(15,23,42,0.5)' }}
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-2xl flex-col overflow-y-auto"
        style={{ background: 'var(--surface-base)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {loading && !profile ? (
          <div className="flex items-center gap-2 p-6 text-sm" style={{ color: 'var(--text-muted)' }}>
            <RefreshCw size={16} className="animate-spin" />
            Carregando ficha...
          </div>
        ) : !profile ? (
          <div className="p-6">
            <p className="text-sm" style={{ color: '#b91c1c' }}>{error || 'Cliente não encontrado.'}</p>
            <button type="button" onClick={onClose} className="mt-3 text-sm underline">Fechar</button>
          </div>
        ) : (
          <>
            {/* Cabeçalho */}
            <div className="sticky top-0 z-10 border-b p-5" style={{ background: 'var(--surface-base)', borderColor: 'var(--border-soft)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    {profile.name}
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {[profile.cnpj, profile.city && `${profile.city}/${profile.state}`]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                </div>
                <button type="button" onClick={onClose} style={{ color: 'var(--text-muted)' }}>
                  <X size={18} />
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {healthMeta && health && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                    style={{ background: healthMeta.bg, color: healthMeta.color }}
                  >
                    <HeartPulse size={11} />
                    {healthMeta.label} {health.score}/100
                  </span>
                )}
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ background: 'var(--surface-soft)', color: 'var(--text-muted)' }}
                >
                  {profile.planName}
                </span>
                {profile.monthlyPriceCents > 0 && (
                  <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                    {formatPrice(profile.monthlyPriceCents)}/mês
                  </span>
                )}
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  cliente há {Math.max(0, Math.floor(profile.customerDays / 30))} meses
                </span>
              </div>

              {health && health.reasons.length > 0 && (
                <ul className="mt-2 flex flex-col gap-0.5">
                  {health.reasons.map((reason) => (
                    <li key={reason} className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      · {reason}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex gap-1 rounded-xl p-1" style={{ background: 'var(--surface-soft)' }}>
                {([
                  ['resumo', 'Resumo'],
                  ['faturas', `Faturas (${profile.invoices.length})`],
                  ['historico', `Histórico (${profile.timeline.length})`],
                  ['tarefas', `Follow-ups (${profile.tasks.filter((t) => t.status === 'OPEN').length})`],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className="flex-1 rounded-lg px-2 py-1.5 text-xs font-medium"
                    style={
                      tab === key
                        ? { background: 'var(--surface-base)', color: 'var(--text-primary)' }
                        : { color: 'var(--text-muted)' }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-4 p-5">
              {error && (
                <div className="rounded-lg p-2 text-xs" style={{ background: '#fef2f2', color: '#991b1b' }}>
                  {error}
                </div>
              )}

              {/* RESUMO */}
              {tab === 'resumo' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ['Total já pago', formatPrice(profile.lifetimeCents)],
                      ['Em aberto', formatPrice(profile.openCents)],
                      ['Vencido', formatPrice(profile.overdueCents)],
                      ['Status', profile.billingStatus || '—'],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-xl p-3"
                        style={{ background: 'var(--surface-soft)' }}
                      >
                        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</div>
                        <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {profile.usage && (
                    <div className="rounded-xl p-3" style={{ background: 'var(--surface-soft)' }}>
                      <p className="mb-2 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Consumo do ciclo
                      </p>
                      <div className="grid gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        <span>
                          {profile.usage.invoicesUsed} de {formatLimit(profile.usage.invoiceLimit)} notas
                          {profile.usage.usagePercent >= 0 && ` (${profile.usage.usagePercent}%)`}
                        </span>
                        <span>
                          {profile.usage.branchCount} de {formatLimit(profile.usage.branchLimit)} loja(s) ·{' '}
                          {profile.usage.pdvCount} de {formatLimit(profile.usage.pdvLimit)} PDV(s)
                        </span>
                        <span>
                          {profile.usage.seatCount} de {formatLimit(profile.usage.seatLimit)} usuário(s)
                        </span>
                      </div>
                    </div>
                  )}

                  {profile.contract && (
                    <div className="rounded-xl p-3" style={{ background: 'var(--surface-soft)' }}>
                      <p className="mb-1 flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                        <Building2 size={12} /> Contrato de rede
                      </p>
                      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {formatPrice(profile.contract.monthlyPriceCents)}/mês · vence em{' '}
                        {profile.contract.daysUntilDue} dias · desde {fmtDate(profile.contract.startedAt)}
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl p-3" style={{ background: 'var(--surface-soft)' }}>
                    <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Contato</p>
                    <div className="grid gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      <span>{profile.contactName || '—'}</span>
                      <span>{profile.contactEmail || '—'}</span>
                      <span>{profile.contactPhone || '—'}</span>
                      <span>Responsável: {profile.accountOwnerEmail || 'não atribuído'}</span>
                    </div>
                  </div>
                </>
              )}

              {/* FATURAS */}
              {tab === 'faturas' && (
                profile.invoices.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Nenhuma fatura emitida. Contas em plano de prateleira são cobradas por cartão,
                    sem fatura avulsa.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {profile.invoices.map((invoice) => {
                      const meta = INVOICE_STATUS[invoice.status] ?? INVOICE_STATUS.draft;
                      return (
                        <div
                          key={invoice.id}
                          className="flex items-center gap-3 rounded-xl p-3"
                          style={{ background: 'var(--surface-soft)' }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                                {formatPrice(invoice.amountDueCents)}
                              </span>
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                                style={{ background: meta.bg, color: meta.color }}
                              >
                                {meta.label}
                              </span>
                            </div>
                            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                              {invoice.invoiceNumber || '—'} · vence {fmtDate(invoice.dueDate)}
                              {invoice.paidAt && ` · paga em ${fmtDate(invoice.paidAt)}`}
                            </div>
                          </div>
                          {invoice.hostedInvoiceUrl && (
                            <a
                              href={invoice.hostedInvoiceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-[11px] font-semibold"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              abrir <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {/* HISTÓRICO */}
              {tab === 'historico' && (
                <>
                  <div className="rounded-xl p-3" style={{ background: 'var(--surface-soft)' }}>
                    <p className="mb-2 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Registrar interação
                    </p>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <select
                          value={noteType}
                          onChange={(e) => setNoteType(e.target.value as ActivityType)}
                          className="rounded-lg px-2 py-1.5 text-xs"
                          style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
                        >
                          {(['NOTE', 'CALL', 'EMAIL', 'MEETING', 'WHATSAPP'] as ActivityType[]).map((t) => (
                            <option key={t} value={t}>{ACTIVITY_META[t].label}</option>
                          ))}
                        </select>
                        <input
                          value={noteTitle}
                          onChange={(e) => setNoteTitle(e.target.value)}
                          placeholder="Ex.: Ligou pedindo desconto"
                          className="flex-1 rounded-lg px-2 py-1.5 text-xs"
                          style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
                        />
                      </div>
                      <textarea
                        value={noteBody}
                        onChange={(e) => setNoteBody(e.target.value)}
                        placeholder="Detalhes (opcional)"
                        rows={2}
                        className="rounded-lg px-2 py-1.5 text-xs"
                        style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
                      />
                      <button
                        type="button"
                        onClick={addNote}
                        disabled={saving || !noteTitle.trim()}
                        className="self-start rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                        style={{ background: 'var(--brand-500, #22c55e)', color: '#fff' }}
                      >
                        Registrar
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {profile.timeline.length === 0 && (
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        Nenhuma interação registrada ainda.
                      </p>
                    )}
                    {profile.timeline.map((activity) => {
                      const meta = ACTIVITY_META[activity.activityType] ?? ACTIVITY_META.NOTE;
                      return (
                        <div
                          key={activity.id}
                          className="rounded-xl p-3"
                          style={{
                            background: activity.automated ? 'var(--surface-soft)' : 'var(--surface-base)',
                            border: '1px solid var(--border-soft)',
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span style={{ color: 'var(--text-muted)' }}>{meta.icon}</span>
                            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                              {activity.title}
                            </span>
                            {activity.automated && (
                              <span className="rounded px-1 text-[9px]" style={{ background: 'var(--surface-soft)', color: 'var(--text-muted)' }}>
                                sistema
                              </span>
                            )}
                            <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>
                              {fmtDateTime(activity.createdAt)}
                            </span>
                          </div>
                          {activity.body && (
                            <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>{activity.body}</p>
                          )}
                          {activity.actorEmail && (
                            <p className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                              por {activity.actorEmail}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* TAREFAS */}
              {tab === 'tarefas' && (
                <>
                  <div className="rounded-xl p-3" style={{ background: 'var(--surface-soft)' }}>
                    <p className="mb-2 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Novo follow-up
                    </p>
                    <div className="flex flex-col gap-2">
                      <input
                        value={taskTitle}
                        onChange={(e) => setTaskTitle(e.target.value)}
                        placeholder="Ex.: Retornar ligação sobre upgrade"
                        className="rounded-lg px-2 py-1.5 text-xs"
                        style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
                      />
                      <div className="flex gap-2">
                        <input
                          type="date"
                          value={taskDue}
                          onChange={(e) => setTaskDue(e.target.value)}
                          className="rounded-lg px-2 py-1.5 text-xs"
                          style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
                        />
                        <select
                          value={taskPriority}
                          onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                          className="rounded-lg px-2 py-1.5 text-xs"
                          style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
                        >
                          <option value="LOW">Baixa</option>
                          <option value="NORMAL">Normal</option>
                          <option value="HIGH">Alta</option>
                        </select>
                        <button
                          type="button"
                          onClick={addTask}
                          disabled={saving || !taskTitle.trim()}
                          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                          style={{ background: 'var(--brand-500, #22c55e)', color: '#fff' }}
                        >
                          <Plus size={12} /> Criar
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {profile.tasks.length === 0 && (
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        Nenhum follow-up para esta conta.
                      </p>
                    )}
                    {profile.tasks.map((task) => {
                      const overdue = task.status === 'OPEN' && task.dueDate
                        && new Date(task.dueDate) < new Date();
                      return (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 rounded-xl p-3"
                          style={{
                            background: overdue ? '#fffbeb' : 'var(--surface-soft)',
                            opacity: task.status === 'OPEN' ? 1 : 0.6,
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <div
                              className="text-xs font-semibold"
                              style={{
                                color: overdue ? '#92400e' : 'var(--text-primary)',
                                textDecoration: task.status === 'DONE' ? 'line-through' : 'none',
                              }}
                            >
                              {task.title}
                            </div>
                            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                              {task.dueDate ? `prazo ${fmtDate(task.dueDate)}` : 'sem prazo'}
                              {task.priority === 'HIGH' && ' · alta prioridade'}
                              {overdue && ' · atrasado'}
                            </div>
                          </div>
                          {task.status === 'OPEN' && (
                            <button
                              type="button"
                              onClick={() => completeTask(task.id)}
                              disabled={saving}
                              className="rounded-lg px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
                              style={{ background: '#dcfce7', color: '#15803d' }}
                            >
                              <Check size={12} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CustomerProfileDrawer;
