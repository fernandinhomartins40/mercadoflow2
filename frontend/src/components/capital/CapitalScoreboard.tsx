import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, ClipboardCheck, Plug, Wallet } from 'lucide-react';
import { Card, Chip, PanelTitle } from '../flow/Flow';
import { formatMoney } from '../../utils/formatters';
import type { CapitalScoreboard as Score } from '../../services/workingCapital.service';
import type { OutcomesSummary } from '../../services/market.service';

/**
 * "Seu dinheiro na loja" (F2 do plano de experiência): o capital de giro em
 * quatro números, cada um com o selo medido/estimado e a mudança desde que a
 * loja começou. Quando é estimado, o caminho para medir está ali embaixo.
 */

const money0 = (v: number | null | undefined) => (v == null ? '—' : formatMoney(Math.round(Number(v))).replace(/,00$/, ''));
const short = (iso: string | null | undefined) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');

/** Mudança desde a primeira foto: verde quando é bom para o caixa. */
const Delta: React.FC<{ now: number | null | undefined; then: number | null | undefined; since: string | null; goodWhenDown?: boolean; unit: 'money' | 'days' | 'pp' }> = ({ now, then, since, goodWhenDown, unit }) => {
  if (now == null || then == null || !since || Number(now) === Number(then)) return null;
  const diff = Number(now) - Number(then);
  const good = goodWhenDown ? diff < 0 : diff > 0;
  const I = diff < 0 ? ArrowDownRight : ArrowUpRight;
  const text = unit === 'money' ? money0(Math.abs(diff)) : unit === 'days' ? `${Math.abs(Math.round(diff))} ${Math.abs(Math.round(diff)) === 1 ? 'dia' : 'dias'}` : `${Math.abs(diff).toFixed(1).replace('.', ',')} p.p.`;
  return (
    <small style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 700, color: good ? 'var(--fx-green)' : 'var(--fx-red)' }}>
      <I size={14} aria-hidden="true" />{diff < 0 ? '−' : '+'}{text} desde {short(since)}
    </small>
  );
};

const Seal: React.FC<{ measured: boolean; fem?: boolean }> = ({ measured, fem }) => (
  <Chip tone={measured ? 'green' : 'amber'}>{measured ? (fem ? 'medida' : 'medido') : (fem ? 'estimada' : 'estimado')}</Chip>
);

const daysText = (v: number | null | undefined) => {
  if (v == null) return '—';
  const d = Math.round(Number(v));
  return d < 1 ? 'menos de 1 dia' : `${d} ${d === 1 ? 'dia' : 'dias'}`;
};

const CapitalScoreboard: React.FC<{ score: Score | undefined; loading?: boolean; results?: OutcomesSummary }> = ({ score: s, loading, results }) => {
  if (!s) {
    return loading ? <div className="fx-kpis" aria-hidden="true">{[0, 1, 2, 3].map((i) => <div key={i} className="fx-kpi animate-pulse" style={{ height: 120 }} />)}</div> : null;
  }
  const since = s.baseline && s.since && s.since.slice(0, 10) !== new Date().toISOString().slice(0, 10) ? s.since : null;
  const needsMeasure = !s.stockMeasured || !s.marginMeasured;

  return (
    <Card as="section" aria-label="Seu dinheiro na loja">
      <PanelTitle icon={Wallet} title="Seu dinheiro na loja" sub="O capital de giro: quanto está na prateleira, quanto tempo dura e quanto rende" />
      <div className="fx-kpis" style={{ marginTop: 16 }}>
        <div className="fx-kpi">
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>Na prateleira <Seal measured={s.stockMeasured} /></span>
          <b className="fx-num">{s.stockValue != null ? money0(s.stockValue) : 'Não medido'}</b>
          <small className="fx-muted">{s.stockValue != null ? `estoque de ${Math.round(s.stockMeasuredShare * 100)}% do que você vende` : 'falta registrar entradas ou contar'}</small>
          <Delta now={s.stockValue} then={s.baseline?.stockValue} since={since} goodWhenDown unit="money" />
        </div>
        <div className="fx-kpi">
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>Dias de estoque {s.daysOfStock != null && <Seal measured={s.stockMeasured} />}</span>
          <b className="fx-num">{daysText(s.daysOfStock)}</b>
          <small className="fx-muted">quanto o estoque dura no ritmo de venda de hoje</small>
          <Delta now={s.daysOfStock} then={s.baseline?.daysOfStock} since={since} goodWhenDown unit="days" />
        </div>
        <div className="fx-kpi">
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>Margem em 30 dias <Seal measured={s.marginMeasured} fem /></span>
          <b className="fx-num">{money0(s.margin30)}</b>
          <small className="fx-muted">{s.marginPercent != null ? `${Number(s.marginPercent).toFixed(1).replace('.', ',')}% sobre ${money0(s.revenue30)} vendidos` : 'sem venda no período'}</small>
          <Delta now={s.marginPercent} then={s.baseline?.marginPercent} since={since} unit="pp" />
        </div>
        <Link to="/app/decidir?filtro=capital" className="fx-kpi" style={{ textDecoration: 'none', color: 'inherit' }} aria-label="Ver o dinheiro parado em Decidir">
          <span>Dinheiro parado</span>
          <b className="fx-num" style={{ color: Number(s.idleValue) > 0 ? 'var(--fx-red)' : undefined }}>{Number(s.idleValue) > 0 ? money0(s.idleValue) : 'Nada parado'}</b>
          <small className="fx-muted">{s.idleProducts > 0 ? `${s.idleProducts} ${s.idleProducts === 1 ? 'produto encalhando' : 'produtos encalhando'}` : 'nenhum produto encalhando entre os medidos'}</small>
          <Delta now={s.idleValue} then={s.baseline?.idleValue} since={since} goodWhenDown unit="money" />
        </Link>
      </div>
      {results && results.medidas > 0 && (
        <Link to="/app/decidir?aba=resultado" className="fx-row" style={{ marginTop: 14, color: 'inherit', textDecoration: 'none' }}>
          <span style={{ flex: 1, fontSize: 14.5 }}>
            <b>Suas decisões em 30 dias:</b>{' '}
            {[Number(results.dinheiroDeVolta) > 0 ? `${money0(results.dinheiroDeVolta)} voltaram ao caixa` : null,
              Number(results.vendaAMais) > 0 ? `${money0(results.vendaAMais)} de venda a mais` : null,
              `${results.acertos} de ${results.medidas} funcionaram`].filter(Boolean).join(' · ')}
          </span>
        </Link>
      )}
      {needsMeasure && (
        <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="fx-muted" style={{ fontSize: 13.5 }}>
            Números estimados ficam exatos quando o custo e a entrada de mercadoria chegam ao sistema:
          </span>
          {!s.stockMeasured && <Link to="/app/contar" className="fx-btn dark small"><ClipboardCheck aria-hidden="true" />Contar os 20 que mais vendem (5 min)</Link>}
          <a href="/confere" className="fx-btn ghost small"><ClipboardCheck aria-hidden="true" />Conferir notas no Confere</a>
          <Link to="/app/integracoes" className="fx-btn ghost small"><Plug aria-hidden="true" />Ligar o ERP</Link>
        </div>
      )}
    </Card>
  );
};

export default CapitalScoreboard;
