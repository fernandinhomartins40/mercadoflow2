import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, History, Inbox, Loader2, Pause, Play, RefreshCw, Send, Settings2, User } from 'lucide-react';
import Layout from '../components/layout/Layout';
import { Card, Chip, ExplainStrip, PageHero, PanelTitle, PillTabs, brl } from '../components/flow/Flow';
import { useAuth } from '../context/AuthContext';
import { copilotAgentsService, type CopilotDecision } from '../services/aiPlatform.service';
import DecisionDesk from './copilot/DecisionDesk';
import HistoryView from './copilot/HistoryView';
import HowItWorks from './copilot/HowItWorks';
import { agentOf, ago, valueOf } from './copilot/shared';

/**
 * Mesa do Copiloto: as decisões que os agentes deixaram prontas, uma aberta
 * por vez para ajustar e decidir; o Histórico com o rastro de cada uma; e o
 * painel "Como ele trabalha". Nada acontece sem o sim do lojista (ou dentro
 * dos limites que ele deu para o Jev agir sozinho).
 */

type View = 'decidir' | 'historico';

const EXPLAIN: Record<string, { title: string; text: string }[]> = {
  RECEBIMENTO: [
    { title: 'Jev conferiu a nota', text: 'Identificou o que faltou e preparou as opções.' },
    { title: 'Você escolhe a solução', text: 'Revise e ajuste a mensagem se quiser.' },
    { title: 'Envio após sua aprovação', text: 'A mensagem sai pronta no WhatsApp.' },
  ],
  COMPRAS: [
    { title: 'Jev calculou o pedido', text: 'Pela venda das últimas semanas e pelo estoque.' },
    { title: 'Você ajusta', text: 'O que você corta, ele aprende para a próxima.' },
    { title: 'Vai para o rascunho', text: 'Nada é enviado ao fornecedor sem você revisar.' },
  ],
  DEFAULT: [
    { title: 'Você decide', text: 'Aprove, recuse ou ajuste as sugestões.' },
    { title: 'Jev executa dentro das permissões', text: 'Ações automáticas seguem as suas regras.' },
    { title: 'Tudo fica registrado', text: 'Você sempre pode rever no Histórico.' },
  ],
};

