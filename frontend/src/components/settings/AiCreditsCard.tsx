import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy, Loader2, QrCode, Sparkles } from 'lucide-react';
import { aiCreditsService, type AiCreditsStatus, type AiOrderRow } from '../../services/aiPlatform.service';

/**
 * Créditos de IA do MercadoFlow: a plataforma compra a IA nos provedores e o
 * mercado usa por pacote. Saldo, uso do mês, compra por Pix e extrato.
 */

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const LEDGER_KIND: Record<string, string> = {
  GRANT: 'Créditos de teste', PURCHASE: 'Compra', USE: 'Uso', ADJUST: 'Ajuste', REFUND: 'Estorno',
};

const AiCreditsCard: React.FC<{ marketId: string }> = ({ marketId }) => {
  const [data, setData] = useState<AiCreditsStatus | null>(null);
  const [order, setOrder] = useState<AiOrderRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => { aiCreditsService.status(marketId).then(setData).catch(() => setError('Não foi possível carregar os créditos.')); }, [marketId]);
  useEffect(load, [load]);

  // Pix pendente: consulta até o pagamento ser confirmado.
  useEffect(() => {
    if (!order || order.status !== 'PENDING') return undefined;
    const t = setInterval(async () => {
      try {
        const o = await aiCreditsService.order(marketId, order.id);
        if (o.status !== 'PENDING') { setOrder(o); load(); }
      } catch { /* tenta de novo */ }
    }, 6000);
    return () => clearInterval(t);
  }, [order, marketId, load]);

  const buy = async (planId: string) => {
    setBusy(planId);
    setError(null);
    try { setOrder(await aiCreditsService.createOrder(marketId, planId)); }
    catch (e) { setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Não foi possível criar o pedido.'); }
    finally { setBusy(null); }
  };

  const w = data?.wallet;
  const pct = w ? Math.min(100, Math.round((w.monthUsed / Math.max(1, w.effectiveCap)) * 100)) : 0;

  return (
    <section id="creditos-ia" className="card flex flex-col gap-4 p-5" aria-labelledby="ai-credits-title">
      <div className="flex items-start gap-3">
        <span className="lg-tinted flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"><Sparkles className="h-5 w-5" /></span>
        <div>
          <h2 id="ai-credits-title" className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Créditos de IA</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            O Copiloto usa créditos para responder perguntas, explicar oportunidades e montar planos. Sem créditos, tudo continua funcionando com o texto do sistema.
          </p>
        </div>
      </div>

      {!data ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl p-4" style={{ background: 'var(--surface-soft)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Saldo</span>
              <span className="block text-3xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{w!.available ?? w!.balance}</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>créditos · 1 crédito ≈ 1 pergunta simples</span>
              {!!w!.includedMonthly && (
                <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                  {w!.included ?? 0} do plano neste mês (de {w!.includedMonthly}, renovam todo mês) + {w!.balance} comprados
                </span>
              )}
            </div>
            <div className="rounded-xl p-4" style={{ background: 'var(--surface-soft)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Uso neste mês</span>
              <span className="block text-3xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{w!.monthUsed}</span>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Uso do teto mensal">
                <div className="h-full rounded-full bg-green-600" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>teto de {w!.effectiveCap} por mês, para não haver surpresa</span>
            </div>
          </div>

          {data.aviso && <p role="status" className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface-warning)', color: '#92400e' }}>{data.aviso}</p>}
          {error && <p role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

          {order ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border p-4 text-center" style={{ borderColor: 'var(--border-soft)' }}>
              {order.status === 'PAID' ? (
                <>
                  <CheckCircle2 className="h-10 w-10 text-green-600" />
                  <p className="text-base font-semibold">Pagamento confirmado: {order.credits} créditos entraram no saldo.</p>
                  <button type="button" className="lg-soft rounded-full px-4 py-2 text-sm font-semibold" onClick={() => setOrder(null)}>Pronto</button>
                </>
              ) : order.status === 'CANCELED' ? (
                <>
                  <p className="text-base font-semibold">Pedido cancelado.</p>
                  <button type="button" className="lg-soft rounded-full px-4 py-2 text-sm font-semibold" onClick={() => setOrder(null)}>Voltar</button>
                </>
              ) : (
                <>
                  <p className="text-base font-semibold">Pague {brl(order.amountCents)} no Pix</p>
                  {order.pixQrPng && <img src={`data:image/png;base64,${order.pixQrPng}`} alt="QR code do Pix" className="h-52 w-52" />}
                  {order.pixPayload && (
                    <button type="button" onClick={() => { navigator.clipboard?.writeText(order.pixPayload ?? ''); setCopied(true); setTimeout(() => setCopied(false), 2500); }}
                      className="lg-soft inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold">
                      <Copy className="h-4 w-4" />{copied ? 'Código copiado' : 'Copiar código Pix'}
                    </button>
                  )}
                  <p className="text-xs" role="status" style={{ color: 'var(--text-muted)' }}>Aguardando a confirmação. Esta tela atualiza sozinha. Identificador: <span className="font-mono">{order.txid}</span></p>
                </>
              )}
            </div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-3" aria-label="Pacotes de créditos">
              {data.plans.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 rounded-xl border p-3" style={{ borderColor: 'var(--border-soft)' }}>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                  <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--brand-700)' }}>{brl(p.priceCents)}</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.credits} créditos · {brl(Math.round(p.priceCents / p.credits))} cada</span>
                  <button type="button" onClick={() => buy(p.id)} disabled={!!busy}
                    className="lg-tinted mt-auto inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-semibold disabled:opacity-60">
                    {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}Pagar com Pix
                  </button>
                </li>
              ))}
            </ul>
          )}

          {data.ledger.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold" style={{ color: 'var(--text-primary)' }}>Extrato</summary>
              <ul className="mt-2 flex flex-col">
                {data.ledger.slice(0, 20).map((l, i) => (
                  <li key={i} className="flex justify-between gap-3 border-t py-1.5" style={{ borderColor: 'var(--border-soft)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{new Date(l.createdAt).toLocaleDateString('pt-BR')} · {l.note ?? LEDGER_KIND[l.kind] ?? l.kind}</span>
                    <span className={`tabular-nums ${l.delta < 0 ? 'text-red-700' : 'text-green-700'}`}>{l.delta > 0 ? '+' : ''}{l.delta}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
};

export default AiCreditsCard;
