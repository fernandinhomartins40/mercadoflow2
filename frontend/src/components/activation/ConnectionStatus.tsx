import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, PlugZap, WifiOff } from 'lucide-react';
import type { ActivationStatus } from '../../types/activation.types';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';

const ago = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} dias`;
};

/**
 * A pergunta do dono nesta tela é "as vendas estão chegando?". O estado vem do
 * mesmo endpoint da ativação (agente on-line, último sinal, notas recebidas e
 * recusadas), em vez de contagens técnicas como caixas com ou sem número de série.
 */
const ConnectionStatus: React.FC<{ status: ActivationStatus; onInstall: () => void }> = ({ status, onInstall }) => {
  const { agent, invoices } = status;
  const connected = status.steps.find((s) => s.key === 'CONNECT_AGENT')?.done ?? false;

  const state = !connected
    ? { tone: 'idle' as const, icon: PlugZap, title: 'Agente ainda não conectado', text: 'Instale o agente no computador do caixa para as vendas começarem a chegar.' }
    : agent.online
      ? { tone: 'ok' as const, icon: CheckCircle2, title: 'Recebendo vendas', text: 'O agente está on-line e envia cada nota assim que o caixa emite.' }
      : { tone: 'warn' as const, icon: WifiOff,
          title: agent.lastHeartbeatAt ? `Sem sinal há ${ago(agent.lastHeartbeatAt)}` : 'Sem sinal do agente',
          text: 'Confira se o computador do caixa está ligado e com internet. As notas ficam guardadas e chegam quando ele voltar.' };

  const palette = {
    ok: { bg: 'var(--surface-success)', border: 'var(--border-success)', color: 'var(--brand-700)' },
    warn: { bg: '#fffbeb', border: '#fde68a', color: '#92400e' },
    idle: { bg: 'var(--surface-soft)', border: 'var(--border-soft)', color: 'var(--text-primary)' },
  }[state.tone];
  const Icon = state.icon;

  return (
    <section aria-labelledby="connection-title" className="flex flex-col gap-4 rounded-2xl p-4 sm:p-5" style={{ background: palette.bg, border: `1px solid ${palette.border}` }}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-6 w-6 shrink-0" style={{ color: palette.color }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="connection-title" className="text-base font-semibold" style={{ color: 'var(--text-primary)' }} aria-live="polite">{state.title}</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{state.text}</p>
        </div>
        {!connected && (
          <button type="button" onClick={onInstall} className={`inline-flex min-h-[44px] shrink-0 items-center rounded-lg px-4 text-sm font-semibold text-white ${FOCUS}`} style={{ background: 'var(--brand-700)' }}>
            Instalar agente
          </button>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {[
          { label: 'Caixas conectados', value: String(agent.pairedPdvs) },
          { label: 'Notas recebidas', value: invoices.received >= 10000 ? '10 mil+' : invoices.received.toLocaleString('pt-BR') },
          { label: 'Dias com venda', value: `${invoices.salesDays}${invoices.salesDays >= invoices.targetDays ? '+' : ''}` },
        ].map((m) => (
          <div key={m.label} className="rounded-xl p-3" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}>
            <dt className="text-xs" style={{ color: 'var(--text-muted)' }}>{m.label}</dt>
            <dd className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{m.value}</dd>
          </div>
        ))}
      </dl>

      {invoices.rejectedLast7Days > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {invoices.rejectedLast7Days} {invoices.rejectedLast7Days === 1 ? 'nota recusada' : 'notas recusadas'} pela cota semanal nos últimos 7 dias.
          <Link to="/app/planos" className="font-semibold underline" style={{ color: '#92400e' }}>Ver planos</Link>
        </p>
      )}
    </section>
  );
};

export default ConnectionStatus;
