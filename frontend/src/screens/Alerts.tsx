import React, { useMemo } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import { useAlerts } from '../hooks/useAlerts';
import { AlertTriangle, Bell, CheckCircle2, Clock, Eye } from 'lucide-react';

const Alerts: React.FC = () => {
  const { alerts, loading, error, onlyUnread, setOnlyUnread, refresh, markRead, markAllRead } = useAlerts();

  const unreadCount = useMemo(() => alerts.filter((a) => !a.isRead).length, [alerts]);
  const highCount = useMemo(() => alerts.filter((a) => a.priority === 'HIGH').length, [alerts]);

  const priorityConfig = (p: string) => {
    switch (p) {
      case 'HIGH': return {
        border: 'border-l-red-500',
        icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
        label: 'Urgente',
        labelStyle: { background: '#fee2e2', color: '#991b1b' } as React.CSSProperties,
      };
      case 'MEDIUM': return {
        border: 'border-l-amber-500',
        icon: <Clock className="h-5 w-5 text-amber-500" />,
        label: 'Atenção',
        labelStyle: { background: '#fef3c7', color: '#92400e' } as React.CSSProperties,
      };
      default: return {
        border: 'border-l-slate-300',
        icon: <Bell className="h-5 w-5" style={{ color: 'var(--text-soft)' }} />,
        label: 'Info',
        labelStyle: { background: 'var(--surface-muted)', color: 'var(--text-muted)' } as React.CSSProperties,
      };
    }
  };

  const sorted = [...alerts].sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return (order[a.priority as keyof typeof order] ?? 2) - (order[b.priority as keyof typeof order] ?? 2);
  });

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Alertas</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>O que precisa da sua atenção agora</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setOnlyUnread(!onlyUnread)}
              className="rounded-full px-4 py-1.5 text-xs font-semibold transition"
              style={
                onlyUnread
                  ? { border: '1px solid var(--brand-600)', background: 'var(--surface-success)', color: 'var(--brand-700)' }
                  : { border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }
              }
            >
              {onlyUnread ? 'Somente não lidos' : 'Todos'}
            </button>
            <Button variant="secondary" onClick={refresh} disabled={loading}>Atualizar</Button>
            <Button variant="ghost" onClick={markAllRead} disabled={loading || alerts.length === 0}>Marcar todos como lidos</Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Alertas', value: alerts.length, color: 'var(--text-primary)' },
            { label: 'Não lidos', value: unreadCount, color: '#d97706' },
            { label: 'Urgentes', value: highCount, color: '#dc2626' },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{kpi.label}</span>
              <p className="mt-1 text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        {/* Alert cards */}
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-xl p-8 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-400" />
            <p className="mt-2" style={{ color: 'var(--text-muted)' }}>Nenhum alerta pendente. Tudo em ordem!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sorted.map((alert) => {
              const cfg = priorityConfig(alert.priority);
              return (
                <div
                  key={alert.id}
                  className={`flex items-start gap-4 rounded-xl border-l-4 p-4 transition ${cfg.border} ${alert.isRead ? 'opacity-50' : ''}`}
                  style={{ border: '1px solid var(--border-soft)', borderLeftWidth: 4, background: 'var(--surface-base)' }}
                >
                  {cfg.icon}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{alert.title}</h4>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={cfg.labelStyle}>{cfg.label}</span>
                      {!alert.isRead && <span className="h-2 w-2 rounded-full bg-green-500" />}
                    </div>
                    <p className="mt-0.5 text-sm" style={{ color: 'var(--text-muted)' }}>{alert.message}</p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--text-soft)' }}>
                      {alert.createdAt ? new Date(alert.createdAt).toLocaleString('pt-BR') : ''}
                    </p>
                  </div>
                  {!alert.isRead && (
                    <button
                      type="button"
                      onClick={() => markRead(alert.id)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-80"
                      style={{ background: 'var(--surface-soft)', color: 'var(--text-muted)' }}
                    >
                      <Eye className="h-3.5 w-3.5" /> Marcar lido
                    </button>
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

export default Alerts;
