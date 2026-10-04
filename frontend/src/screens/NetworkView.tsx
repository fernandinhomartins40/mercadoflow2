import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import { useAuth } from '../context/AuthContext';
import {
  networkService, weeklyDigestService,
  BranchSummary, ProductAcrossBranches, TransferSuggestion, PriceDivergence, WeeklyDigest,
  NetworkStatus,
} from '../services/network.service';
import {
  Store, ArrowRightLeft, Tag, TrendingUp, Loader2, CalendarDays, Sparkles, RefreshCw,
} from 'lucide-react';
import { ActionHub, Card, Forest, PageHero, PanelTitle } from '../components/flow/Flow';
import type { LucideIcon } from 'lucide-react';
import { CalendarDays as HxCalendarDays, MessageCircleQuestion as HxMessageCircleQuestion, Sparkles as HxSparkles } from 'lucide-react';

/**
 * Visão de rede + resumo semanal.
 *
 * A auditoria (§12) registrou a ausência de inteligência por filial como o
 * achado mais crítico: a hierarquia existia no banco desde a V34 e era usada
 * só para billing. Esta tela é o que faltava para o dono de mais de uma loja
 * enxergar a rede em vez de trocar de mercado no menu.
 *
 * Para quem tem uma loja só, a seção de rede simplesmente não aparece — mas o
 * resumo semanal aparece, porque serve a todo mundo.
 */

const fmt = {
  money: (v?: number | null) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
      .format(Number(v || 0)),
  num: (v?: number | null, digits = 0) =>
    new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits })
      .format(Number(v || 0)),
  date: (v?: string | null) => {
    if (!v) return '--';
    const d = new Date(`${v}T00:00:00`);
    return Number.isNaN(d.getTime()) ? '--' : d.toLocaleDateString('pt-BR');
  },
};

const card: React.CSSProperties = {
  border: '1px solid var(--border-soft)',
  background: 'var(--surface-base)',
};

const Section: React.FC<{
  icon: React.FC<any>; title: string; hint?: string; children: React.ReactNode;
}> = ({ icon: Icon, title, hint, children }) => (
  <section className="fx-card fx-card-pad">
    <PanelTitle icon={Icon as LucideIcon} title={title} sub={hint} />
    <div style={{ marginTop: 18 }}>{children}</div>
  </section>
);

