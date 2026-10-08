import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Check, Clock, History, Info, Loader2, MessageSquare, Pencil, Send, Sparkles, Undo2, X } from 'lucide-react';
import { Chip, PagedList, StepTrack, Thumb, brl, type Step } from '../../components/flow/Flow';
import {
  copilotAgentsService, type CopilotDecision, type DecisionAdjustments, type DecisionItem, type DecisionItems,
} from '../../services/aiPlatform.service';
import { AGENT, REASONS, agentOf, apiError, certainty, when } from './shared';
import CostPriceFields from '../../components/intelligence/CostPriceFields';
import { NeighborhoodLine } from '../../components/product/NeighborhoodPrice';
import { localPriceService, type LocalPriceSnapshot } from '../../services/localPrice.service';
import { moneyInput, parseMoney } from '../../services/decisionInputs.service';

/** Itens que não se aprovam às cegas: custo sempre; preço praticado em promover e liquidar. */
const NEEDS_COST = new Set(['COMPRAR', 'PROMOVER', 'LIQUIDAR']);
const promoDefault = (i: DecisionItem) =>
  i.suggestedPrice ?? (i.price != null ? Math.round(i.price * (1 - (i.discountPct ?? 0) / 100) * 100) / 100 : null);

/**
 * A decisão aberta, como mesa de trabalho: etapas, itens editáveis (quantidade,
 * escolha, desconto, preço), a mensagem que o Tino preparou e o impacto. O que
 * o lojista muda vai junto na aprovação.
 */

type Choice = 'repor' | 'abater' | 'ignorar';

const STEPS: Record<string, [string, string, string, string, string, string]> = {
  RECEBIMENTO: ['Conferido', '', 'Escolher solução', 'Defina o que pedir ao fornecedor', 'Enviar ao fornecedor', 'Mensagem enviada após sua aprovação'],
  COMPRAS: ['Tino calculou', 'Pela venda e pelo estoque', 'Ajustar o pedido', 'Mude quantidades ou tire itens', 'Rascunho do pedido', 'Nada é enviado sem você revisar'],
  CAPITAL: ['Tino encontrou', 'Estoque que não gira', 'Escolher o que liquidar', 'Marque e ajuste o preço', 'Preço no caixa', 'Medido em 30 dias'],
  PROMOCOES: ['Tino sugeriu', 'Pela margem e pela cesta', 'Ajustar o desconto', 'Veja preço e impacto', 'Encarte', 'Você revisa e publica'],
  PRECO: ['Tino comparou', 'Com o preço da região', 'Ajustar o preço', 'Defina o preço novo', 'Preço no caixa', 'Medido em 30 dias'],
};

const STAT_LABEL: Record<string, [string, string]> = {
  faltas: ['item em falta', 'itens em falta'], sobras: ['item a mais', 'itens a mais'], problemas: ['problema', 'problemas'],
  produtos: ['produto', 'produtos'], fornecedores: ['fornecedor', 'fornecedores'], ocorrencias: ['ocorrência em 60 dias', 'ocorrências em 60 dias'],
};

const approveLabel = (d: CopilotDecision) =>
  d.level < 2 ? 'Vou fazer' : d.agent === 'RECEBIMENTO' ? 'Revisar e enviar' : d.agent === 'COMPRAS' ? 'Montar o pedido'
    : d.agent === 'PROMOCOES' ? 'Montar o encarte' : d.agent === 'CAPITAL' ? 'Liquidar os marcados' : 'Aprovar';

const money = (v: number | null | undefined) => (v == null ? '—' : brl(v));

/** Escolha inicial: o que faltou vai para reposição; o que veio a mais ou com problema, para abatimento. */
const defaultChoice = (i: DecisionItem): Choice => (i.action === 'FALTA' ? 'repor' : 'abater');

const ASK_FOR: Record<Choice, string> = { repor: 'repor na próxima entrega', abater: 'abater no boleto', ignorar: '' };

