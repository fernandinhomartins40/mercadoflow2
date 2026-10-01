import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BellOff, Check, Loader2, MessageCircle, RefreshCw, ShoppingCart, Sparkles, Sun, X } from 'lucide-react';
import Layout from '../components/layout/Layout';
import PageHeader from '../components/layout/PageHeader';
import { SegmentedTabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import {
  copilotAgentsService,
  type CopilotAgentSettings,
  type CopilotDecision,
  type CopilotInbox,
  type CopilotLesson,
  type CopilotPrefs,
} from '../services/aiPlatform.service';

/**
 * Copiloto: a caixa de decisões dos agentes. Cada cartão traz o que o agente
 * viu, os números e a ação preparada; nada acontece sem o sim do lojista, e o
 * que ele recusa vira lição para o agente não insistir.
 */

type Tab = 'abertas' | 'decididas' | 'silenciadas' | 'agentes';

const AGENT: Record<string, { label: string; icon: React.ElementType }> = {
  GERENTE: { label: 'Gerente', icon: Sun },
  COMPRAS: { label: 'Compras', icon: ShoppingCart },
  RECEBIMENTO: { label: 'Recebimento', icon: MessageCircle },
};

const LEVELS = [
  { value: 0, label: 'Só avisar' },
  { value: 1, label: 'Avisar e sugerir' },
  { value: 2, label: 'Deixar pronto para eu aprovar' },
];

const REASONS = ['Não preciso agora', 'Valor alto demais', 'Já resolvi', 'Não confio nesse fornecedor'];

const STATUS_LABEL: Record<string, string> = {
  APROVADA: 'Aprovada', RECUSADA: 'Recusada', EXPIRADA: 'Expirou', SILENCIADA: 'Silenciada', INFORMATIVA: 'Aviso', PENDENTE: 'Esperando você',
};

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';
const money = (v: number | null | undefined) => (v == null ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const apiError = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

/** Por que o aviso chegou (ou não): transparência sobre a triagem, sem custo de texto. */
const triage = (d: CopilotDecision) => {
  const f = d.funnel;
  if (f.julgamento !== 'JEV') return 'Triado pela regra do sistema.';
  const p = f.probabilidadeVale;
  if (d.status === 'SILENCIADA') return `O Jev julgou que não valia avisar${p != null ? ` (${Math.round((1 - p) * 100)}% de certeza)` : ''}.`;
  if (p != null && p >= 0.5) return `O Jev julgou que vale avisar (${Math.round(p * 100)}% de certeza).`;
  return 'O Jev ficou em dúvida; na dúvida, o aviso chega a você.';
};

const approveLabel = (d: CopilotDecision) =>
  d.level < 2 ? 'Vou fazer' : d.kind === 'PEDIDO' ? 'Aprovar pedido' : d.kind === 'MENSAGEM_FORNECEDOR' ? 'Abrir no WhatsApp' : 'Aprovar';

const DecisionCard: React.FC<{ marketId: string; decision: CopilotDecision; onChange: () => void }> = ({ marketId, decision: d, onChange }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState('');
  const [why, setWhy] = useState<string | null>(d.explanation);
  const [whyNote, setWhyNote] = useState<string | null>(null);
  const [done, setDone] = useState<CopilotDecision | null>(null);
  const agent = AGENT[d.agent] ?? { label: d.agent, icon: Sparkles };
  const Icon = agent.icon;
  const open = d.status === 'PENDENTE' || d.status === 'INFORMATIVA';
  const view = done ?? d;

  const approve = async () => {
    setBusy('approve');
    setError(null);
    try {
      const r = await copilotAgentsService.approve(marketId, d.id);
      setDone(r);
      if (r.result?.whatsappUrl) window.open(r.result.whatsappUrl, '_blank', 'noopener');
    } catch (e) {
      setError(apiError(e, 'Não foi possível aprovar agora.'));
    } finally {
      setBusy(null);
    }
  };

  const refuse = async (motivo: string) => {
    setBusy('refuse');
    setError(null);
    try {
      setDone(await copilotAgentsService.refuse(marketId, d.id, motivo || undefined));
      setRefusing(false);
    } catch (e) {
      setError(apiError(e, 'Não foi possível registrar.'));
    } finally {
      setBusy(null);
    }
  };

  const explain = async () => {
    if (why) { setWhy(null); return; }
    setBusy('why');
    try {
      const r = await copilotAgentsService.explain(marketId, d.id);
      setWhy(r.texto);
      setWhyNote(r.aviso);
    } catch {
      setWhyNote('Não foi possível explicar agora.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="card flex flex-col gap-3 p-4" aria-labelledby={`dec-${d.id}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: 'var(--surface-soft)', color: 'var(--text-primary)' }}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />{agent.label}
        </span>
        {d.urgent && open && (
          <span className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-red-800"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />Urgente</span>
        )}
        <span style={{ color: 'var(--text-muted)' }}>{STATUS_LABEL[view.status] ?? view.status} · {when(view.decidedAt ?? d.createdAt)}</span>
      </div>
      <h3 id={`dec-${d.id}`} className="text-base font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>{d.title}</h3>
      <p className="whitespace-pre-line text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>{d.body}</p>
      {d.impact != null && d.impact > 0 && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Impacto estimado: <strong style={{ color: 'var(--text-primary)' }}>{money(d.impact)}</strong></p>
      )}

      {why && (
        <div className="rounded-xl p-3 text-sm leading-relaxed" style={{ background: 'var(--surface-soft)', color: 'var(--text-primary)' }}>
          {why}
          {whyNote && <span className="mt-1 block text-xs" style={{ color: 'var(--text-muted)' }}>{whyNote}</span>}
        </div>
      )}

      {view.result?.executado && view.result.noPedido != null && (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
          {view.result.noPedido} {view.result.noPedido === 1 ? 'item foi' : 'itens foram'} para o rascunho de pedido.
          {view.result.semFornecedor ? ` ${view.result.semFornecedor} sem fornecedor conhecido: escolha na lista de compras.` : ''}
          {' '}<Link to="/app/lista-compras" className="font-semibold underline">Revisar o pedido</Link>
        </p>
      )}
      {view.result?.whatsappUrl && (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
          Mensagem pronta. <a href={view.result.whatsappUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">Abrir no WhatsApp de novo</a>
        </p>
      )}
      {view.status === 'RECUSADA' && view.decisionNote && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Motivo: {view.decisionNote}. O agente não volta a propor isso nos próximos 14 dias.</p>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      {open && !done && (
        refusing ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Por que não? (ajuda o agente a aprender)</span>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button key={r} type="button" disabled={!!busy} onClick={() => refuse(r)}
                  className={`rounded-full px-3 py-1.5 text-sm ${FOCUS}`} style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}>{r}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Outro motivo (opcional)"
                aria-label="Outro motivo" className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
              <button type="button" disabled={!!busy} onClick={() => refuse(reason)} className={`rounded-lg px-3 py-2 text-sm font-semibold text-white ${FOCUS}`} style={{ background: 'var(--text-primary)' }}>Recusar</button>
              <button type="button" onClick={() => setRefusing(false)} className={`rounded-lg px-3 py-2 text-sm ${FOCUS}`} style={{ color: 'var(--text-muted)' }}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {d.status === 'PENDENTE' && (
              <button type="button" onClick={approve} disabled={!!busy}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS}`} style={{ background: 'var(--brand-700)' }}>
                {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{approveLabel(d)}
              </button>
            )}
            {d.kind === 'AVISO' && (
              <Link to="/app/inteligencia" className={`rounded-lg px-4 py-2 text-sm font-semibold no-underline ${FOCUS}`} style={{ background: 'var(--brand-700)', color: '#fff' }}>Ver na Central</Link>
            )}
            <button type="button" onClick={() => setRefusing(true)} disabled={!!busy}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm ${FOCUS}`} style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}>
              <X className="h-4 w-4" />{d.status === 'INFORMATIVA' ? 'Dispensar' : 'Recusar'}
            </button>
            <button type="button" onClick={explain} disabled={busy === 'why'} aria-expanded={!!why}
              className={`ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${FOCUS}`} style={{ color: 'var(--brand-700)' }}>
              {busy === 'why' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{why ? 'Fechar' : 'Por quê?'}
            </button>
          </div>
        )
      )}
      {d.funnel?.julgamento && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {triage(d)}
        </p>
      )}
    </li>
  );
};

const AgentRow: React.FC<{ marketId: string; agent: CopilotAgentSettings; onSaved: (a: CopilotAgentSettings[]) => void }> = ({ marketId, agent, onSaved }) => {
  const [form, setForm] = useState(agent);
  const [state, setState] = useState<string | null>(null);
  useEffect(() => setForm(agent), [agent]);
  const save = async () => {
    setState('…');
    try {
      onSaved(await copilotAgentsService.saveAgent(marketId, agent.agent, form));
      setState('Salvo.');
    } catch (e) {
      setState(apiError(e, 'Não foi possível salvar.'));
    }
  };
  const id = `agente-${agent.agent}`;
  return (
    <li className="card flex flex-col gap-3 p-4" aria-labelledby={id}>
      <label className="flex items-center justify-between gap-3">
        <span id={id} className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{agent.label}</span>
        <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="h-5 w-5 accent-green-700" aria-label={`Ligar o agente ${AGENT[agent.agent]?.label ?? agent.agent}`} />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          O que ele pode fazer
          <select value={form.level} onChange={(e) => setForm({ ...form, level: Number(e.target.value) })} className="rounded-lg px-2 py-2" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>
            {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          Avisos por dia, no máximo
          <input type="number" min={0} max={50} value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) })} className="rounded-lg px-2 py-2" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
        </label>
        <label className="flex flex-col gap-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          Só avisar a partir de (R$)
          <input type="number" min={0} step={50} value={form.minImpact} onChange={(e) => setForm({ ...form, minImpact: Number(e.target.value) })} className="rounded-lg px-2 py-2" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${FOCUS}`} style={{ background: 'var(--brand-700)' }}>Salvar</button>
        {state && <span role="status" className="text-sm" style={{ color: 'var(--text-muted)' }}>{state}</span>}
      </div>
    </li>
  );
};

const PrefsCard: React.FC<{ marketId: string; prefs: CopilotPrefs }> = ({ marketId, prefs }) => {
  const [form, setForm] = useState({ quietStart: prefs.quietStart.slice(0, 5), quietEnd: prefs.quietEnd.slice(0, 5) });
  const [state, setState] = useState<string | null>(null);
  const save = async () => {
    try {
      await copilotAgentsService.savePrefs(marketId, form);
      setState('Salvo.');
    } catch (e) {
      setState(apiError(e, 'Não foi possível salvar.'));
    }
  };
  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby="silencio">
      <h2 id="silencio" className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}><BellOff className="h-4 w-4" />Horário de silêncio</h2>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nesse horário os agentes não mandam aviso fora do app; o que não for urgente espera.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm" style={{ color: 'var(--text-muted)' }}>Das
          <input type="time" value={form.quietStart} onChange={(e) => setForm({ ...form, quietStart: e.target.value })} className="rounded-lg px-2 py-2" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
        </label>
        <label className="flex flex-col gap-1 text-sm" style={{ color: 'var(--text-muted)' }}>às
          <input type="time" value={form.quietEnd} onChange={(e) => setForm({ ...form, quietEnd: e.target.value })} className="rounded-lg px-2 py-2" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
        </label>
        <button type="button" onClick={save} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${FOCUS}`} style={{ background: 'var(--brand-700)' }}>Salvar horário</button>
        {state && <span role="status" className="text-sm" style={{ color: 'var(--text-muted)' }}>{state}</span>}
      </div>
    </section>
  );
};

