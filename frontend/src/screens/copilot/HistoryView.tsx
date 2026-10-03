import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, History, Info, ShoppingCart, Sparkles, Undo2, User, XCircle } from 'lucide-react';
import { Card, Chip, Forest, PanelTitle, brl } from '../../components/flow/Flow';
import { copilotAgentsService, type CopilotDecision } from '../../services/aiPlatform.service';
import { agentOf, apiError, valueOf, when } from './shared';

/**
 * Histórico: a memória da loja. Cada decisão com quem decidiu (você ou o Jev)
 * e, ao lado, o rastro dela: a sugestão, a resposta e o que aconteceu.
 */

type Filter = 'tudo' | 'aprovadas' | 'sozinho' | 'recusadas' | 'silenciadas';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'tudo', label: 'Tudo' }, { key: 'aprovadas', label: 'Aprovadas' }, { key: 'sozinho', label: 'Feitas sozinho' },
  { key: 'recusadas', label: 'Recusadas' }, { key: 'silenciadas', label: 'Silenciadas pelo Jev' },
];

const statusChip = (d: CopilotDecision) => {
  if (d.autoExecuted) return <Chip tone="green" icon={Sparkles}>Feita pelo Jev</Chip>;
  if (d.status === 'APROVADA') return <Chip tone="green" icon={User}>Aprovada por você</Chip>;
  if (d.status === 'RECUSADA') return <Chip tone="gray" icon={User}>Recusada por você</Chip>;
  if (d.status === 'SILENCIADA') return <Chip tone="gray" icon={Sparkles}>Silenciada pelo Jev</Chip>;
  if (d.status === 'DESFEITA') return <Chip tone="gray" icon={Undo2}>Desfeita</Chip>;
  if (d.status === 'EXPIRADA') return <Chip tone="gray">Expirou</Chip>;
  return <Chip tone="gray">{d.status}</Chip>;
};

const subline = (d: CopilotDecision) => {
  if (d.status === 'RECUSADA' && d.decisionNote) return `"${d.decisionNote}"`;
  if (d.status === 'SILENCIADA') {
    const p = d.funnel?.probabilidadeVale;
    return `O Jev julgou que não valia avisar${p != null ? ` · ${Math.round((1 - p) * 100)}%` : ''}.`;
  }
  if (d.autoExecuted) return 'Executada dentro dos limites que você definiu.';
  if (d.result?.noPedido != null) return `${d.result.noPedido} item(ns) foram para o rascunho de pedido.`;
  if (d.result?.aceitas != null) return `${d.result.aceitas} sugestão(ões) aceitas; resultado medido em 30 dias.`;
  if (d.result?.whatsappUrl) return 'Mensagem enviada ao fornecedor.';
  return d.title;
};

