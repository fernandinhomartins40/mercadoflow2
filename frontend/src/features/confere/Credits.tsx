import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CheckCircle2, Copy, CreditCard, QrCode } from 'lucide-react';
import { confereService, money } from '../../services/confere.service';
import type { ConfereOrder, ConfereStatus } from '../../types/confere.types';
import { BigButton, Shell, TopBar, errorText } from './ui';

/** Saldo e compra de leituras: Pix na chave da plataforma (QR + copia e cola) ou Stripe. */
const Credits: React.FC<{ status: ConfereStatus; marketId: string; refresh: () => void }> = ({ status, marketId, refresh }) => {
  const [order, setOrder] = useState<ConfereOrder | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const location = useLocation();

  // Pix pendente: consulta até o pagamento ser confirmado no painel.
  useEffect(() => {
    if (!order || order.status !== 'PENDING') return undefined;
    const t = setInterval(async () => {
      try {
        const o = await confereService.order(marketId, order.id);
        if (o.status !== 'PENDING') { setOrder(o); refresh(); }
      } catch { /* tenta de novo */ }
    }, 6000);
    return () => clearInterval(t);
  }, [order, marketId, refresh]);

  const buy = async (planId: string, method: 'PIX' | 'STRIPE') => {
    setBusy(planId + method);
    setError(null);
    try {
      const o = await confereService.createOrder(marketId, planId, method);
      if (o.checkoutUrl) { window.location.href = o.checkoutUrl; return; }
      setOrder(o);
    } catch (e) {
      setError(errorText(e, 'Não foi possível criar o pedido.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Shell>
      <TopBar title="Créditos" />
      <div className="flex flex-col gap-4 px-4 pb-10">
        {new URLSearchParams(location.search).get('pagamento') === 'ok' && (
          <p className="rounded-2xl bg-green-100 p-4 text-lg text-green-900">Pagamento enviado. As leituras entram assim que ele for confirmado.</p>
        )}
        <div className="rounded-3xl bg-white p-5">
          <p className="text-lg text-stone-700">Seu saldo</p>
          <p className="text-5xl font-extrabold tabular-nums">{status.balance}</p>
          <p className="text-lg text-stone-700">leituras de nota. Abrir de novo uma nota já lida não gasta crédito.</p>
        </div>
        {status.certificate && (
          <p className="rounded-2xl bg-green-50 p-4 text-lg text-green-900">Com o certificado A1 cadastrado, as notas vêm grátis da Sefaz. Os créditos ficam para quando a Sefaz demorar.</p>
        )}
        {order ? (
          <section className="flex flex-col items-center gap-4 rounded-3xl bg-white p-5 text-center">
            {order.status === 'PAID' ? (
              <>
                <CheckCircle2 className="h-16 w-16 text-green-700" aria-hidden="true" />
                <h2 className="text-2xl font-extrabold">Pagamento confirmado</h2>
                <p className="text-lg">{order.reads} leituras entraram no seu saldo.</p>
                <BigButton onClick={() => setOrder(null)}>Pronto</BigButton>
              </>
            ) : order.status === 'CANCELED' ? (
              <>
                <h2 className="text-2xl font-extrabold">Pedido cancelado</h2>
                <BigButton onClick={() => setOrder(null)}>Voltar</BigButton>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-extrabold">Pague {money(order.amountCents)} no Pix</h2>
                {order.pixQrPng && <img src={`data:image/png;base64,${order.pixQrPng}`} alt="QR code do Pix" className="h-64 w-64" />}
                <p className="text-base text-stone-700">Abra o app do banco, escolha Pix e leia o QR code, ou copie o código:</p>
                {order.pixPayload && (
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(order.pixPayload ?? ''); setCopied(true); setTimeout(() => setCopied(false), 2500); }}
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-green-700 text-lg font-bold text-green-800">
                    <Copy className="h-5 w-5" aria-hidden="true" />{copied ? 'Código copiado' : 'Copiar código Pix'}
                  </button>
                )}
                <p className="text-base text-stone-600" role="status">Aguardando a confirmação do pagamento. Esta tela atualiza sozinha. Identificador: <span className="font-mono">{order.txid}</span></p>
              </>
            )}
          </section>
        ) : (
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-extrabold">Comprar leituras</h2>
            {error && <p role="alert" className="rounded-2xl bg-red-50 p-4 text-lg text-red-800">{error}</p>}
            {status.plans.map((p) => (
              <div key={p.id} className="flex flex-col gap-3 rounded-3xl bg-white p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xl font-bold">{p.name}</span>
                  <span className="text-2xl font-extrabold tabular-nums text-green-800">{money(p.priceCents)}</span>
                </div>
                <span className="text-base text-stone-600">{p.reads} leituras, {money(Math.round(p.priceCents / p.reads))} cada</span>
                <div className="flex gap-2">
                  {status.pixAvailable && (
                    <BigButton onClick={() => buy(p.id, 'PIX')} disabled={!!busy} className="h-14 text-lg"><QrCode className="h-5 w-5" aria-hidden="true" />Pagar com Pix</BigButton>
                  )}
                  {status.stripeAvailable && (
                    <BigButton tone="white" onClick={() => buy(p.id, 'STRIPE')} disabled={!!busy} className="h-14 text-lg"><CreditCard className="h-5 w-5" aria-hidden="true" />Cartão</BigButton>
                  )}
                </div>
              </div>
            ))}
            {!status.pixAvailable && !status.stripeAvailable && <p className="text-lg text-stone-700">A compra de créditos abre em breve.</p>}
          </section>
        )}
      </div>
    </Shell>
  );
};

export default Credits;
