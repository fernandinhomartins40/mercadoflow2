import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ClipboardList, Loader2 } from 'lucide-react';
import Layout from '../components/layout/Layout';
import { Card, PageHero, Thumb } from '../components/flow/Flow';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { invalidateCached } from '../hooks/useCached';

/**
 * Contagem rápida (F7 do plano de experiência): os produtos que mais vendem e
 * ainda não têm estoque medido. Contar 20 itens leva uns 5 minutos e liga o
 * dinheiro parado, os dias de estoque e a compra certa desses produtos.
 */

interface Suggested { productId: string; name: string; imageUrl: string | null; ean: string | null; unit: string; perDay: number }

const StockCount: React.FC = () => {
  const { marketId } = useAuth();
  const [items, setItems] = useState<Suggested[] | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!marketId) return;
    api.get<Suggested[]>(`/v1/markets/${marketId}/stock-count/suggested`, { params: { limit: 20 } })
      .then((r) => setItems(r.data)).catch(() => setError('Não foi possível carregar os produtos.'));
  }, [marketId]);

  const filled = useMemo(() => Object.entries(counts).filter(([, v]) => v.trim() !== '' && Number(v.replace(',', '.')) >= 0), [counts]);

  const save = async () => {
    if (!marketId || filled.length === 0) return;
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ counted: number }>(`/v1/markets/${marketId}/stock-count`, {
        items: filled.map(([productId, v]) => ({ productId, units: Number(v.replace(',', '.')) })),
      });
      setDone(r.data.counted);
      invalidateCached(`placar:${marketId}`);
    } catch (e) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Não foi possível salvar a contagem.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <PageHero title={<>Conte o estoque <mark>em 5 minutos.</mark></>}
        subtitle="Os produtos que mais vendem e ainda não têm estoque medido. Digite quantas unidades há na loja agora (prateleira e depósito)." />

      {done != null ? (
        <Card style={{ textAlign: 'center', padding: 32 }}>
          <Check size={36} style={{ color: 'var(--fx-green)' }} aria-hidden="true" />
          <h2 className="fx-section-title" style={{ marginTop: 10 }}>{done} {done === 1 ? 'produto contado' : 'produtos contados'}</h2>
          <p className="fx-muted" style={{ margin: '8px auto 0', maxWidth: 520 }}>
            O estoque desses produtos agora é medido. Em alguns minutos o placar do Início, o dinheiro parado e as sugestões de compra passam a usar a contagem.
          </p>
          <div className="fx-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
            <Link to="/app" className="fx-btn dark">Ver o placar</Link>
            <button type="button" className="fx-btn ghost" onClick={() => window.location.reload()}>Contar mais</button>
          </div>
        </Card>
      ) : !items ? (
        <Card>{error ? <p role="alert" style={{ margin: 0 }}>{error}</p> : <Loader2 className="animate-spin" aria-label="Carregando" />}</Card>
      ) : items.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 32 }}>
          <Check size={36} style={{ color: 'var(--fx-green)' }} aria-hidden="true" />
          <h2 className="fx-section-title" style={{ marginTop: 10 }}>Os produtos que mais vendem já têm estoque medido</h2>
          <p className="fx-muted" style={{ margin: '8px 0 0' }}>Nada para contar agora. Volte em 30 dias para conferir de novo.</p>
        </Card>
      ) : (
        <>
          <Card as="section" aria-label="Produtos para contar">
            <ul className="fx-stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 8 }}>
              {items.map((p) => (
                <li key={p.productId} className="fx-row" style={{ cursor: 'default' }}>
                  <Thumb name={p.name} src={p.imageUrl} size={44} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <b style={{ display: 'block', fontSize: 15, lineHeight: 1.25 }}>{p.name}</b>
                    <span className="fx-muted" style={{ fontSize: 12.5 }}>vende {String(p.perDay).replace('.', ',')} por dia{p.ean ? ` · ${p.ean}` : ''}</span>
                  </span>
                  <input className="fx-input fx-num" inputMode="decimal" placeholder="0" aria-label={`Unidades de ${p.name} na loja`}
                    value={counts[p.productId] ?? ''} onChange={(e) => setCounts({ ...counts, [p.productId]: e.target.value })}
                    style={{ width: 84, textAlign: 'right' }} />
                </li>
              ))}
            </ul>
          </Card>
          <div style={{ position: 'sticky', bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))', zIndex: 5 }}>
            <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 16px' }}>
              <span style={{ fontSize: 14.5 }}><b>{filled.length}</b> de {items.length} contados. Deixe em branco o que não contar agora.</span>
              <button type="button" className="fx-btn dark" disabled={busy || filled.length === 0} onClick={save}>
                {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ClipboardList aria-hidden="true" />}Salvar contagem
              </button>
              {error && <p role="alert" style={{ color: 'var(--fx-red)', margin: 0, width: '100%' }}>{error}</p>}
            </Card>
          </div>
        </>
      )}
    </Layout>
  );
};

export default StockCount;