const HistoryView: React.FC<{ marketId: string; decisions: CopilotDecision[]; onChanged: () => void }> = ({ marketId, decisions, onChanged }) => {
  const [filter, setFilter] = useState<Filter>('tudo');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const list = useMemo(() => decisions.filter((d) => {
    if (filter === 'aprovadas') return d.status === 'APROVADA' && !d.autoExecuted;
    if (filter === 'sozinho') return d.autoExecuted;
    if (filter === 'recusadas') return d.status === 'RECUSADA';
    if (filter === 'silenciadas') return d.status === 'SILENCIADA';
    return true;
  }), [decisions, filter]);
  const sel = list.find((d) => d.id === selected) ?? list[0] ?? null;

  const undo = async (d: CopilotDecision) => {
    setBusy(true);
    try { await copilotAgentsService.undo(marketId, d.id); setNote('Desfeita: as sugestões voltaram para a caixa.'); onChanged(); }
    catch (e) { setNote(apiError(e, 'Não foi possível desfazer.')); }
    finally { setBusy(false); }
  };

  return (
    <div className="fx-split wide-left">
      <Card>
        <PanelTitle icon={History} title="Memória da loja" sub="Todas as decisões, ações e alertas do Jev na sua loja." />
        <div className="fx-filters" role="group" aria-label="Filtrar">
          {FILTERS.map((f) => <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>)}
        </div>
        {list.length === 0 ? <p className="fx-muted">Nada com esse filtro.</p> : (
          <div className="fx-timeline">
            {list.map((d) => {
              const dt = new Date(d.decidedAt ?? d.createdAt);
              const byJev = d.autoExecuted || d.status === 'SILENCIADA';
              const v = valueOf(d);
              return (
                <div key={d.id} className="fx-tl">
                  <div className="fx-tl-date">{dt.getDate()}<small>{dt.toLocaleString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase()}</small></div>
                  <button type="button" className={`fx-row ${sel?.id === d.id ? 'selected' : ''}`} onClick={() => setSelected(d.id)} aria-current={sel?.id === d.id || undefined}>
                    <span className="fx-icon-tile" style={{ width: 44, height: 44, borderRadius: '50%' }}>{byJev ? <Sparkles aria-hidden="true" /> : <User aria-hidden="true" />}</span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <b style={{ display: 'block', fontSize: 16 }}>{d.title}</b>
                      <span className="fx-muted" style={{ fontSize: 13.5 }}>{subline(d)}</span>
                    </span>
                    <span style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {statusChip(d)}
                      {v != null && d.status === 'APROVADA' && <b className="fx-num" style={{ fontSize: 17 }}>{brl(v)}</b>}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Forest as="aside" aria-label="Por trás da decisão">
        {!sel ? <p>Escolha uma decisão para ver o rastro dela.</p> : (
          <>
            <PanelTitle icon={History} title="Por trás da decisão" sub="Registro selecionado" />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', margin: '18px 0 0', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-.025em' }}>{sel.title}</h3>
                <p className="fx-muted" style={{ margin: '4px 0 0' }}>{agentOf(sel).label} · {when(sel.decidedAt ?? sel.createdAt)}</p>
              </div>
              {valueOf(sel) != null && <span className="fx-money" style={{ fontSize: 26 }}>{brl(valueOf(sel))}</span>}
            </div>
            <ol className="fx-trail">
              <li>
                <span className="dot"><Info size={18} /></span>
                <span><b>Sugestão apresentada</b><span>{agentOf(sel).label}: {sel.body.split('\n')[0]}</span></span>
                <time>{when(sel.createdAt)}</time>
              </li>
              <li>
                <span className={`dot ${sel.status === 'PENDENTE' ? 'off' : ''}`}>{sel.status === 'RECUSADA' ? <XCircle size={18} /> : sel.autoExecuted ? <Sparkles size={18} /> : <User size={18} />}</span>
                <span>
                  <b>{sel.autoExecuted ? 'Feita pelo Jev' : sel.status === 'RECUSADA' ? 'Sua recusa registrada' : sel.status === 'SILENCIADA' ? 'Silenciada pelo Jev' : 'Sua aprovação registrada'}</b>
                  <span>{sel.autoExecuted ? 'Dentro dos limites que você definiu.' : sel.status === 'RECUSADA' ? (sel.decisionNote ? `Motivo: ${sel.decisionNote}` : 'Sem motivo informado.') : sel.status === 'SILENCIADA' ? 'Não valia um aviso; fica aqui para você conferir.' : `Por ${sel.decidedBy ?? 'você'}.`}</span>
                </span>
                <time>{when(sel.decidedAt)}</time>
              </li>
              {(sel.result?.executado || sel.status === 'DESFEITA') && (
                <li>
                  <span className="dot">{sel.status === 'DESFEITA' ? <Undo2 size={18} /> : <CheckCircle2 size={18} />}</span>
                  <span><b>{sel.status === 'DESFEITA' ? 'Desfeita' : 'Resultado'}</b><span>{subline(sel)}</span></span>
                  <time>{sel.undoneAt ? when(sel.undoneAt) : ''}</time>
                </li>
              )}
            </ol>
            <div className="fx-white">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span className="fx-icon-tile" style={{ width: 40, height: 40 }}><ShoppingCart aria-hidden="true" /></span>
                  <span><b style={{ display: 'block' }}>Origem da ação</b><small>{agentOf(sel).label} · {sel.autoExecuted ? 'Execução automática' : 'Aprovação humana'}</small></span>
                </span>
                {valueOf(sel) != null && <span style={{ textAlign: 'right' }}><small>Valor</small><b style={{ display: 'block', fontSize: 18 }}>{brl(valueOf(sel))}</b></span>}
              </div>
              {sel.status === 'APROVADA' && sel.decidedAt && Date.now() - new Date(sel.decidedAt).getTime() < 86400000 ? (
                <button type="button" className="fx-btn dark" style={{ width: '100%', marginTop: 14 }} disabled={busy} onClick={() => undo(sel)}>
                  <Undo2 aria-hidden="true" />Desfazer (até 24 horas)
                </button>
              ) : sel.result?.noPedido != null ? (
                <Link to="/app/lista-compras" className="fx-btn dark" style={{ width: '100%', marginTop: 14 }}><ExternalLink aria-hidden="true" />Ver o pedido</Link>
              ) : null}
              {note && <p role="status" className="fx-muted" style={{ margin: '10px 0 0' }}>{note}</p>}
            </div>
          </>
        )}
      </Forest>
    </div>
  );
};

export default HistoryView;