/** Mesmo formato do texto do Confere (Faltou / Veio a mais / Problemas), com o pedido de cada item. */
function buildMessage(supplier: string | null, ref: string | null, items: DecisionItem[], choices: Record<string, Choice>) {
  const line = (i: DecisionItem) => {
    const c = choices[i.id] ?? defaultChoice(i);
    const what = i.action === 'PROBLEMA' ? (i.detail ?? i.name) : `${(i.detail ?? '').replace(/^Faltou |^Veio a mais /, '')} de ${i.name}`;
    return `- ${what} (${ASK_FOR[c]})`;
  };
  const kept = items.filter((i) => (choices[i.id] ?? defaultChoice(i)) !== 'ignorar');
  if (kept.length === 0) return '';
  const group = (action: string, title: string) => {
    const l = kept.filter((i) => i.action === action).map(line);
    return l.length ? `\n\n${title}:\n${l.join('\n')}` : '';
  };
  return `Olá, ${supplier ?? 'fornecedor'}. Conferimos a entrega${ref ? ` da nota ${ref}` : ''} e encontramos:`
    + group('FALTA', 'Faltou') + group('SOBRA', 'Veio a mais') + group('PROBLEMA', 'Problemas')
    + '\n\nPodemos combinar assim? Obrigado.';
}

