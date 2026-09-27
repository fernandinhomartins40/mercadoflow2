import React, { useEffect, useState } from 'react';
import { Check, Copy, Mail, MessageCircle, Printer, Send } from 'lucide-react';
import { marketService } from '../../services/market.service';
import type { Supplier, SupplierOrder } from '../../types/analytics.types';
import { buildOrderText, buildPrintHtml, mailtoUrl, whatsappNumber, whatsappUrl } from '../../utils/orderMessage';

type Channel = 'whatsapp' | 'email' | 'copy' | 'print' | 'status';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';
const OPTION = `flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition hover:opacity-90 disabled:opacity-50 ${FOCUS}`;

/**
 * Tira o pedido do app (D-012). Escolher o canal já envia e marca ENVIADO: o
 * comprador não precisa redigitar o pedido no WhatsApp nem lembrar de voltar
 * para mudar o status. Pedido já enviado pode ser reenviado sem mudar nada.
 */
const OrderSendOptions: React.FC<{
  order: SupplierOrder;
  marketId: string;
  /** Rascunho: o canal escolhido também marca o pedido como ENVIADO. */
  markAsSent: boolean;
  onSent?: (updated: SupplierOrder) => void;
  onCancel?: () => void;
}> = ({ order, marketId, markAsSent, onSent, onCancel }) => {
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [busy, setBusy] = useState<Channel | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    marketService.getSuppliers(marketId)
      .then((list: Supplier[]) => { if (!cancelled) setSupplier((list || []).find((s) => s.id === order.supplierId) || null); })
      .catch(() => { /* sem contato: WhatsApp abre para escolher o contato */ });
    return () => { cancelled = true; };
  }, [marketId, order.supplierId]);

  const phoneOk = !!whatsappNumber(supplier?.telefone);
  const email = supplier?.email?.trim() || '';

  const finish = async (message: string) => {
    if (!markAsSent) { setFeedback(message); return; }
    try {
      const updated = await marketService.sendSupplierOrder(marketId, order.id);
      setFeedback(message);
      onSent?.(updated);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Não foi possível marcar o pedido como enviado.');
    }
  };

  const run = async (channel: Channel) => {
    setBusy(channel); setErr(null); setFeedback(null);
    const text = buildOrderText(order);
    try {
      if (channel === 'whatsapp') {
        // Abre antes de qualquer await: navegadores bloqueiam janela aberta depois de uma promessa.
        window.open(whatsappUrl(order, supplier?.telefone), '_blank', 'noopener');
        await finish('WhatsApp aberto com o pedido pronto. É só tocar em enviar.');
      } else if (channel === 'email') {
        window.location.href = mailtoUrl(order, email);
        await finish('E-mail aberto com o pedido pronto.');
      } else if (channel === 'copy') {
        await navigator.clipboard.writeText(text);
        await finish('Pedido copiado. Cole na conversa com o fornecedor.');
      } else if (channel === 'print') {
        const win = window.open('', '_blank');
        if (!win) throw new Error('O navegador bloqueou a janela de impressão.');
        win.document.write(buildPrintHtml(order));
        win.document.close();
        win.focus();
        win.print();
        await finish('Lista de conferência aberta para imprimir ou salvar em PDF.');
      } else {
        await finish('Pedido marcado como enviado.');
      }
    } catch (e: any) {
      setErr(e?.message || 'Não foi possível concluir o envio.');
    } finally {
      setBusy(null);
    }
  };

  const options: Array<{ key: Channel; label: string; hint: string; icon: React.ElementType; style: React.CSSProperties }> = [
    {
      key: 'whatsapp', icon: MessageCircle, style: { background: '#16a34a', color: '#fff' },
      label: 'WhatsApp',
      hint: phoneOk ? `para ${supplier?.telefone}` : 'escolha o contato no WhatsApp',
    },
    ...(email ? [{ key: 'email' as Channel, icon: Mail, style: { border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }, label: 'E-mail', hint: email }] : []),
    { key: 'copy', icon: Copy, style: { border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }, label: 'Copiar texto', hint: 'para colar onde quiser' },
    { key: 'print', icon: Printer, style: { border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }, label: 'Imprimir ou PDF', hint: 'lista de conferência para o representante' },
  ];

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface-info)', border: '1px solid var(--border-info)' }}>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        {markAsSent ? 'Como enviar ao fornecedor?' : 'Enviar de novo'}
      </p>
      {markAsSent && (
        <p className="mb-3 mt-0.5 text-sm" style={{ color: 'var(--text-muted)' }}>
          O pedido vai pronto, sem preços, e passa para ENVIADO (não poderá mais ser editado).
        </p>
      )}
      <div className={`grid gap-2 sm:grid-cols-2 ${markAsSent ? '' : 'mt-3'}`}>
        {options.map(({ key, label, hint, icon: Icon, style }) => (
          <button key={key} type="button" disabled={!!busy} onClick={() => run(key)} className={OPTION} style={{ background: 'var(--surface-base)', ...style }}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block">{busy === key ? 'Enviando...' : label}</span>
              <span className="block truncate text-xs font-normal opacity-80">{hint}</span>
            </span>
          </button>
        ))}
      </div>
      {markAsSent && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} className={`min-h-[44px] rounded-lg px-3 text-sm font-medium ${FOCUS}`} style={{ color: 'var(--text-muted)' }}>
              Voltar
            </button>
          )}
          <button type="button" disabled={!!busy} onClick={() => run('status')} className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium underline disabled:opacity-50 ${FOCUS}`} style={{ color: 'var(--brand-700)' }}>
            <Send className="h-3.5 w-3.5" aria-hidden="true" /> Já enviei por outro meio
          </button>
        </div>
      )}
      <div aria-live="polite">
        {feedback && (
          <p className="mt-3 flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--brand-700)' }}>
            <Check className="h-4 w-4" aria-hidden="true" /> {feedback}
          </p>
        )}
        {err && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      </div>
    </div>
  );
};

export default OrderSendOptions;