const NetworkView: React.FC = () => {
  const { marketId } = useAuth();

  const [isNetwork, setIsNetwork] = useState<boolean | null>(null);
  /** O recurso existe mas o plano não alcança — convite diferente de "sem filial". */
  const [planLocked, setPlanLocked] = useState<{ mensagem?: string } | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [products, setProducts] = useState<ProductAcrossBranches[]>([]);
  const [transfers, setTransfers] = useState<TransferSuggestion[]>([]);
  const [divergences, setDivergences] = useState<PriceDivergence[]>([]);
  const [digests, setDigests] = useState<WeeklyDigest[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [weekId, setWeekId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      // O resumo semanal serve a qualquer loja; o resto só a redes.
      const [status, weekly] = await Promise.all([
        networkService.status(marketId)
          .catch((): NetworkStatus => ({ rede: false, filiais: 0 })),
        weeklyDigestService.list(marketId).catch(() => []),
      ]);
      setIsNetwork(status.rede);
      setPlanLocked(status.bloqueadoPorPlano ? { mensagem: status.mensagem } : null);
      setDigests(weekly);

      if (status.rede) {
        const [b, p, t, d] = await Promise.all([
          networkService.branches(marketId).catch(() => []),
          networkService.products(marketId).catch(() => []),
          networkService.transfers(marketId).catch(() => []),
          networkService.priceDivergences(marketId).catch(() => []),
        ]);
        setBranches(b); setProducts(p); setTransfers(t); setDivergences(d);
      }
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => { load(); }, [load]);

  const generateDigest = async () => {
    if (!marketId) return;
    setGenerating(true);
    try {
      await weeklyDigestService.generate(marketId);
      setDigests(await weeklyDigestService.list(marketId));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      </Layout>
    );
  }

  const latest = digests[0];
  const week = digests.find((d) => d.id === weekId) ?? latest ?? null;
  const pct = latest?.numeros?.variacaoPercent != null ? Number(latest.numeros.variacaoPercent) : null;

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <PageHero
          title={latest ? <>Sua semana fechou em <mark>{fmt.money(latest.numeros?.faturamento)}{pct != null ? `, ${pct >= 0 ? '+' : ''}${pct}%.` : '.'}</mark></> : <>Como foi a <mark>sua semana.</mark></>}
          subtitle="O resumo da semana e, com mais de uma loja, a comparação entre elas."
          side={<ActionHub icon={HxCalendarDays} actions={[{ label: 'Abrir o Copiloto', icon: HxSparkles, to: '/app/copiloto' }, { label: 'Perguntar aos dados', icon: HxMessageCircleQuestion, to: '/app/perguntar' }]} />} />

        {/* ── Semanas: a lista à esquerda, a semana aberta no painel ── */}
        {latest && week ? (
          <div className="fx-split">
            <Card as="section" aria-label="Semanas">
              <PanelTitle icon={CalendarDays} title="Suas semanas" sub="O resumo chega toda segunda de manhã" />
              <ul className="fx-stack" style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, gap: 8 }}>
                {digests.slice(0, 8).map((d) => {
                  const on = d.id === week.id;
                  const v = d.numeros?.variacaoPercent != null ? Number(d.numeros.variacaoPercent) : null;
                  return (
                    <li key={d.id}>
                      <button type="button" className={`fx-row ${on ? 'selected' : ''}`} aria-current={on || undefined}
                        onClick={() => {
                          setWeekId(d.id);
                          if (window.innerWidth < 1100) requestAnimationFrame(() => document.getElementById('week-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                        }}>
                        <span className="fx-icon-tile" style={{ width: 44, height: 44 }}><CalendarDays aria-hidden="true" /></span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <b style={{ display: 'block', fontSize: 15.5 }}>{fmt.date(d.semanaDe)} a {fmt.date(d.semanaAte)}</b>
                          <span className="fx-muted" style={{ fontSize: 13 }}>{fmt.num(d.numeros?.cupons)} cupons</span>
                        </span>
                        <span style={{ textAlign: 'right' }}>
                          <b className="fx-num" style={{ display: 'block', fontSize: 15.5 }}>{fmt.money(d.numeros?.faturamento)}</b>
                          {v != null && <span className={`fx-chip ${v >= 0 ? 'green' : 'red'}`} style={{ fontSize: 12, padding: '1px 8px' }}>{v >= 0 ? '+' : ''}{v}%</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <div id="week-panel" style={{ minWidth: 0, scrollMarginTop: 80 }}>
              <Forest as="aside" aria-label="Semana aberta">
                <PanelTitle icon={Sparkles} title={`Semana de ${fmt.date(week.semanaDe)}`} sub={`${fmt.date(week.semanaDe)} a ${fmt.date(week.semanaAte)}`}
                  right={!week.textoDoSistema ? <span className="fx-chip ghost"><Sparkles size={13} aria-hidden="true" />escrito pelo Tino</span> : undefined} />
                <div className="fx-kpis" style={{ marginTop: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                  <div className="fx-kpi"><span>Faturamento</span><b style={{ fontSize: 22 }}>{fmt.money(week.numeros?.faturamento)}</b>
                    {week.numeros?.variacaoPercent != null && <small>{Number(week.numeros.variacaoPercent) >= 0 ? '+' : ''}{week.numeros.variacaoPercent}% vs semana anterior</small>}</div>
                  <div className="fx-kpi"><span>Cupons</span><b style={{ fontSize: 22 }}>{fmt.num(week.numeros?.cupons)}</b></div>
                  <div className="fx-kpi"><span>Ticket médio</span><b style={{ fontSize: 22 }}>{fmt.money(week.numeros?.ticketMedio)}</b></div>
                </div>
                <div className="fx-white" style={{ marginTop: 14 }}>
                  <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{week.resumo}</p>
                </div>
                <div style={{ marginTop: 20 }}>
                  <ActionHub icon={CalendarDays} onForest label="O que fazer com esta semana" actions={[
                    { label: 'Perguntar sobre a semana', icon: HxMessageCircleQuestion, to: `/app/perguntar?q=${encodeURIComponent(`O que explica as vendas da semana de ${fmt.date(week.semanaDe)}?`)}` },
                    { label: 'Abrir o Copiloto', icon: HxSparkles, to: '/app/copiloto' },
                  ]} />
                </div>
              </Forest>
            </div>
          </div>
        ) : (
          <Forest>
            <PanelTitle icon={CalendarDays} title="O primeiro resumo ainda não saiu" sub="Ele é gerado toda segunda de manhã" />
            <p style={{ margin: '14px 0 0', color: 'var(--fx-on-forest)' }}>Você pode gerar o da semana passada agora.</p>
            <button type="button" onClick={generateDigest} disabled={generating} className="fx-btn lime" style={{ marginTop: 14 }}>
              {generating ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}Gerar agora
            </button>
          </Forest>
        )}

        {/* ── Rede: só para quem tem filiais ── */}
        {planLocked ? (
          /* O recurso está pronto; o que falta é o plano. Mostrar o que ele
             faria é o que transforma a tela vazia em argumento de venda. */
          <a
            href="/app/planos"
            className="flex flex-col gap-3 rounded-xl p-6 transition hover:opacity-90"
            style={{ border: '1px dashed var(--border-strong)', background: 'var(--surface-soft)' }}
          >
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4" style={{ color: 'var(--brand-500)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Compare suas lojas
              </p>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {planLocked.mensagem}
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                'Quem fatura mais e onde há capital parado',
                'Sobra numa loja, falta em outra',
                'Mesmo produto com preços diferentes',
              ].map(item => (
                <span
                  key={item}
                  className="rounded-full px-3 py-1 text-xs"
                  style={{
                    background: 'var(--surface-base)',
                    border: '1px solid var(--border-soft)',
                    color: 'var(--text-soft)',
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
            <span className="text-xs font-semibold" style={{ color: 'var(--brand-700)' }}>
              Ver o plano Profissional
            </span>
          </a>
        ) : isNetwork === false ? (
          <div className="rounded-xl p-6 text-center" style={card}>
            <Store className="mx-auto h-6 w-6" style={{ color: 'var(--text-soft)' }} />
            <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
              A comparação entre lojas aparece aqui quando você tiver mais de uma
              filial cadastrada.
            </p>
          </div>
        ) : (
          <>
            <Section
              icon={Store}
              title="Suas lojas"
              hint="Quem mais fatura e onde há mais capital parado"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: 'var(--text-muted)' }}>
                      <th className="pb-2 text-left font-medium">Loja</th>
                      <th className="pb-2 text-right font-medium">Receita</th>
                      <th className="pb-2 text-right font-medium">Produtos</th>
                      <th className="pb-2 text-right font-medium">Estoque</th>
                      <th className="pb-2 text-right font-medium">Parado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branches.map(b => (
                      <tr key={b.marketId} className="border-t"
                        style={{ borderColor: 'var(--border-soft)' }}>
                        <td className="py-2.5" style={{ color: 'var(--text-primary)' }}>
                          {b.name}
                          {b.isHeadquarters && (
                            <span className="ml-2 rounded px-1.5 py-0.5 text-[0.65rem] font-bold"
                              style={{ background: 'var(--surface-soft)', color: 'var(--text-muted)' }}>
                              MATRIZ
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-right" style={{ color: 'var(--text-primary)' }}>
                          {fmt.money(b.revenue)}
                        </td>
                        <td className="py-2.5 text-right" style={{ color: 'var(--text-muted)' }}>
                          {fmt.num(b.products)}
                        </td>
                        <td className="py-2.5 text-right" style={{ color: 'var(--text-muted)' }}>
                          {fmt.money(b.inventoryValue)}
                        </td>
                        <td className="py-2.5 text-right"
                          style={{ color: Number(b.frozenPercent) > 30 ? '#b91c1c' : 'var(--text-muted)' }}>
                          {b.frozenPercent != null ? `${b.frozenPercent}%` : '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {transfers.length > 0 && (
              <Section
                icon={ArrowRightLeft}
                title="Vale transferir"
                hint="Sobra numa loja, falta em outra — o frete não entra na conta"
              >
                <div className="flex flex-col gap-3">
                  {transfers.map((t, i) => (
                    <div key={`${t.productId}-${i}`} className="rounded-lg px-4 py-3"
                      style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {t.productName}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {t.fromBranch} → {t.toBranch}
                        </span>
                        <span className="ml-auto text-sm font-semibold" style={{ color: 'var(--brand-700)' }}>
                          {fmt.num(t.suggestedUnits)} un · {fmt.money(t.estimatedValue)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs" style={{ color: 'var(--text-soft)' }}>{t.reason}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {divergences.length > 0 && (
              <Section
                icon={Tag}
                title="Preços diferentes entre as lojas"
                hint="Nem toda diferença é erro — bairros diferentes suportam preços diferentes"
              >
                <div className="flex flex-col gap-2">
                  {divergences.map(d => (
                    <div key={d.productId}
                      className="flex flex-wrap items-baseline gap-3 border-b pb-2 text-sm"
                      style={{ borderColor: 'var(--border-soft)' }}>
                      <span style={{ color: 'var(--text-primary)' }}>{d.productName}</span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {d.cheapestBranch} {fmt.money(d.cheapestPrice)} ·{' '}
                        {d.priciestBranch} {fmt.money(d.priciestPrice)}
                      </span>
                      <span className="ml-auto font-semibold" style={{ color: '#9a3412' }}>
                        +{d.differencePercent}%
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {products.length > 0 && (
              <Section
                icon={TrendingUp}
                title="Mesmo produto, giro diferente"
                hint="Onde uma loja vende muito mais que a irmã — há o que aprender ou corrigir"
              >
                <div className="flex flex-col gap-3">
                  {products.slice(0, 10).map(p => (
                    <div key={p.productId}>
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {p.productName}
                        </span>
                        {p.spreadPercent != null && (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            diferença de {p.spreadPercent}%
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3">
                        {p.branches.map(b => (
                          <span key={b.marketId} className="text-xs"
                            style={{ color: 'var(--text-soft)' }}>
                            {b.branchName}: {fmt.num(b.dailyVelocity, 2)}/dia
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default NetworkView;