const WhatsAppCard: React.FC<{ marketId: string; prefs: CopilotPrefs; onSaved: (p: CopilotPrefs) => void }> = ({ marketId, prefs, onSaved }) => {
  const [phone, setPhone] = useState(prefs.whatsappPhone ? prefs.whatsappPhone.replace(/^55/, '') : '');
  const [consent, setConsent] = useState(prefs.whatsappOptIn);
  const [state, setState] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const p = await copilotAgentsService.savePrefs(marketId, { whatsappPhone: phone, whatsappOptIn: consent });
      onSaved(p);
      setState(p.whatsappOptIn ? 'Pronto: os avisos chegam no seu WhatsApp.' : 'Salvo. Você não recebe avisos no WhatsApp.');
    } catch (err) {
      setState(apiError(err, 'Não foi possível salvar.'));
    }
  };
  return (
    <form onSubmit={save} className="card flex flex-col gap-3 p-4" aria-labelledby="whatsapp-titulo">
      <h2 id="whatsapp-titulo" className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        <MessageCircle className="h-4 w-4" />Avisos no WhatsApp
      </h2>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        O resumo do dia e os avisos dos agentes chegam no seu WhatsApp, com o botão Aprovar. Fora do horário de silêncio e sem repetir.
      </p>
      <label className="flex flex-col gap-1 text-sm" style={{ color: 'var(--text-muted)' }}>
        Número com DDD
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(11) 98765-4321" maxLength={20}
          className="max-w-xs rounded-lg px-3 py-2" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
      </label>
      <label className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-green-700" />
        <span>Aceito receber avisos do MercadoFlow no WhatsApp. Posso cancelar quando quiser respondendo PARAR.</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${FOCUS}`} style={{ background: 'var(--brand-700)' }}>Salvar WhatsApp</button>
        {state && <span role="status" className="text-sm" style={{ color: 'var(--text-muted)' }}>{state}</span>}
      </div>
    </form>
  );
};

const Copilot: React.FC = () => {
  const { marketId } = useAuth();
  const [tab, setTab] = useState<Tab>('abertas');
  const [inbox, setInbox] = useState<CopilotInbox | null>(null);
  const [agents, setAgents] = useState<CopilotAgentSettings[] | null>(null);
  const [prefs, setPrefs] = useState<CopilotPrefs | null>(null);
  const [lessons, setLessons] = useState<CopilotLesson[]>([]);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!marketId) return;
    if (tab === 'agentes') {
      const r = await copilotAgentsService.agents(marketId);
      setAgents(r.agentes);
      setPrefs(r.preferencias);
      setLessons(r.licoes);
    } else {
      setInbox(await copilotAgentsService.inbox(marketId, tab));
    }
  }, [marketId, tab]);

  useEffect(() => { load().catch(() => setNote('Não foi possível carregar o Copiloto.')); }, [load]);

  const check = async () => {
    if (!marketId) return;
    setChecking(true);
    setNote(null);
    try {
      const r = await copilotAgentsService.run(marketId);
      setNote(r.created > 0
        ? `${r.created} ${r.created === 1 ? 'novidade' : 'novidades'} para você.`
        : r.signals > 0 ? 'Nada novo: os agentes já avisaram tudo o que encontraram.' : 'Nada que precise de você agora.');
      if (tab !== 'abertas') setTab('abertas'); else await load();
    } catch {
      setNote('Não foi possível verificar agora.');
    } finally {
      setChecking(false);
    }
  };

  const open = (inbox?.pendentes ?? 0) + (inbox?.avisos ?? 0);

  return (
    <Layout>
      <PageHeader
        title="Copiloto"
        subtitle="O que os agentes viram e deixaram pronto. Nada acontece sem o seu sim."
        actions={
          <button type="button" onClick={check} disabled={checking}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60 ${FOCUS}`}
            style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-base)' }}>
            <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />Verificar agora
          </button>
        }
      />
      <div className="flex flex-col gap-4">
        <SegmentedTabs<Tab>
          label="Caixa do Copiloto"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'abertas', label: 'Para decidir', badge: tab === 'abertas' ? open : undefined },
            { key: 'decididas', label: 'Decididas' },
            { key: 'silenciadas', label: 'Silenciadas' },
            { key: 'agentes', label: 'Agentes' },
          ]}
        />
        {note && <p role="status" className="text-sm" style={{ color: 'var(--text-muted)' }}>{note}</p>}

        {tab === 'silenciadas' && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Sinais que o Jev julgou que não valiam um aviso. Ficam aqui para você conferir se ele está acertando.
          </p>
        )}

        {tab !== 'agentes' && marketId && (
          !inbox ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : inbox.decisoes.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {tab === 'abertas' ? 'Nada esperando você' : 'Nada por aqui ainda'}
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                {tab === 'abertas'
                  ? 'Os agentes olham as vendas, as compras e as entregas a cada 5 minutos e avisam aqui quando algo precisar de você.'
                  : 'As decisões aparecem aqui depois que você responde.'}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {inbox.decisoes.map((d) => <DecisionCard key={d.id} marketId={marketId} decision={d} onChange={load} />)}
            </ul>
          )
        )}

        {tab === 'agentes' && marketId && (
          !agents || !prefs ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : (
            <>
              <ul className="flex flex-col gap-3">
                {agents.map((a) => <AgentRow key={a.agent} marketId={marketId} agent={a} onSaved={setAgents} />)}
              </ul>
              <PrefsCard marketId={marketId} prefs={prefs} />
              <WhatsAppCard marketId={marketId} prefs={prefs} onSaved={setPrefs} />
              <section className="card flex flex-col gap-2 p-4" aria-labelledby="licoes">
                <h2 id="licoes" className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>O que a loja já aprendeu</h2>
                {lessons.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Ainda nada. As lições vêm das conferências, do resultado medido das decisões e do que você recusa.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5 text-sm" style={{ color: 'var(--text-primary)' }}>
                    {lessons.map((l) => <li key={l.id}>• {l.text}</li>)}
                  </ul>
                )}
              </section>
            </>
          )
        )}
      </div>
    </Layout>
  );
};

export default Copilot;