const DecisionDesk: React.FC<{
  marketId: string;
  decision: CopilotDecision;
  onDecided: (d: CopilotDecision) => void;
  onValue?: (id: string, v: number | null) => void;
  onLater?: () => void;
}> = ({ marketId, decision: d, onDecided, onValue, onLater }) => {
  const [data, setData] = useState<DecisionItems | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState<Record<string, number>>({});
  const [disc, setDisc] = useState<Record<string, number>>({});
  const [price, setPrice] = useState<Record<string, number>>({});
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [actPrice, setActPrice] = useState<Record<string, string>>({});
  const [nearby, setNearby] = useState<Record<string, LocalPriceSnapshot>>({});
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [msg, setMsg] = useState('');
  const [msgEdited, setMsgEdited] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(d.explanation);
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState<CopilotDecision | null>(null);
  const agent = agentOf(d);
  const Icon = agent.icon;
  const pending = d.status === 'PENDENTE' || d.status === 'INFORMATIVA';
  const view = done ?? d;

  useEffect(() => {
    let alive = true;
    setData(null); setOff(new Set()); setQty({}); setDisc({}); setPrice({}); setCosts({}); setActPrice({}); setNearby({}); setChoice({}); setMsgEdited(false); setTouched(false);
    setWhy(d.explanation); setRefusing(false); setDone(null); setError(null);
    copilotAgentsService.items(marketId, d.id).then((r) => {
      if (!alive) return;
      setData(r);
      const c: Record<string, Choice> = {};
      r.items.forEach((i) => { c[i.id] = defaultChoice(i); });
      setChoice(c);
      const cs: Record<string, string> = {};
      const ap: Record<string, string> = {};
      r.items.forEach((i) => {
        if (NEEDS_COST.has(i.action)) cs[i.id] = moneyInput(i.unitCost);
        if (i.action === 'PROMOVER') ap[i.id] = moneyInput(promoDefault(i));
        if (i.action === 'LIQUIDAR') ap[i.id] = moneyInput(i.suggestedPrice ?? i.price);
      });
      setCosts(cs);
      setActPrice(ap);
      // Preço na vizinhança (só PR) dos itens de promoção e liquidação.
      const ids = r.items.filter((i) => (i.action === 'PROMOVER' || i.action === 'LIQUIDAR') && i.productId).map((i) => i.productId as string);
      if (ids.length) {
        localPriceService.products(marketId, ids).then((list) => {
          if (!alive) return;
          const byProduct: Record<string, LocalPriceSnapshot> = {};
          list.forEach((n) => { byProduct[n.product_id] = n; });
          setNearby(byProduct);
        }).catch(() => undefined);
      }
      // Começa com a mensagem que o agente preparou; só é refeita quando o lojista muda uma escolha.
      setMsg(r.message || (r.kind === 'ENTREGA' ? buildMessage(r.supplier, r.reference, r.items, c) : ''));
    }).catch(() => { if (alive) setData({ kind: 'TEXTO', supplier: null, reference: null, items: [], message: null }); });
    return () => { alive = false; };
  }, [marketId, d.id, d.explanation]);

  // Mensagem acompanha as escolhas até o lojista editar à mão.
  useEffect(() => {
    if (data?.kind === 'ENTREGA' && touched && !msgEdited) setMsg(buildMessage(data.supplier, data.reference, data.items, choice));
  }, [choice, data, msgEdited, touched]);

  const items = data?.items ?? [];
  const lineValue = (i: DecisionItem) => {
    if (i.action === 'COMPRAR') return (qty[i.id] ?? i.qty ?? 0) * (parseMoney(costs[i.id] ?? '') ?? i.unitCost ?? 0);
    if (i.action === 'PROMOVER') return parseMoney(actPrice[i.id] ?? '') ?? 0;
    return i.value ?? 0;
  };
  const total = useMemo(() => {
    if (data?.kind === 'ENTREGA') {
      const priced = items.filter((i) => (choice[i.id] ?? defaultChoice(i)) !== 'ignorar' && i.value != null);
      return priced.length ? priced.reduce((a, i) => a + (i.value ?? 0), 0) : null;
    }
    if (data?.kind === 'RECOMENDACOES') {
      const v = items.filter((i) => !off.has(i.id) && i.action !== 'REDUZIR').reduce((a, i) => a + lineValue(i), 0);
      return v > 0 ? v : (d.impact ?? null);
    }
    return d.impact ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, items, choice, off, qty, disc, costs, actPrice, d.impact]);

  useEffect(() => { onValue?.(d.id, total == null ? null : Number(total)); }, [total, d.id, onValue]);

  const toggle = (id: string) => setOff((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const approve = async () => {
    setBusy('approve');
    setError(null);
    const adj: DecisionAdjustments = {};
    if (off.size) adj.excluir = [...off];
    if (Object.keys(qty).length) adj.quantidades = qty;
    if (Object.keys(disc).length) adj.descontos = disc;
    if (Object.keys(price).length) adj.precos = price;
    // Custo e preço praticado de cada item marcado: sem eles a decisão não sai.
    const missing: string[] = [];
    const custos: Record<string, number> = {};
    const promo: Record<string, number> = {};
    const liq: Record<string, number> = {};
    items.filter((i) => !off.has(i.id) && NEEDS_COST.has(i.action)).forEach((i) => {
      const c = parseMoney(costs[i.id] ?? '');
      const p = i.action === 'COMPRAR' ? null : parseMoney(actPrice[i.id] ?? '');
      if (c == null || c <= 0 || (i.action !== 'COMPRAR' && (p == null || p <= 0))) { missing.push(i.name); return; }
      if (c !== i.unitCost) custos[i.id] = c;
      if (i.action === 'PROMOVER') promo[i.id] = p!;
      if (i.action === 'LIQUIDAR') liq[i.id] = p!;
    });
    if (missing.length) {
      setBusy(null);
      setError(`Informe custo e preço de: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` e mais ${missing.length - 4}` : ''}.`);
      return;
    }
    if (Object.keys(custos).length) adj.custos = custos;
    if (Object.keys(promo).length) adj.precosPromocao = promo;
    if (Object.keys(liq).length) adj.precosLiquidacao = liq;
    if (data?.kind === 'ENTREGA' && msg.trim()) adj.mensagem = msg.trim();
    try {
      const r = await copilotAgentsService.approve(marketId, d.id, adj);
      setDone(r);
      if (r.result?.whatsappUrl) window.open(r.result.whatsappUrl, '_blank', 'noopener');
      onDecided(r);
    } catch (e) {
      setError(apiError(e, 'Não foi possível aprovar agora.'));
    } finally {
      setBusy(null);
    }
  };

  const refuse = async (motivo: string) => {
    setBusy('refuse');
    try {
      const r = await copilotAgentsService.refuse(marketId, d.id, motivo || undefined);
      setDone(r);
      onDecided(r);
    } catch (e) {
      setError(apiError(e, 'Não foi possível registrar.'));
    } finally {
      setBusy(null);
    }
  };

  const explain = async () => {
    if (why) { setWhy(null); return; }
    setBusy('why');
    try { setWhy((await copilotAgentsService.explain(marketId, d.id)).texto); }
    catch { setWhy('Não foi possível explicar agora.'); }
    finally { setBusy(null); }
  };

  const undo = async () => {
    setBusy('undo');
    try { const r = await copilotAgentsService.undo(marketId, d.id); setDone(r); onDecided(r); }
    catch (e) { setError(apiError(e, 'Não foi possível desfazer.')); }
    finally { setBusy(null); }
  };

  const steps: Step[] | null = STEPS[d.agent] && d.level >= 2 ? [
    { label: STEPS[d.agent][0], hint: STEPS[d.agent][1] || undefined, state: 'done' },
    { label: STEPS[d.agent][2], hint: STEPS[d.agent][3], state: view.status === 'APROVADA' ? 'done' : 'now' },
    { label: STEPS[d.agent][4], hint: STEPS[d.agent][5], state: view.status === 'APROVADA' ? 'done' : 'next' },
  ] : null;

  const stats = Object.entries(d.numbers ?? {})
    .filter(([k, v]) => STAT_LABEL[k] && Number(v) > 0).slice(0, 2);
  const cert = certainty(d);
  // O resumo do agente (primeiro parágrafo do texto) abre a mesa; na entrega, a mensagem já diz tudo.
  // Sem os tópicos "• Promover X…": a lista logo abaixo já mostra cada item, com preço e ação.
  const lead = data && data.kind !== 'ENTREGA' && data.kind !== 'TEXTO'
    ? d.body.split('\n\n')[0].split('\n').filter((l) => !/^\s*[•*-]\s/.test(l)).join(' ')
      .replace(/(com (\d+(?:,\d+)?)% de desconto): \2% de desconto/g, '$1').replace(/\bCopiloto\b/g, 'Tino').trim() || null
    : null;
  // O que a memória da loja sabe deste fornecedor (linha do corpo, antes da mensagem pronta).
  const memory = d.body.split('\n').slice(1).find((l) => /das últimas \d+/.test(l)) ?? null;
  const meta = data?.kind === 'ENTREGA'
    ? [data.supplier, data.reference ? `Nota ${data.reference}` : null, `Conferida ${when(d.createdAt)}`].filter(Boolean).join(' · ')
    : `${d.title} · ${when(d.createdAt)}`;

  return (
    <div className="fx-forest fx-desk" aria-live="polite" data-testid="decision-desk">
      {/* Topo fixo: o que é, o resumo e os passos. */}
      <div className="fx-desk-top">
      <div className="fx-desk-head">
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minWidth: 0 }}>
          <span className="fx-icon-tile"><Icon aria-hidden="true" /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <h2>{agent.action}</h2>
              {d.urgent && pending && <Chip tone="red">Urgente</Chip>}
              {cert && <Chip tone="ghost">{cert}</Chip>}
              {d.autoExecuted && <Chip tone="lime" icon={Sparkles}>Feito pelo Tino</Chip>}
            </div>
            <p className="fx-desk-meta">{meta}</p>
          </div>
        </div>
        {stats.length > 0 && (
          <div className="fx-stats">
            {stats.map(([k, v]) => <div key={k} className="fx-stat"><b>{Number(v)}</b><span>{STAT_LABEL[k][Number(v) === 1 ? 0 : 1]}</span></div>)}
          </div>
        )}
      </div>

      {lead && <p className="fx-desk-lead">{lead}</p>}

      {steps && <div className="fx-desk-steps"><StepTrack steps={steps} /></div>}
      </div>

      {!data ? <div className="fx-desk-scroll"><Loader2 className="animate-spin" style={{ margin: '24px auto', display: 'block' }} aria-label="Carregando" /></div> : view.status !== 'PENDENTE' && view.status !== 'INFORMATIVA' ? (
        <div className="fx-desk-scroll"><div className="fx-done">
          <span className="ok">{view.status === 'RECUSADA' ? <X size={30} /> : view.status === 'DESFEITA' ? <Undo2 size={28} /> : <Check size={30} />}</span>
          <h3>{view.status === 'RECUSADA' ? 'Recusada' : view.status === 'DESFEITA' ? 'Desfeita' : view.autoExecuted ? 'Feito pelo Tino' : 'Aprovada'}</h3>
          <p>
            {view.status === 'RECUSADA' && `${view.decisionNote ? `Motivo: ${view.decisionNote}. ` : ''}O agente não volta a propor isso nos próximos 14 dias.`}
            {view.status === 'DESFEITA' && 'As sugestões voltaram para a caixa e os itens saíram do rascunho.'}
            {view.status === 'APROVADA' && view.result?.noPedido != null && <>
              {view.result.noPedido} {view.result.noPedido === 1 ? 'item foi' : 'itens foram'} para o rascunho de pedido.
              {view.result.semFornecedor ? ` ${view.result.semFornecedor} sem fornecedor conhecido.` : ''}{' '}
              <Link to="/app/lista-compras">Revisar o pedido</Link>
            </>}
            {view.status === 'APROVADA' && view.result?.aceitas != null && <>
              {view.result.aceitas} {view.result.aceitas === 1 ? 'sugestão aceita' : 'sugestões aceitas'}: o resultado é medido em 30 dias.
              {view.result.encarteUrl && <>{' '}<Link to={view.result.encarteUrl}>Abrir o rascunho do encarte</Link></>}
            </>}
            {view.status === 'APROVADA' && view.result?.whatsappUrl && <>
              Mensagem pronta. <a href={view.result.whatsappUrl} target="_blank" rel="noopener noreferrer">Abrir no WhatsApp de novo</a>
            </>}
          </p>
          {view.status === 'APROVADA' && view.decidedAt && Date.now() - new Date(view.decidedAt).getTime() < 86400000 && (
            <button type="button" className="fx-btn ghost small" style={{ marginTop: 16 }} onClick={undo} disabled={!!busy}>
              <Undo2 aria-hidden="true" />Desfazer
            </button>
          )}
        </div></div>
      ) : (
        <>
          {/* Meio: só os produtos rolam; o paginador fica no pé desta área. */}
          <div className="fx-desk-scroll">
          {why && <div className="fx-white" style={{ marginBottom: 10, lineHeight: 1.5 }}><b style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Sparkles size={16} />Por que o Tino sugeriu isso</b><p style={{ margin: '6px 0 0' }}>{why}</p></div>}
          {data.kind === 'ENTREGA' && memory && (
            <p className="fx-chip amber" style={{ whiteSpace: 'normal', margin: '0 0 12px', padding: '8px 14px' }}><History size={15} aria-hidden="true" />{memory}</p>
          )}
          {data.kind === 'ENTREGA' && (
            <PagedList as="div" className="fx-items" role="list" ariaLabel="Itens com diferença" size={6} label="itens" items={data.items} render={(i) => (
                <div key={i.id} role="listitem" className={`fx-item ${(choice[i.id] ?? defaultChoice(i)) === 'ignorar' ? 'off' : ''}`}>
                  <Thumb name={i.name} src={i.image} size={40} />
                  <div style={{ minWidth: 0 }}>
                    <div className="fx-item-name">{i.name}</div>
                    <div className="fx-item-detail">{i.reasons[0] ? `${i.reasons[0].replace(/^veio/, 'Veio')}; ` : ''}<span className="bad">{(i.detail ?? '').toLowerCase()}</span></div>
                  </div>
                  <div className="fx-item-val"><span>{i.value != null ? 'Valor em falta' : 'Quantidade'}</span><b>{i.value != null ? money(i.value) : `${i.qty ?? ''} ${(i.unit ?? '').toLowerCase()}`}</b></div>
                  <div className="ctl fx-seg" role="group" aria-label={`O que fazer com ${i.name}`}>
                    {(['repor', 'abater', 'ignorar'] as Choice[]).map((c) => (
                      <button key={c} type="button" aria-pressed={(choice[i.id] ?? defaultChoice(i)) === c} onClick={() => { setTouched(true); setChoice({ ...choice, [i.id]: c }); }}>
                        {c === 'repor' ? 'Repor' : c === 'abater' ? 'Abater' : 'Ignorar'}
                      </button>
                    ))}
                  </div>
                </div>
              )} />
          )}

          {data.kind === 'RECOMENDACOES' && <RecommendationItems items={data.items} off={off} toggle={toggle} qty={qty} setQty={setQty}
            price={price} setPrice={setPrice} costs={costs} setCosts={setCosts} actPrice={actPrice} setActPrice={setActPrice} lineValue={lineValue}
            nearby={nearby} />}

          {data.kind === 'TEXTO' && (
            <div className="fx-white"><p style={{ margin: 0, whiteSpace: 'pre-line', lineHeight: 1.55 }}>{d.body}</p></div>
          )}
          </div>

          {/* Rodapé fixo: decidir e o impacto. */}
          <div className="fx-desk-bottom">
            <div className="fx-white">
              {data.kind === 'ENTREGA' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ display: 'flex', gap: 12 }}>
                      <span className="fx-icon-tile" style={{ width: 40, height: 40 }}><MessageSquare aria-hidden="true" /></span>
                      <span><h3>Mensagem preparada pelo Tino</h3><small>Como será enviada ao fornecedor (pode editar)</small></span>
                    </span>
                    <span className="fx-muted" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 14 }}><Pencil size={15} />Editar mensagem</span>
                  </div>
                  <textarea className="fx-msg" value={msg} aria-label="Mensagem para o fornecedor"
                    onChange={(e) => { setMsg(e.target.value); setMsgEdited(true); }} />
                </>
              ) : data.kind === 'RECOMENDACOES' && !lead ? (
                <p style={{ margin: '0 0 12px', color: 'var(--fx-ink-2)', fontSize: 14 }}>{closing(d.agent)}</p>
              ) : null}
              {refusing ? (
                <div className="fx-stack" style={{ gap: 10 }}>
                  <b>Por que não? O Tino aprende com a sua resposta.</b>
                  <div className="fx-actions">
                    {REASONS.map((r) => <button key={r} type="button" className="fx-btn ghost small" disabled={!!busy} onClick={() => refuse(r)}>{r}</button>)}
                  </div>
                  <div className="fx-actions">
                    <input className="fx-input" style={{ flex: 1, minWidth: 0 }} value={reason} onChange={(e) => setReason(e.target.value)}
                      placeholder="Outro motivo (opcional)" aria-label="Outro motivo" maxLength={300} />
                    <button type="button" className="fx-btn dark small" disabled={!!busy} onClick={() => refuse(reason)}>Recusar</button>
                    <button type="button" className="fx-btn ghost small" onClick={() => setRefusing(false)}>Voltar</button>
                  </div>
                </div>
              ) : (
                <div className="fx-actions">
                  {d.status === 'PENDENTE' && (
                    <button type="button" className="fx-btn dark" onClick={approve} disabled={!!busy || (data.kind === 'ENTREGA' && !msg.trim())}>
                      {busy === 'approve' ? <Loader2 className="animate-spin" /> : <Send aria-hidden="true" />}{approveLabel(d)}
                    </button>
                  )}
                  {d.kind === 'AVISO' && <Link to="/app/decidir?filtro=outros" className="fx-btn dark">Ver os sinais da loja</Link>}
                  {onLater && <button type="button" className="fx-btn ghost" onClick={onLater}><Clock aria-hidden="true" />Decidir depois</button>}
                  <button type="button" className="fx-btn ghost" onClick={() => setRefusing(true)} disabled={!!busy}>
                    <X aria-hidden="true" />{d.status === 'INFORMATIVA' ? 'Dispensar' : 'Recusar'}
                  </button>
                </div>
              )}
              {d.funnel?.autonomia && d.funnel.autonomia !== 'feito sozinho' && d.funnel.autonomia !== 'nivel' && d.status === 'PENDENTE' && (
                <p className="fx-muted" style={{ margin: '12px 0 0', fontSize: 13 }}>Não fez sozinho: {d.funnel.autonomia}. Ficou esperando o seu sim.</p>
              )}
              {error && <p role="alert" style={{ color: 'var(--fx-red)', margin: '12px 0 0' }}>{error}</p>}
            </div>
            <div className="fx-impact">
              <h3><BarChart3 size={18} aria-hidden="true" />Impacto da sua decisão</h3>
              <span className="fx-money fx-num">{total != null ? brl(total) : (() => { const n = (data?.items ?? []).filter((it) => data?.kind !== 'ENTREGA' || (choice[it.id] ?? defaultChoice(it)) !== 'ignorar').length; return n > 0 ? `${n} ${n === 1 ? 'item' : 'itens'}` : 'sem valor'; })()}</span>
              <p>{impactText(d.agent)}</p>
              <hr />
              <button type="button" onClick={explain} disabled={busy === 'why'} aria-expanded={!!why}
                style={{ display: 'flex', gap: 8, alignItems: 'center', border: 0, background: 'none', padding: 0, cursor: 'pointer', color: 'var(--fx-green)', fontWeight: 700, fontSize: 14 }}>
                {busy === 'why' ? <Loader2 size={16} className="animate-spin" /> : <Info size={16} />}{why ? 'Fechar' : 'Por quê?'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

function closing(agent: string) {
  if (agent === 'COMPRAS') return 'Os itens vão para o rascunho de pedido de cada fornecedor. Nada é enviado sem você revisar.';
  if (agent === 'CAPITAL') return 'O Tino registra a liquidação e mede em 30 dias se o dinheiro voltou. O preço você muda no caixa.';
  if (agent === 'PROMOCOES') return 'O Tino monta o rascunho do encarte no Estúdio com esses preços. Você revisa e publica.';
  return 'Ao aprovar, o Tino registra a decisão e mede o resultado.';
}

function impactText(agent: string) {
  if (agent === 'RECEBIMENTO') return 'Recuperação solicitada ao fornecedor. Depois do envio, o Tino acompanha a resposta.';
  if (agent === 'COMPRAS') return 'Valor do pedido com as quantidades que você deixou.';
  if (agent === 'CAPITAL') return 'Dinheiro parado nos produtos marcados.';
  if (agent === 'PROMOCOES') return 'Preço final dos produtos no encarte.';
  return 'Estimativa do Tino para esta decisão.';
}

const RecommendationItems: React.FC<{
  items: DecisionItem[]; off: Set<string>; toggle: (id: string) => void;
  qty: Record<string, number>; setQty: (q: Record<string, number>) => void;
  price: Record<string, number>; setPrice: (q: Record<string, number>) => void;
  costs: Record<string, string>; setCosts: (q: Record<string, string>) => void;
  actPrice: Record<string, string>; setActPrice: (q: Record<string, string>) => void;
  lineValue: (i: DecisionItem) => number;
  nearby: Record<string, LocalPriceSnapshot>;
}> = ({ items, off, toggle, qty, setQty, price, setPrice, costs, setCosts, actPrice, setActPrice, lineValue, nearby }) => {
  const buys = items.filter((i) => i.action === 'COMPRAR');
  const groups = new Map<string, DecisionItem[]>();
  buys.forEach((i) => { const k = i.supplier ?? 'Fornecedor a escolher'; groups.set(k, [...(groups.get(k) ?? []), i]); });
  const reduce = items.filter((i) => i.action === 'REDUZIR');
  const others = items.filter((i) => i.action !== 'COMPRAR' && i.action !== 'REDUZIR');

  return (
    <div className="fx-stack" style={{ gap: 14 }}>
      {[...groups.entries()].map(([sup, list]) => (
        <div key={sup} className="fx-stack" style={{ gap: 8 }}>
          <div className="fx-group-head"><b>{sup}</b><span className="fx-num">{list.filter((i) => !off.has(i.id)).length} itens · {brl(list.filter((i) => !off.has(i.id)).reduce((a, i) => a + lineValue(i), 0))}</span></div>
          <PagedList as="div" className="fx-items" size={6} label="itens" items={list} render={(i) => {
              const q = qty[i.id] ?? i.qty ?? 0;
              return (
                <div key={i.id} className={`fx-item ${off.has(i.id) ? 'off' : ''}`}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input type="checkbox" className="fx-check" checked={!off.has(i.id)} onChange={() => toggle(i.id)} aria-label={`Incluir ${i.name}`} />
                    <Thumb name={i.name} src={i.image} size={40} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="fx-item-name">{i.name}</div>
                    {i.reasons.length > 0 && <div className="fx-reasons">{i.reasons.map((r) => <span key={r}>{r}</span>)}</div>}
                  </div>
                  <div className="ctl">
                    <span className="fx-stepper">
                      <button type="button" aria-label={`Menos ${i.name}`} onClick={() => setQty({ ...qty, [i.id]: Math.max(0, q - 1) })}>−</button>
                      <input inputMode="numeric" value={q} aria-label={`Quantidade de ${i.name}`}
                        onChange={(e) => setQty({ ...qty, [i.id]: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
                      <button type="button" aria-label={`Mais ${i.name}`} onClick={() => setQty({ ...qty, [i.id]: q + 1 })}>+</button>
                    </span>
                    <span className="fx-hint">{i.suggestedQty != null && q !== Number(i.suggestedQty) ? `sugerido ${i.suggestedQty}` : 'sugerido'}</span>
                  </div>
                  <div className="fx-item-val">
                    {i.unitCost != null ? <span>{brl(i.unitCost)}/{i.unit ?? 'un.'}</span> : (
                      <input className="fx-input fx-num" inputMode="decimal" value={costs[i.id] ?? ''} placeholder="custo/un." style={{ width: 96, textAlign: 'right', padding: '6px 8px' }}
                        aria-label={`Custo de ${i.name}`} onChange={(e) => setCosts({ ...costs, [i.id]: e.target.value })} />
                    )}
                    <b>{brl(lineValue(i))}</b>
                  </div>
                </div>
              );
            }} />
        </div>
      ))}

      {reduce.length > 0 && (
        <div className="fx-stack" style={{ gap: 8 }}>
          <div className="fx-group-head"><b>Comprar menos na próxima</b><span>o Tino viu sobra</span></div>
          <PagedList as="div" className="fx-items" size={6} label="itens" items={reduce} render={(i) => (
              <div key={i.id} className={`fx-item ${off.has(i.id) ? 'off' : ''}`} style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}>
                <Thumb name={i.name} src={i.image} size={40} />
                <div style={{ minWidth: 0 }}>
                  <div className="fx-item-name">{i.name}</div>
                  {i.reasons.length > 0 && <div className="fx-reasons">{i.reasons.map((r) => <span key={r}>{r}</span>)}</div>}
                </div>
                <button type="button" role="switch" className="fx-switch" aria-checked={!off.has(i.id)} onClick={() => toggle(i.id)} aria-label={`Aceitar reduzir ${i.name}`} />
              </div>
            )} />
        </div>
      )}

      {others.length > 0 && (
        <PagedList as="div" className="fx-items" size={4} label="produtos" items={others} render={(i) => {
            const act = i.action === 'PROMOVER' || i.action === 'LIQUIDAR';
            return (
              <div key={i.id} className={`fx-item ${off.has(i.id) ? 'off' : ''}`}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input type="checkbox" className="fx-check" checked={!off.has(i.id)} onChange={() => toggle(i.id)} aria-label={`Incluir ${i.name}`} />
                  <Thumb name={i.name} src={i.image} size={40} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="fx-item-name">{i.name}</div>
                  {i.reasons.length > 0 && <div className="fx-reasons">{i.reasons.map((r) => <span key={r}>{r}</span>)}</div>}
                  {act && (
                    <div className="fx-item-fields" style={{ marginTop: 10 }}>
                      <CostPriceFields compact name={i.name} cost={costs[i.id] ?? ''} onCost={(v) => setCosts({ ...costs, [i.id]: v })}
                        costSource={i.costSource} price={actPrice[i.id] ?? ''} onPrice={(v) => setActPrice({ ...actPrice, [i.id]: v })}
                        priceLabel={i.action === 'LIQUIDAR' ? 'Preço de liquidação' : 'Preço da promoção'} currentPrice={i.price} />
                      <NeighborhoodLine snapshot={i.productId ? nearby[i.productId] : null} />
                    </div>
                  )}
                </div>
                <div className="ctl">
                  {i.action === 'PRECO' && i.price != null && (
                    <label className="fx-field" style={{ alignItems: 'flex-end' }}>
                      Preço novo
                      <input className="fx-input fx-num" style={{ width: 110, textAlign: 'right' }} inputMode="decimal" aria-label={`Preço de ${i.name}`}
                        defaultValue={(price[i.id] ?? i.suggestedPrice ?? i.price).toFixed(2).replace('.', ',')}
                        onBlur={(e) => { const v = parseFloat(e.target.value.replace(',', '.')); if (v > 0) setPrice({ ...price, [i.id]: v }); }} />
                    </label>
                  )}
                </div>
                <div className="fx-item-val">
                  {i.action === 'PROMOVER' && i.price != null ? <><span>de {brl(i.price)}</span><b>{brl(lineValue(i))}</b></>
                    : <><span>{i.action === 'LIQUIDAR' ? 'parados' : 'impacto'}</span><b>{i.value != null ? brl(i.value) : '—'}</b></>}
                </div>
              </div>
            );
          }} />
      )}
    </div>
  );
};

export default DecisionDesk;
export { AGENT };
