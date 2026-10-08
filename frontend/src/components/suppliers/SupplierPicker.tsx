import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import SupplierModal from './SupplierModal';
import { marketService } from '../../services/market.service';
import type { Supplier, SupplierOrder, SupplierProductLink } from '../../types/analytics.types';

/** Nome do fornecedor de um pedido; rascunho sem fornecedor diz que falta escolher. */
export const orderSupplierName = (o: Pick<SupplierOrder, 'supplierFantasia' | 'supplierName'>) =>
  o.supplierFantasia || o.supplierName || 'Fornecedor a definir';

/**
 * Escolher (ou trocar) o fornecedor de um rascunho. O pedido pode ser montado
 * sem fornecedor; ele só é exigido para enviar.
 */
const SupplierPicker: React.FC<{ marketId: string; order: SupplierOrder; onChanged: (o: SupplierOrder) => void; compact?: boolean; productIds?: string[] }> = ({ marketId, order, onChanged, compact, productIds }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  // Quantos produtos do pedido cada fornecedor já vendeu (pelas notas do Confere).
  const [covers, setCovers] = useState<Record<string, number>>({});
  const ids = (productIds ?? (order.items ?? []).map((i) => i.productId)).filter(Boolean);
  const idsKey = [...new Set(ids)].sort().join(',');
  useEffect(() => {
    if (!idsKey) { setCovers({}); return; }
    marketService.getSuppliersByProducts(marketId, idsKey.split(',')).then((links: SupplierProductLink[]) => {
      const c: Record<string, number> = {};
      (links || []).forEach((l) => { c[l.supplierId] = (c[l.supplierId] ?? 0) + 1; });
      setCovers(c);
    }).catch(() => setCovers({}));
  }, [marketId, idsKey]);
  const total = idsKey ? idsKey.split(',').length : 0;
  const sorted = [...suppliers].sort((a, b) => (covers[b.id] ?? 0) - (covers[a.id] ?? 0));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState(false);

  const load = useCallback(() => {
    marketService.getSuppliers(marketId).then((d) => setSuppliers(d || [])).catch(() => setSuppliers([]));
  }, [marketId]);
  useEffect(() => { load(); }, [load]);

  const choose = async (supplierId: string) => {
    setBusy(true); setErr(null);
    try { onChanged(await marketService.updateSupplierOrderSupplier(marketId, order.id, supplierId || null)); }
    catch (e: any) { setErr(e?.response?.data?.message || 'Não foi possível escolher o fornecedor.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Building2 size={16} aria-hidden="true" style={{ color: 'var(--fx-muted)' }} />
        <select className="fx-input" value={order.supplierId ?? ''} disabled={busy} aria-label="Fornecedor do pedido"
          onChange={(e) => { void choose(e.target.value); }} style={{ minWidth: compact ? 180 : 240, flex: '1 1 200px', padding: '8px 10px' }}>
          <option value="">Fornecedor a definir</option>
          {sorted.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nomeFantasia || s.razaoSocial}{covers[s.id] ? ` · vende ${covers[s.id]} de ${total}` : ''}
            </option>
          ))}
        </select>
        <button type="button" className="fx-btn ghost small" onClick={() => setModal(true)}><Plus aria-hidden="true" />Cadastrar</button>
      </div>
      {!order.supplierId && <small style={{ color: 'var(--fx-muted)' }}>Pode montar o pedido agora; o fornecedor só é preciso para enviar.</small>}
      {err && <small role="alert" style={{ color: 'var(--fx-red)' }}>{err}</small>}
      {modal && (
        <SupplierModal marketId={marketId} onClose={() => setModal(false)}
          onSelect={(s: Supplier) => { setModal(false); load(); void choose(s.id); }} />
      )}
    </div>
  );
};

export default SupplierPicker;
