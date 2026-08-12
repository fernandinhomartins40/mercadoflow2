import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import { useAuth } from '../context/AuthContext';
import {
  networkService, weeklyDigestService,
  BranchSummary, ProductAcrossBranches, TransferSuggestion, PriceDivergence, WeeklyDigest,
} from '../services/network.service';
import {
  Store, ArrowRightLeft, Tag, TrendingUp, Loader2, CalendarDays, Sparkles, RefreshCw,
} from 'lucide-react';

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
  <div className="rounded-xl overflow-hidden" style={card}>
    <div
      className="flex items-center gap-3 px-5 py-4 border-b"
      style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-soft)' }}
    >
      <Icon className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</p>
        {hint && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
      </div>
    </div>
    <div className="p-5">{children}</div>
  </div>
);

const NetworkView: React.FC = () => {
  const { marketId } = useAuth();

  const [isNetwork, setIsNetwork] = useState<boolean | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [products, setProducts] = useState<ProductAcrossBranches[]>([]);
  const [transfers, setTransfers] = useState<TransferSuggestion[]>([]);
  const [divergences, setDivergences] = useState<PriceDivergence[]>([]);
  const [digests, setDigests] = useState<WeeklyDigest[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      // O resumo semanal serve a qualquer loja; o resto só a redes.
      const [status, weekly] = await Promise.all([
        networkService.status(marketId).catch(() => ({ rede: false, filiais: 0 })),
        weeklyDigestService.list(marketId).catch(() => []),
      ]);
      setIsNetwork(status.rede);
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

  return (
    <Layout>
      <div className="flex flex-col gap-5" style={{ maxWidth: '70rem' }}>

        {/* ── Resumo semanal ── */}
        <Section
          icon={CalendarDays}
          title="Como foi sua semana"
          hint={latest
            ? `${fmt.date(latest.semanaDe)} a ${fmt.date(latest.semanaAte)}`
            : 'Ainda sem resumo gerado'}
        >
          {latest ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                {latest.resumo}
              </p>

              {/* Origem do texto: IA do cliente ou o gerador do sistema. */}
              {!latest.textoDoSistema && (
                <span
                  className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.68rem] font-medium"
                  style={{ background: 'var(--surface-soft)', color: 'var(--text-muted)' }}
                >
                  <Sparkles className="h-3 w-3" />
                  escrito pela IA{latest.provedor ? ` (${latest.provedor})` : ''}
                </span>
              )}

              <div className="flex flex-wrap gap-4 border-t pt-3"
                style={{ borderColor: 'var(--border-soft)' }}>
                {[
                  ['Faturamento', fmt.money(latest.numeros?.faturamento)],
                  ['Cupons', fmt.num(latest.numeros?.cupons)],
                  ['Ticket médio', fmt.money(latest.numeros?.ticketMedio)],
                  ...(latest.numeros?.variacaoPercent != null
                    ? [['vs. semana anterior', `${latest.numeros.variacaoPercent}%`]]
                    : []),
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <p className="text-[0.68rem]" style={{ color: 'var(--text-soft)' }}>{label}</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {digests.length > 1 && (
                <div className="border-t pt-3" style={{ borderColor: 'var(--border-soft)' }}>
                  <p className="mb-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                    Semanas anteriores
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {digests.slice(1, 5).map(d => (
                      <div key={d.id} className="flex items-baseline gap-3 text-xs">
                        <span style={{ color: 'var(--text-soft)' }}>{fmt.date(d.semanaDe)}</span>
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {fmt.money(d.numeros?.faturamento)}
                        </span>
                        {d.numeros?.variacaoPercent != null && (
                          <span style={{
                            color: Number(d.numeros.variacaoPercent) >= 0 ? '#15803d' : '#b91c1c',
                          }}>
                            {Number(d.numeros.variacaoPercent) >= 0 ? '+' : ''}
                            {d.numeros.variacaoPercent}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                O resumo é gerado toda segunda de manhã. Você pode gerar o da
                semana passada agora.
              </p>
              <button
                type="button"
                onClick={generateDigest}
                disabled={generating}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--brand-500)' }}
              >
                {generating
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <RefreshCw className="h-4 w-4" />}
                Gerar agora
              </button>
            </div>
          )}
        </Section>

        {/* ── Rede: só para quem tem filiais ── */}
        {isNetwork === false ? (
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
