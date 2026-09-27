import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Undo2, X } from 'lucide-react';
import { marketService } from '../../services/market.service';
import type { RecommendationOrderLink, Supplier } from '../../types/analytics.types';

export interface DecisionFeedbackState {
  recommendationId: string;
  title: string;
  decision: 'ACEITA' | 'REJEITADA';
  orderLink?: RecommendationOrderLink | null;
  /** Texto final depois de desfazer; esconde as ações. */
  notice?: string;
}

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';
const BTN = `inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold no-underline disabled:opacity-50 ${FOCUS}`;

const qty = (v?: number | null) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(Number(v || 0));

const message = (f: DecisionFeedbackState) => {
  if (f.notice) return f.notice;
  const link = f.orderLink;
  if (f.decision === 'REJEITADA') return 'Recomendação recusada.';
  if (!link) return 'Recomendação aceita. O resultado será medido em 30 dias.';
  switch (link.status) {
    case 'ADDED':
      return `${qty(link.quantity)} un. no pedido ${link.orderNumber} (${link.supplierName}), em rascunho.`;
    case 'UPDATED':
      return `Quantidade ajustada para ${qty(link.quantity)} un. no pedido ${link.orderNumber} (${link.supplierName}).`;
    case 'ALREADY_IN_ORDER':
      return `O produto já estava no pedido ${link.orderNumber} (${link.supplierName}) com ${qty(link.quantity)} un.`;
    default:
      return `Aceita. De qual fornecedor comprar ${qty(link.quantity)} un.?`;
  }
};

/**
 * Resposta imediata à decisão (D-011): diz o que aconteceu com o pedido, leva
 * direto a ele e permite desfazer. Sem histórico de compra do produto, pergunta
 * o fornecedor aqui mesmo em vez de mandar o comprador para outra tela.
 */
const DecisionFeedback: React.FC<{
  feedback: DecisionFeedbackState;
  marketId: string;
  onChange: (next: DecisionFeedbackState | null) => void;
  /** Depois de desfazer: recarregar a lista para a recomendação voltar. */
  onUndone: () => void;
}> = ({ feedback, marketId, onChange, onUndone }) => {
  const needsSupplier = !feedback.notice && feedback.orderLink?.status === 'NEEDS_SUPPLIER';
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // O card aceito some da lista; o aviso precisa estar à vista de quem tocou.
  useEffect(() => {
    boxRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [feedback.recommendationId]);

  useEffect(() => {
    if (!needsSupplier) return;
    let cancelled = false;
    marketService.getSuppliers(marketId)
      .then((list: Supplier[]) => {
        if (cancelled) return;
        const active = (list || []).filter((s) => s.isActive !== false);
        setSuppliers(active);
        if (active.length === 1) setSupplierId(active[0].id);
      })
      .catch(() => { if (!cancelled) setSuppliers([]); });
    return () => { cancelled = true; };
  }, [needsSupplier, marketId]);

  const undo = async () => {
    setBusy(true); setErr(null);
    try {
      const result = await marketService.undoRecommendationDecision(marketId, feedback.recommendationId);
      onChange(result?.orderKept
        ? { ...feedback, orderLink: null, notice: 'Decisão desfeita. O pedido já tinha sido enviado, então o item continua nele.' }
        : null);
      onUndone();
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Não foi possível desfazer.');
    } finally {
      setBusy(false);
    }
  };

  const addToOrder = async () => {
    if (!supplierId) return;
    setBusy(true); setErr(null);
    try {
      const rec = await marketService.addRecommendationToOrder(marketId, feedback.recommendationId, supplierId);
      onChange({ ...feedback, orderLink: rec?.orderLink ?? null });
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Não foi possível adicionar ao pedido.');
    } finally {
      setBusy(false);
    }
  };

  const orderId = feedback.orderLink?.orderId;

  return (
    <div
      ref={boxRef}
      role="status"
      className="rounded-xl p-4"
      style={{ background: 'var(--surface-success)', border: '1px solid var(--border-success)' }}
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--brand-700)' }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{feedback.title}</p>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-muted)' }}>{message(feedback)}</p>

          {needsSupplier && (
            <div className="mt-3">
              {suppliers === null ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Carregando fornecedores...</p>
              ) : suppliers.length === 0 ? (
                <Link to="/app/lista-compras" className={`${BTN} px-0 underline`} style={{ color: 'var(--brand-700)' }}>
                  Cadastrar o primeiro fornecedor
                </Link>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="sr-only" htmlFor="decision-supplier">Fornecedor</label>
                  <select
                    id="decision-supplier"
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className={`min-h-[44px] flex-1 rounded-lg px-3 text-sm ${FOCUS}`}
                    style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
                  >
                    <option value="">Escolha o fornecedor</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.nomeFantasia || s.razaoSocial}</option>
                    ))}
                  </select>
                  <button type="button" onClick={addToOrder} disabled={busy || !supplierId} className={BTN} style={{ background: 'var(--brand-700)', color: '#fff' }}>
                    {busy ? 'Adicionando...' : 'Pôr no pedido'}
                  </button>
                </div>
              )}
            </div>
          )}

          {!feedback.notice && <div className="mt-2 flex flex-wrap items-center gap-2">
            {orderId && !needsSupplier && (
              <Link to={`/app/lista-compras?pedido=${orderId}`} className={BTN} style={{ background: 'var(--brand-700)', color: '#fff' }}>
                Ver pedido
              </Link>
            )}
            <button type="button" onClick={undo} disabled={busy} className={BTN} style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-base)' }}>
              <Undo2 className="h-4 w-4" aria-hidden="true" /> Desfazer
            </button>
          </div>}
          {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
        </div>
        <button type="button" onClick={() => onChange(null)} aria-label="Fechar aviso" className={`rounded-lg p-2 ${FOCUS}`} style={{ color: 'var(--text-muted)' }}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default DecisionFeedback;
