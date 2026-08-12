import React, { useCallback, useEffect, useState } from 'react';
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
  pct: (v?: number | null) => v == null ? '--' : `${Number(v).toFixed(1)}%`,
  days: (v?: number | null) => v == null ? '--' : `${Number(v).toFixed(0)} dias`,
};

const card: React.CSSProperties = {
  border: '1px solid var(--border-soft)',
  background: 'var(--surface-base)',
};

const Section: React.FC<{
  icon: React.FC<any>; title: string; hint?: string; children: React.ReactNode;
}> = ({ icon: Icon, title, hint, children }) => (
  <div className="rounded-xl overflow-hidden" style={card}>
    <div className="flex items-center gap-3 px-5 py-4 border-b"
      style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-soft)' }}>
      <Icon className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</p>
        {hint && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
      </div>
    </div>
    <div className="p-5">{children}</div>
  </div>
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

  return (
    <Layout>
      <div className="flex flex-col gap-5" style={{ maxWidth: '64rem' }}>

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
            <Section
              icon={Users}
              title="Sua base de clientes"
              hint={note}
            >
              {!overview || overview.totalCustomers === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Ainda não há clientes identificados. O CPF precisa ser informado na
                  nota para o cliente entrar na análise.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {[
                      ['Clientes identificados', fmt.int(overview.totalCustomers)],
                      ['Recorrentes', fmt.int(overview.recurringCustomers)],
                      ['Compraram uma vez só', fmt.int(overview.singlePurchaseCustomers)],
                      ['Volta a cada', fmt.days(overview.averageDaysBetweenPurchases)],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[0.68rem]" style={{ color: 'var(--text-soft)' }}>
                          {label}
                        </p>
                        <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* O contraste que justifica investir em recorrência. */}
                  {overview.recurringAverageTicket != null && (
                    <div className="flex flex-wrap gap-6 border-t pt-3"
                      style={{ borderColor: 'var(--border-soft)' }}>
                      <div>
                        <p className="text-[0.68rem]" style={{ color: 'var(--text-soft)' }}>
                          Ticket de quem volta
                        </p>
                        <p className="text-sm font-semibold" style={{ color: 'var(--brand-700)' }}>
                          {fmt.money(overview.recurringAverageTicket)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[0.68rem]" style={{ color: 'var(--text-soft)' }}>
                          Ticket de quem veio uma vez
                        </p>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {fmt.money(overview.singleAverageTicket)}
                        </p>
                      </div>
                      {overview.recurringSharePercent != null && (
                        <div>
                          <p className="text-[0.68rem]" style={{ color: 'var(--text-soft)' }}>
                            Da base é recorrente
                          </p>
                          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {fmt.pct(overview.recurringSharePercent)}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Section>

            {repurchase.length > 0 && (
              <Section
                icon={Repeat}
                title="O que traz o cliente de volta"
                hint="Produtos com maior taxa de recompra — os que criam hábito"
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ color: 'var(--text-muted)' }}>
                        <th className="pb-2 text-left font-medium">Produto</th>
                        <th className="pb-2 text-right font-medium">Clientes</th>
                        <th className="pb-2 text-right font-medium">Recompraram</th>
                        <th className="pb-2 text-right font-medium">Taxa</th>
                        <th className="pb-2 text-right font-medium">Intervalo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repurchase.map(r => (
                        <tr key={r.productId} className="border-t"
                          style={{ borderColor: 'var(--border-soft)' }}>
                          <td className="py-2.5" style={{ color: 'var(--text-primary)' }}>
                            {r.name}
                          </td>
                          <td className="py-2.5 text-right" style={{ color: 'var(--text-muted)' }}>
                            {fmt.int(r.distinctCustomers)}
                          </td>
                          <td className="py-2.5 text-right" style={{ color: 'var(--text-muted)' }}>
                            {fmt.int(r.repurchasingCustomers)}
                          </td>
                          <td className="py-2.5 text-right font-semibold"
                            style={{ color: 'var(--brand-700)' }}>
                            {fmt.pct(r.repurchaseRate)}
                          </td>
                          <td className="py-2.5 text-right" style={{ color: 'var(--text-muted)' }}>
                            {fmt.days(r.averageDaysBetween)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
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
