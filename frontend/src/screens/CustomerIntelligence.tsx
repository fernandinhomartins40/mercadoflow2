import React, { useCallback, useEffect, useState } from 'react';
import { formatDecimal } from '../utils/formatters';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { useAuth } from '../context/AuthContext';
import {
  customerService, exportService,
  CustomerOverview, ProductRepurchase, ExportStatus,
} from '../services/advanced.service';
import {
  Users, Repeat, Download, Loader2, Lock, FileSpreadsheet,
} from 'lucide-react';
import { ActionHub, Card, Forest, PageHero, PanelTitle, Thumb } from '../components/flow/Flow';
import { useShoppingList } from '../hooks/useShoppingList';
import { History as HxHistory, ListChecks as HxListChecks, Plus as HxPlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MessageCircleQuestion as HxMessageCircleQuestion, Tag as HxTag, Users as HxUsers } from 'lucide-react';

/**
 * Base de clientes: quem volta e o que faz voltar.
 *
 * A camada existe desde a Fase 2 — CPF hasheado com salt por tenant e
 * k-anonimato de 5 — mas nunca teve tela. Recurso do plano Profissional:
 * análise de base exige base, e loja pequena não tem recorrentes suficientes
 * para o dado sustentar conclusão.
 *
 * A exportação vive aqui também por serem os dois recursos "de operação
 * madura" — quem tem base de clientes para analisar costuma ser quem tem outro
 * sistema para alimentar.
 */

