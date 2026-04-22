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
      case 'HIGH': return { border: 'border-l-red-500', icon: <AlertTriangle className="h-5 w-5 text-red-500" />, bg: 'bg-red-50', label: 'Urgente', labelColor: 'bg-red-100 text-red-700' };
      case 'MEDIUM': return { border: 'border-l-amber-500', icon: <Clock className="h-5 w-5 text-amber-500" />, bg: 'bg-amber-50', label: 'Atenção', labelColor: 'bg-amber-100 text-amber-700' };
      default: return { border: 'border-l-gray-300', icon: <Bell className="h-5 w-5 text-gray-400" />, bg: 'bg-gray-50', label: 'Info', labelColor: 'bg-gray-100 text-gray-600' };
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
            <h1 className="text-xl font-bold text-gray-900">Alertas</h1>
            <p className="text-sm text-gray-500">O que precisa da sua atenção agora</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setOnlyUnread(!onlyUnread)}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${onlyUnread ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-600'}`}
            >
              {onlyUnread ? 'Somente não lidos' : 'Todos'}
            </button>
            <Button variant="secondary" onClick={refresh} disabled={loading}>Atualizar</Button>
            <Button variant="ghost" onClick={markAllRead} disabled={loading || alerts.length === 0}>Marcar todos como lidos</Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Alertas</span>
            <p className="mt-1 text-2xl font-bold text-gray-900">{alerts.length}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Não lidos</span>
            <p className="mt-1 text-2xl font-bold text-amber-600">{unreadCount}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Urgentes</span>
            <p className="mt-1 text-2xl font-bold text-red-600">{highCount}</p>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        {/* Alert cards */}
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-white p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            <p className="mt-2 text-gray-500">Nenhum alerta pendente. Tudo em ordem!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sorted.map((alert) => {
              const cfg = priorityConfig(alert.priority);
              return (
                <div
                  key={alert.id}
                  className={`flex items-start gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm border-l-4 ${cfg.border} ${alert.isRead ? 'opacity-50' : ''}`}
                >
                  {cfg.icon}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-gray-900">{alert.title}</h4>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.labelColor}`}>{cfg.label}</span>
                      {!alert.isRead && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                    </div>
                    <p className="mt-0.5 text-sm text-gray-500">{alert.message}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {alert.createdAt ? new Date(alert.createdAt).toLocaleString('pt-BR') : ''}
                    </p>
                  </div>
                  {!alert.isRead && (
                    <button
                      type="button"
                      onClick={() => markRead(alert.id)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-100"
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