const Copilot: React.FC = () => {
  const { marketId } = useAuth();
  const [view, setView] = useState<View>('decidir');
  const [open, setOpen] = useState<CopilotDecision[] | null>(null);
  const [history, setHistory] = useState<CopilotDecision[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, number | null>>({});
  const [config, setConfig] = useState(false);
  const [anyAlone, setAnyAlone] = useState(false);
  const [paused, setPaused] = useState(false);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const loadOpen = useCallback(async () => {
    if (!marketId) return;
    const r = await copilotAgentsService.inbox(marketId, 'abertas');
    const list = [...r.decisoes].sort((a, b) => Number(b.urgent) - Number(a.urgent));
    setOpen(list);
    setSelected((cur) => (cur && list.some((d) => d.id === cur) ? cur : list[0]?.id ?? null));
  }, [marketId]);

  const loadHistory = useCallback(async () => {
    if (!marketId) return;
    const [dec, alone, mute] = await Promise.all([
      copilotAgentsService.inbox(marketId, 'decididas'),
      copilotAgentsService.inbox(marketId, 'sozinho'),
      copilotAgentsService.inbox(marketId, 'silenciadas'),
    ]);
    const all = new Map<string, CopilotDecision>();
    [...dec.decisoes, ...alone.decisoes, ...mute.decisoes].forEach((d) => all.set(d.id, d));
    setHistory([...all.values()].sort((a, b) => new Date(b.decidedAt ?? b.createdAt).getTime() - new Date(a.decidedAt ?? a.createdAt).getTime()));
  }, [marketId]);

  useEffect(() => { loadOpen().catch(() => setNote('Não foi possível carregar o Copiloto.')); }, [loadOpen]);
  useEffect(() => { if (view === 'historico') loadHistory().catch(() => setNote('Não foi possível carregar o histórico.')); }, [view, loadHistory]);
  useEffect(() => {
    if (!marketId) return;
    copilotAgentsService.agents(marketId).then((r) => { setPaused(r.pausado); setAnyAlone(r.agentes.some((a) => a.level === 3)); }).catch(() => {});
  }, [marketId]);

  const onValue = useCallback((id: string, v: number | null) => setValues((cur) => (cur[id] === v ? cur : { ...cur, [id]: v })), []);
  const pending = open ?? [];
  const current = pending.find((d) => d.id === selected) ?? null;
  const total = useMemo(() => pending.reduce((a, d) => a + (valueOf(d, values[d.id] ?? undefined) ?? 0), 0), [pending, values]);
  const currentValue = current ? valueOf(current, values[current.id] ?? undefined) : null;

  const check = async () => {
    if (!marketId) return;
    setChecking(true);
    setNote(null);
    try {
      const r = await copilotAgentsService.run(marketId);
      setNote(r.created > 0 ? `${r.created} ${r.created === 1 ? 'novidade' : 'novidades'} para você.`
        : r.signals > 0 ? 'Nada novo: os agentes já avisaram tudo o que encontraram.' : 'Nada que precise de você agora.');
      setView('decidir');
      await loadOpen();
    } catch {
      setNote('Não foi possível verificar agora.');
    } finally {
      setChecking(false);
    }
  };

  const togglePause = async () => {
    if (!marketId) return;
    const r = await copilotAgentsService.pause(marketId, !paused);
    setPaused(r.pausado);
    setNote(r.pausado ? 'Pausado: nenhum agente faz nada sozinho até você retomar.' : 'Retomado: os agentes voltam a agir dentro dos seus limites.');
  };

  const decided = () => {
    // Mostra o resultado por um instante e passa para a próxima.
    setTimeout(() => {
      loadOpen().catch(() => {});
    }, 1600);
  };

  const later = () => {
    if (!current) return;
    const i = pending.findIndex((d) => d.id === current.id);
    const next = pending[(i + 1) % pending.length];
    if (next) setSelected(next.id);
  };

  const side = (
    <>
      <PillTabs<View> label="Copiloto" value={view} onChange={setView}
        tabs={[{ key: 'decidir', label: 'Para decidir', icon: Inbox, count: pending.length }, { key: 'historico', label: 'Histórico', icon: History }]} />
      <button type="button" className="fx-btn ghost small" onClick={check} disabled={checking}>
        <RefreshCw className={checking ? 'animate-spin' : ''} aria-hidden="true" />Verificar agora
      </button>
      {anyAlone && (
        <button type="button" className={`fx-btn small ${paused ? 'dark' : 'ghost'}`} onClick={togglePause} aria-pressed={paused}>
          {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}{paused ? 'Retomar o que ele faz sozinho' : 'Pausar tudo'}
        </button>
      )}
      <button type="button" className="fx-btn ghost small" onClick={() => setConfig(true)}><Settings2 aria-hidden="true" />Como ele trabalha</button>
    </>
  );

  return (
    <Layout>
      {view === 'decidir' ? (
        <PageHero
          title={pending.length === 0 ? <>Nada esperando <mark>você.</mark></>
            : currentValue != null ? <>Sua próxima decisão vale <mark>{brl(currentValue)}</mark></>
              : <>Sua loja pede <mark>{pending.length} {pending.length === 1 ? 'decisão.' : 'decisões.'}</mark></>}
          subtitle={pending.length === 0 ? 'Os agentes olham as vendas, as compras e as entregas a cada 5 minutos e avisam aqui quando algo precisar de você.'
            : `${pending.length} ${pending.length === 1 ? 'decisão' : 'decisões'}${total > 0 ? ` · ${brl(total)} em oportunidades` : ''}. Nada acontece sem o seu sim.`}
          side={side}
        />
      ) : (
        <PageHero title={<>Cada decisão deixa um <mark>rastro.</mark></>} subtitle="Veja o que você aprovou, o que o Jev executou e por quê." side={side} />
      )}
      {note && <p role="status" className="fx-muted" style={{ margin: 0 }}>{note}</p>}

      {view === 'decidir' && marketId && (
        !open ? <Loader2 className="animate-spin" aria-label="Carregando" /> : pending.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: 40 }}>
            <CheckCircle2 size={40} style={{ color: 'var(--fx-green)' }} aria-hidden="true" />
            <h2 className="fx-section-title" style={{ marginTop: 10 }}>Nada esperando você</h2>
            <p className="fx-muted">Quando algo precisar de você, aparece aqui. Os urgentes também chegam no WhatsApp.</p>
          </Card>
        ) : (
          <>
            <div className="fx-split">
              <Card as="section" aria-label="Agora importa">
                <PanelTitle title="Agora importa" sub="Decisões que pedem a sua atenção" />
                <div className="fx-stack" style={{ marginTop: 16, gap: 8 }} role="list">
                  {pending.map((d) => {
                    const a = agentOf(d);
                    const I = a.icon;
                    const v = valueOf(d, values[d.id] ?? undefined);
                    return (
                      <div role="listitem" key={d.id}>
                        <button type="button" className={`fx-row ${current?.id === d.id ? 'selected' : ''}`} aria-current={current?.id === d.id || undefined}
                          onClick={() => setSelected(d.id)}>
                          <span className="fx-list-row">
                            <span className="fx-icon-tile" style={d.urgent ? { background: 'var(--fx-red-soft)', color: 'var(--fx-red)' } : undefined}><I aria-hidden="true" /></span>
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <b style={{ fontSize: 16 }}>{a.action}</b>{d.urgent && <Chip tone="red">Urgente</Chip>}
                              </span>
                              <span style={{ display: 'block', fontSize: 14, color: 'var(--fx-ink-2)' }}>{d.title}</span>
                              <span className="fx-muted" style={{ fontSize: 13 }}>{a.label} · {ago(d.createdAt)}</span>
                            </span>
                            <span className="v">{v != null ? brl(v) : ''}<small>{v != null ? a.valueLabel : ''}</small></span>
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Card>
              {current && <DecisionDesk key={current.id} marketId={marketId} decision={current} onDecided={decided} onValue={onValue}
                onLater={pending.length > 1 ? later : undefined} />}
            </div>
            <ExplainStrip items={(EXPLAIN[current?.agent ?? ''] ?? EXPLAIN.DEFAULT).map((e, i) => ({
              icon: [ClipboardCheck, User, Send][i], ...e,
            }))} />
          </>
        )
      )}

      {view === 'historico' && marketId && <HistoryView marketId={marketId} decisions={history} onChanged={() => { loadHistory(); loadOpen(); }} />}

      {config && marketId && <HowItWorks marketId={marketId} onClose={() => setConfig(false)} onAloneChange={setAnyAlone} />}
    </Layout>
  );
};

export default Copilot;