const fmt = {
  int: (v?: number | null) => new Intl.NumberFormat('pt-BR').format(Number(v || 0)),
  money: (v?: number | null) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
      .format(Number(v || 0)),
  pct: (v?: number | null) => v == null ? '--' : `${formatDecimal(Number(v), 1)}%`,
  days: (v?: number | null) => v == null ? '--' : `${formatDecimal(Number(v), 0)} dias`,
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

/** Convite de upgrade que mostra o que o recurso faria. */
const PlanInvite: React.FC<{ titulo: string; mensagem?: string; itens: string[] }> = ({
  titulo, mensagem, itens,
}) => (
  <Link
    to="/app/planos"
    className="flex flex-col gap-3 rounded-xl p-6 transition hover:opacity-90"
    style={{ border: '1px dashed var(--border-strong)', background: 'var(--surface-soft)' }}
  >
    <div className="flex items-center gap-2">
      <Lock className="h-4 w-4" style={{ color: 'var(--brand-500)' }} />
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{titulo}</p>
    </div>
    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{mensagem}</p>
    <div className="flex flex-wrap gap-2">
      {itens.map(item => (
        <span key={item} className="rounded-full px-3 py-1 text-xs"
          style={{
            background: 'var(--surface-base)',
            border: '1px solid var(--border-soft)',
            color: 'var(--text-soft)',
          }}>
          {item}
        </span>
      ))}
    </div>
    <span className="text-xs font-semibold" style={{ color: 'var(--brand-700)' }}>
      Ver o plano Profissional
    </span>
  </Link>
);

const CustomerIntelligence: React.FC = () => {
  const { marketId } = useAuth();

  const [locked, setLocked] = useState<{ mensagem?: string } | null>(null);
  const [overview, setOverview] = useState<CustomerOverview | null>(null);
  const [note, setNote] = useState<string | undefined>();
  const [repurchase, setRepurchase] = useState<ProductRepurchase[]>([]);
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [habId, setHabId] = useState<string | null>(null);
  const { addItem, productIds } = useShoppingList();
  const [added, setAdded] = useState<Set<string>>(new Set());
  const inList = (id: string) => productIds.has(id) || added.has(id);
  const putInList = async (productId: string, name: string) => {
    await addItem({ productId, quantityTarget: 1, sourceTag: 'CLIENTES', reasonSummary: `${name} traz o cliente de volta: não deixar faltar.` });
    setAdded((s) => new Set(s).add(productId));
  };

  const load = useCallback(async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      const [res, exp] = await Promise.all([
        customerService.overview(marketId),
        exportService.status(marketId).catch((): ExportStatus => ({ disponivel: false })),
      ]);
      setExportStatus(exp);

      if (res.bloqueadoPorPlano) {
        setLocked({ mensagem: res.mensagem });
        return;
      }
      setLocked(null);
      setOverview(res.resumo || null);
      setNote(res.observacao);
      setRepurchase(await customerService.repurchase(marketId).catch(() => []));
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => { load(); }, [load]);

  const baixar = async (arquivo: string) => {
    if (!marketId) return;
    setDownloading(arquivo);
    try {
      await exportService.download(marketId, arquivo);
    } finally {
      setDownloading(null);
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

  const hab = repurchase.find((r) => r.productId === habId) ?? repurchase[0] ?? null;
  const share = overview?.recurringSharePercent;

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <PageHero
          title={share != null && overview && overview.totalCustomers > 0
            ? <>Quem volta sustenta a loja. <mark>{fmt.pct(share)} dos clientes voltam.</mark></>
            : <>Quem volta é quem <mark>sustenta a loja.</mark></>}
          subtitle={overview?.recurringAverageTicket != null
            ? `Quem volta gasta ${fmt.money(overview.recurringAverageTicket)} por compra; quem veio uma vez, ${fmt.money(overview.singleAverageTicket)}.`
            : 'Quem volta à loja, com que frequência e o que traz o cliente de volta.'}
          side={<ActionHub icon={HxUsers} actions={[{ label: 'Promover o que traz de volta', icon: HxTag, to: '/app/promocoes' }, { label: 'Perguntar aos dados', icon: HxMessageCircleQuestion, to: '/app/perguntar' }]} />} />

        {locked ? (
          <PlanInvite
            titulo="Conheça quem volta à sua loja"
            mensagem={locked.mensagem}
            itens={[
              'Quantos clientes são recorrentes',
              'Ticket de quem volta vs. quem passa',
              'Produtos que trazem o cliente de volta',
              'A cada quantos dias ele retorna',
            ]}
          />
        ) : (
          <>
            {!overview || overview.totalCustomers === 0 ? (
              <Forest>
                <PanelTitle icon={Users} title="Ainda não há clientes identificados" sub={note || 'O CPF precisa ser informado na nota para o cliente entrar na análise.'} />
                <p style={{ margin: '14px 0 0', color: 'var(--fx-on-forest)' }}>Peça o CPF na nota: com ele, o Tino mostra quem volta, de quanto em quanto tempo e o que traz o cliente de volta.</p>
              </Forest>
            ) : (
              <>
                <div className="fx-kpis">
                  <div className="fx-kpi"><span>Clientes identificados</span><b>{fmt.int(overview.totalCustomers)}</b>{note ? <small>{note}</small> : null}</div>
                  <div className="fx-kpi"><span>Voltam sempre</span><b>{fmt.int(overview.recurringCustomers)}</b><small>{overview.recurringSharePercent != null ? `${fmt.pct(overview.recurringSharePercent)} da base` : ''}</small></div>
                  <div className="fx-kpi"><span>Volta a cada</span><b>{fmt.days(overview.averageDaysBetweenPurchases)}</b></div>
                  <div className="fx-kpi" style={{ background: 'var(--fx-lime-soft)', borderColor: 'var(--fx-lime-line)' }}><span>Ticket de quem volta</span><b>{fmt.money(overview.recurringAverageTicket)}</b><small>quem veio uma vez: {fmt.money(overview.singleAverageTicket)}</small></div>
                </div>
                {repurchase.length > 0 && hab && (
                  <div className="fx-split">
                    <Card as="section" aria-label="O que traz o cliente de volta">
                      <PanelTitle icon={Repeat} title="O que traz o cliente de volta" sub="Produtos que criam hábito, da maior recompra para a menor" />
                      <ul className="fx-stack" style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, gap: 8 }}>
                        {repurchase.map((r) => {
                          const on = r.productId === hab.productId;
                          return (
                            <li key={r.productId}>
                              <button type="button" className={`fx-row ${on ? 'selected' : ''}`} aria-current={on || undefined}
                                onClick={() => {
                                  setHabId(r.productId);
                                  if (window.innerWidth < 1100) requestAnimationFrame(() => document.getElementById('habit-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                                }}>
                                <Thumb name={r.name} src={r.imageUrl} size={46} />
                                <span style={{ minWidth: 0, flex: 1 }}>
                                  <b style={{ display: 'block', fontSize: 15.5 }}>{r.name}</b>
                                  <span className="fx-muted" style={{ fontSize: 13 }}>{fmt.int(r.distinctCustomers)} clientes · volta a cada {fmt.days(r.averageDaysBetween)}</span>
                                </span>
                                <span className="fx-chip lime">{fmt.pct(r.repurchaseRate)}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </Card>
                    <div id="habit-panel" style={{ minWidth: 0, scrollMarginTop: 80 }}>
                      <Forest as="aside" aria-label={`Hábito: ${hab.name}`}>
                        <PanelTitle icon={Repeat} title="Por que ele traz o cliente" sub="Recompra de quem levou o produto" />
                        <div className="flex items-center gap-4" style={{ marginTop: 20 }}>
                          <Thumb name={hab.name} src={hab.imageUrl} size={84} />
                          <h3 style={{ margin: 0, fontSize: 'clamp(20px, 2vw, 28px)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.12 }}>{hab.name}</h3>
                        </div>
                        <p className="fx-desk-lead">
                          {fmt.int(hab.repurchasingCustomers)} de {fmt.int(hab.distinctCustomers)} clientes voltaram para levar de novo, em média a cada {fmt.days(hab.averageDaysBetween)}.
                          {' '}É produto de hábito: não deixe faltar e use como chamariz nas ofertas.
                        </p>
                        <div className="fx-kpis" style={{ marginTop: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                          <div className="fx-kpi"><span>Recompra</span><b style={{ fontSize: 24 }}>{fmt.pct(hab.repurchaseRate)}</b></div>
                          <div className="fx-kpi"><span>Clientes</span><b style={{ fontSize: 24 }}>{fmt.int(hab.distinctCustomers)}</b></div>
                          <div className="fx-kpi"><span>Volta a cada</span><b style={{ fontSize: 24 }}>{fmt.days(hab.averageDaysBetween)}</b></div>
                        </div>
                        <div style={{ marginTop: 20 }}>
                          <ActionHub icon={Repeat} onForest label="O que fazer com este produto" actions={[
                            inList(hab.productId)
                              ? { label: 'Já está na lista', icon: HxListChecks, to: '/app/lista-compras' }
                              : { label: 'Não deixar faltar', icon: HxPlus, onClick: () => { void putInList(hab.productId, hab.name); } },
                            { label: 'Usar como chamariz', icon: HxTag, to: '/app/promocoes' },
                            { label: 'Ver histórico', icon: HxHistory, to: `/app/produtos/${hab.productId}` },
                          ]} />
                        </div>
                      </Forest>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Exportação ── */}
        {exportStatus?.disponivel ? (
          <Section
            icon={FileSpreadsheet}
            title="Levar seus dados para a planilha"
            hint="Abre direto no Excel, com acentos e números no formato brasileiro"
          >
            <div className="flex flex-wrap gap-2">
              {[
                ['capital.csv', 'Capital de giro'],
                ['oportunidades.csv', 'Oportunidades'],
                ['decisoes.csv', 'Decisões tomadas'],
              ].map(([arquivo, label]) => (
                <button
                  key={arquivo}
                  type="button"
                  onClick={() => baixar(arquivo)}
                  disabled={downloading === arquivo}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition hover:opacity-80 disabled:opacity-50"
                  style={{
                    border: '1px solid var(--border-strong)',
                    background: 'var(--surface-soft)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {downloading === arquivo
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Download className="h-3.5 w-3.5" />}
                  {label}
                </button>
              ))}
            </div>
          </Section>
        ) : (
          <PlanInvite
            titulo="Leve seus dados para onde quiser"
            mensagem={exportStatus?.mensagem}
            itens={['Capital de giro em planilha', 'Oportunidades', 'Histórico de decisões']}
          />
        )}
      </div>
    </Layout>
  );
};

export default CustomerIntelligence;
