import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, PlugZap, WifiOff } from 'lucide-react';
import { Chip, Forest, PanelTitle, StepTrack } from '../flow/Flow';
import type { ActivationStatus } from '../../types/activation.types';


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

  const Icon = state.icon;
  const metrics = [
    { label: 'Caixas conectados', value: String(agent.pairedPdvs) },
    { label: 'Notas recebidas', value: invoices.received >= 10000 ? '10 mil+' : invoices.received.toLocaleString('pt-BR') },
    { label: 'Dias com venda', value: `${invoices.salesDays}${invoices.salesDays >= invoices.targetDays ? '+' : ''}` },
  ];

  return (
    <Forest aria-labelledby="connection-title">
      <PanelTitle icon={Icon}
        title={<span id="connection-title" aria-live="polite">{state.tone === 'warn' ? 'Restabelecer a conexão' : state.title}</span>}
        sub={state.tone === 'warn' ? state.title : state.text}
        right={<Chip tone={state.tone === 'ok' ? 'lime' : state.tone === 'warn' ? 'red' : 'ghost'}>{state.tone === 'ok' ? 'On-line' : state.tone === 'warn' ? 'Sem sinal' : 'Não conectado'}</Chip>} />

      {state.tone !== 'ok' && (
        <div className="fx-white" style={{ marginTop: 18 }}>
          <StepTrack steps={state.tone === 'idle' ? [
            { label: 'Instalar o agente', hint: 'No computador do caixa', state: 'now' },
            { label: 'Aprovar o código', hint: 'Que ele mostrar na tela', state: 'next' },
            { label: 'Vendas chegando', hint: 'Nota por nota', state: 'next' },
          ] : [
            { label: 'Computador ligado', hint: 'E com internet', state: 'now' },
            { label: 'Agente aberto', hint: 'Ícone perto do relógio', state: 'next' },
            { label: 'Notas voltam a chegar', hint: 'As guardadas vêm juntas', state: 'next' },
          ]} />
          {state.tone === 'warn' && <p style={{ margin: '12px 0 0', fontSize: 14, color: 'var(--fx-ink-2)' }}>{state.text}</p>}
          {!connected && (
            <button type="button" onClick={onInstall} className="fx-btn dark" style={{ marginTop: 14 }}>
              <PlugZap aria-hidden="true" />Instalar agente
            </button>
          )}
        </div>
      )}

      <dl className="fx-kpis" style={{ marginTop: 14, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {metrics.map((m) => (
          <div key={m.label} className="fx-kpi">
            <dt style={{ fontSize: 13.5, color: 'var(--fx-muted)' }}>{m.label}</dt>
            <dd style={{ margin: '6px 0 0', fontSize: 'clamp(22px, 2.2vw, 30px)', fontWeight: 800, letterSpacing: '-.03em', color: 'var(--fx-ink)' }}>{m.value}</dd>
          </div>
        ))}
      </dl>

      {invoices.rejectedLast7Days > 0 && (
        <p className="fx-chip amber" style={{ marginTop: 12, whiteSpace: 'normal', padding: '10px 14px' }}>
          <AlertTriangle size={16} aria-hidden="true" />
          {invoices.rejectedLast7Days} {invoices.rejectedLast7Days === 1 ? 'nota recusada' : 'notas recusadas'} pela cota semanal nos últimos 7 dias.
          <Link to="/app/planos" style={{ color: 'inherit', textDecoration: 'underline' }}>Ver planos</Link>
        </p>
      )}
    </Forest>
  );
};

export default ConnectionStatus;
