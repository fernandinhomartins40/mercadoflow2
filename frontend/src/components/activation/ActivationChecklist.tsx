import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Download, Plug, Receipt, Sparkles } from 'lucide-react';
import type { ActivationStatus, ActivationStepKey } from '../../types/activation.types';

// Foco visível local: o anel global (DS-04) depende do tailwind.css, que tem
// trabalho em andamento fora desta fatia.
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';
const PRIMARY = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white no-underline ${FOCUS}`;
const SECONDARY = `inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 text-sm font-semibold no-underline ${FOCUS}`;

const formatDateTime = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
    : '';

const formatAgo = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} dias`;
};

const formatNextAnalysis = (iso: string | null) => {
  if (!iso) return 'na próxima madrugada';
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
  return `${sameDay ? 'hoje' : 'amanhã'} às ${time}`;
};

const TITLES: Record<ActivationStepKey, string> = {
  CONNECT_AGENT: 'Instale e conecte o agente no computador do caixa',
  FIRST_INVOICE: 'Receba a primeira venda',
  FIRST_ANALYSIS: 'Primeira análise das vendas',
};

const ICONS: Record<ActivationStepKey, React.ElementType> = {
  CONNECT_AGENT: Plug,
  FIRST_INVOICE: Receipt,
  FIRST_ANALYSIS: Sparkles,
};

const CurrentStepBody: React.FC<{ stepKey: ActivationStepKey; status: ActivationStatus }> = ({ stepKey, status }) => {
  if (stepKey === 'CONNECT_AGENT') {
    return (
      <>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          O agente lê as notas fiscais (NFC-e) que o caixa já emite, sem digitação e sem depender do seu sistema.
          Baixe, instale e aprove o código que ele mostrar na tela.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/app/download-agente" className={PRIMARY} style={{ background: 'var(--brand-700)' }}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Baixar o agente
          </Link>
          <Link to="/app/pdvs" className={SECONDARY} style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}>
            Ver caixas conectados
          </Link>
        </div>
      </>
    );
  }

  if (stepKey === 'FIRST_INVOICE') {
    const { agent, invoices } = status;
    return (
      <>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }} aria-live="polite">
          {agent.online
            ? 'O agente está on-line. Assim que o caixa emitir uma nota, ela aparece aqui.'
            : agent.lastHeartbeatAt
              ? `Último sinal do agente: ${formatAgo(agent.lastHeartbeatAt)}. Confira se o computador do caixa está ligado e com internet.`
              : 'Aguardando o primeiro sinal do agente. Confira se ele ficou aberto depois da instalação.'}
        </p>
        {invoices.rejectedLast7Days > 0 && (
          <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--surface-warning)', border: '1px solid var(--border-warning)' }}>
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {invoices.rejectedLast7Days} {invoices.rejectedLast7Days === 1 ? 'nota recusada' : 'notas recusadas'} pela cota semanal do seu plano nos últimos 7 dias.
            </p>
            <Link to="/app/planos" className={`${SECONDARY} mt-2 px-0 underline`} style={{ color: 'var(--brand-700)' }}>
              Ver planos
            </Link>
          </div>
        )}
      </>
    );
  }

  return (
    <p className="text-sm" style={{ color: 'var(--text-muted)' }} aria-live="polite">
      A análise roda toda madrugada. A próxima será {formatNextAnalysis(status.nextAnalysisAt)}.{' '}
      {status.invoices.received > 0 && `${status.invoices.received.toLocaleString('pt-BR')} ${status.invoices.received === 1 ? 'nota recebida' : 'notas recebidas'} até agora.`}
    </p>
  );
};

const ActivationChecklist: React.FC<{ status: ActivationStatus }> = ({ status }) => {
  const currentIndex = status.steps.findIndex((s) => !s.done);
  const remaining = status.steps.filter((s) => !s.done).length;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <section
        aria-labelledby="activation-title"
        className="rounded-xl p-4 sm:p-5"
        style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}
      >
        <h2 id="activation-title" className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          Vamos conectar sua loja
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          {remaining === 1 ? 'Falta 1 passo' : `Faltam ${remaining} passos`} para a primeira análise das suas vendas.
        </p>

        <ol className="mt-4 flex flex-col gap-3">
          {status.steps.map((step, index) => {
            const Icon = ICONS[step.key];
            const isCurrent = index === currentIndex;
            const label = step.done ? 'Concluído' : isCurrent ? 'Próximo passo' : 'Pendente';
            return (
              <li
                key={step.key}
                aria-current={isCurrent ? 'step' : undefined}
                className="rounded-lg p-3"
                style={{
                  border: `1px solid ${isCurrent ? 'var(--border-success)' : 'var(--border-soft)'}`,
                  background: isCurrent ? 'var(--surface-success)' : 'var(--surface-base)',
                }}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: step.done ? 'var(--brand-700)' : 'var(--surface-muted)',
                      color: step.done ? '#fff' : 'var(--text-primary)',
                    }}
                  >
                    {step.done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                        <span className="sr-only">Passo {index + 1}: </span>
                        {TITLES[step.key]}
                      </h3>
                      <span
                        className="text-xs font-semibold"
                        style={{ color: step.done || isCurrent ? 'var(--brand-700)' : 'var(--text-muted)' }}
                      >
                        {label}
                      </span>
                    </div>
                    {step.done && step.doneAt && (
                      <p className="mt-0.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                        {formatDateTime(step.doneAt)}
                      </p>
                    )}
                    {isCurrent && (
                      <div className="mt-2">
                        <CurrentStepBody stepKey={step.key} status={status} />
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <aside
        aria-labelledby="activation-help"
        className="rounded-xl p-4 sm:p-5"
        style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}
      >
        <h2 id="activation-help" className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          O que acontece depois
        </h2>
        <ul className="mt-2 flex list-disc flex-col gap-2 pl-5 text-sm" style={{ color: 'var(--text-muted)' }}>
          <li>Cada venda do caixa chega sozinha, item a item.</li>
          <li>Toda madrugada o MercadoFlow analisa o que vendeu e o que parou de vender.</li>
          <li>Com uma semana de vendas, o Painel mostra o que repor e o que merece atenção.</li>
        </ul>
      </aside>
    </div>
  );
};

export default ActivationChecklist;
