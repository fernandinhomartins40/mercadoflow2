import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ClipboardList, Loader2, PackageX, ScanBarcode } from 'lucide-react';
import Layout from '../components/layout/Layout';
import { Card, PageHero, Thumb } from '../components/flow/Flow';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { stockCountService } from '../services/confere.service';
import { invalidateCached } from '../hooks/useCached';
import LoadError, { errorText } from '../components/common/LoadError';
import { useTeamPermission } from '../lib/teamPermissions';
import RoleNotice from '../components/common/RoleNotice';
import { COUNT_TEXT as T, isBarcode, parseUnits } from '../lib/stockCount';

/**
 * Contagem rápida (F7 do plano de experiência): os produtos que mais vendem e
 * ainda não têm estoque medido. Contar 20 itens leva uns 5 minutos e liga o
 * dinheiro parado, os dias de estoque e a compra certa desses produtos.
 * Mesmos textos do Bipaê; o leitor USB digita o código + Enter no campo de busca.
 */

interface Suggested { productId: string; name: string; imageUrl: string | null; ean: string | null; unit: string; perDay: number }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const StockCount: React.FC = () => {
  const { marketId } = useAuth();
  const [items, setItems] = useState<Suggested[] | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const denied = useTeamPermission().hint('OPERATION');
  const [loadError, setLoadError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [looking, setLooking] = useState(false);
  const [missing, setMissing] = useState<string | null>(null);
  const [lookError, setLookError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const lastCode = useRef('');

  useEffect(() => {
    if (!marketId) return;
    setLoadError(null);
    api.get<Suggested[]>(`/v1/markets/${marketId}/stock-count/suggested`, { params: { limit: 20 } })
      .then((r) => setItems(r.data)).catch((e) => setLoadError(e));
  }, [marketId, attempt]);

  const filled = useMemo(() => Object.entries(counts).filter(([, v]) => v.trim() !== '' && Number(v.replace(',', '.')) >= 0), [counts]);

  // Busca por nome filtra a lista; código de barras procura o produto (Enter).
  const shown = useMemo(() => {
    if (!items) return [];
    const q = search.trim();
    if (!q || /^\d+$/.test(q)) return items;
    const f = fold(q);
    return items.filter((p) => fold(p.name).includes(f));
  }, [items, search]);

  const focusQty = (productId: string) => {
    setTimeout(() => { const el = qtyRefs.current[productId]; el?.focus(); el?.select(); }, 0);
  };

  /** Leitor USB ou código digitado: acha na lista ou busca no cadastro e põe no topo. */
  const bip = async (raw: string) => {
    const code = raw.trim();
    if (!marketId || !isBarcode(code)) return;
    lastCode.current = code;
    setMissing(null); setLookError(null);
    const known = items?.find((p) => p.ean === code);
    if (known) { setSearch(''); focusQty(known.productId); return; }
    setLooking(true);
    try {
      const p = await stockCountService.lookup(marketId, code);
      setItems((prev) => {
        const list = prev ?? [];
        if (list.some((x) => x.productId === p.productId)) return list;
        return [{ productId: p.productId, name: p.name, imageUrl: p.imageUrl, ean: p.ean, unit: p.unit, perDay: p.perDay ?? 0 }, ...list];
      });
      setSearch('');
      focusQty(p.productId);
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 404) { setMissing(code); setSearch(''); }
      else setLookError(errorText(e) ?? T.lookupError);
    } finally {
      setLooking(false);
    }
  };

  const save = async () => {
    if (!marketId || filled.length === 0) return;
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ counted: number }>(`/v1/markets/${marketId}/stock-count`, {
        items: filled.map(([productId, v]) => ({ productId, units: parseUnits(v) })),
      });
      setDone(r.data.counted);
      invalidateCached(`placar:${marketId}`);
    } catch (e) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || T.saveError);
    } finally {
      setBusy(false);
    }
  };

  const countMore = () => {
    setDone(null); setCounts({}); setItems(null); setSearch(''); setMissing(null); setLookError(null);
    setAttempt((n) => n + 1);
  };

  return (
    <Layout>
      <PageHero title={<>{T.title} <mark>em 5 minutos.</mark></>}
        subtitle={`${T.subtitle}. Comece pelos que mais vendem e ainda não têm estoque medido. Some prateleira e depósito.`} />
      <RoleNotice area="OPERATION" what="registrar a contagem" />

      {done != null ? (
        <Card style={{ textAlign: 'center', padding: 32 }}>
          <Check size={36} style={{ color: 'var(--fx-green)' }} aria-hidden="true" />
          <h2 className="fx-section-title" style={{ marginTop: 10 }}>{T.doneTitle(done)}</h2>
          <p className="fx-muted" style={{ margin: '8px auto 0', maxWidth: 520 }}>{T.doneHint}</p>
          <div className="fx-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
            <Link to="/app" className="fx-btn dark">Ver o placar</Link>
            <button type="button" className="fx-btn ghost" onClick={countMore}>{T.countMore}</button>
          </div>
        </Card>
      ) : !items ? (
        loadError ? <LoadError what="os produtos para contar" error={loadError} onRetry={() => setAttempt((n) => n + 1)} />
          : <Card><Loader2 className="animate-spin" aria-label="Carregando" /></Card>
      ) : (
        <>
          <Card as="section" aria-label="Produtos para contar">
            <form onSubmit={(e) => { e.preventDefault(); void bip(search); }} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <ScanBarcode aria-hidden="true" style={{ flex: 'none', color: 'var(--fx-muted, #5F7067)' }} />
              <input ref={searchRef} className="fx-input" autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Bipe o produto ou procure pelo nome" aria-label="Bipe o código de barras ou procure pelo nome"
                style={{ flex: 1, minWidth: 0 }} />
              {looking && <Loader2 className="animate-spin" aria-label={T.searching} />}
            </form>
            {missing && (
              <p role="status" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '0 0 12px' }}>
                <PackageX aria-hidden="true" style={{ flex: 'none', color: 'var(--fx-amber, #b45309)' }} />
                <span><b>{T.missingTitle}.</b> <span className="fx-muted">{T.missingHint(missing)}</span></span>
              </p>
            )}
            {lookError && (
              <div role="alert" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 12px' }}>
                <span style={{ color: 'var(--fx-red)' }}>{lookError}</span>
                <button type="button" className="fx-btn ghost small" onClick={() => void bip(lastCode.current)}>{T.retry}</button>
              </div>
            )}
            {items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 8px' }}>
                <Check size={36} style={{ color: 'var(--fx-green)' }} aria-hidden="true" />
                <h2 className="fx-section-title" style={{ marginTop: 10 }}>Os produtos que mais vendem já têm estoque medido</h2>
                <p className="fx-muted" style={{ margin: '8px 0 0' }}>Bipe acima qualquer outro produto para contar, ou volte em 30 dias para conferir de novo.</p>
              </div>
            ) : shown.length === 0 ? (
              <p className="fx-muted" style={{ margin: 0 }}>Nenhum produto da lista com esse nome. Bipe o código de barras para achar outro.</p>
            ) : (
              <ul className="fx-stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 8 }}>
                {shown.map((p) => (
                  <li key={p.productId} className="fx-row" style={{ cursor: 'default' }}>
                    <Thumb name={p.name} src={p.imageUrl} size={44} productId={p.productId} info={p.ean ? `Código de barras ${p.ean}` : null} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <b style={{ display: 'block', fontSize: 15, lineHeight: 1.25 }} title={p.ean ? `Código de barras ${p.ean}` : undefined}>{p.name}</b>
                      <span className="fx-muted" style={{ fontSize: 12.5 }}>{p.perDay ? `Vende ${String(p.perDay).replace('.', ',')} por dia` : 'Sem venda nos últimos 90 dias'}</span>
                    </span>
                    <input ref={(el) => { qtyRefs.current[p.productId] = el; }} className="fx-input fx-num" inputMode="decimal" placeholder="Qtd."
                      aria-label={`${T.total}: ${p.name}`}
                      value={counts[p.productId] ?? ''} onChange={(e) => setCounts({ ...counts, [p.productId]: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchRef.current?.focus(); } }}
                      style={{ width: 84, textAlign: 'right' }} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {items.length > 0 && (
            <div style={{ position: 'sticky', bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))', zIndex: 5 }}>
              <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 16px' }}>
                <span style={{ fontSize: 14.5 }}>
                  {filled.length === 0 ? T.empty : <><b>{filled.length}</b> de {items.length} contados.</>} Deixe em branco o que não contar agora.
                </span>
                <button type="button" className="fx-btn dark" disabled={busy || filled.length === 0 || !!denied} title={denied} onClick={save}>
                  {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ClipboardList aria-hidden="true" />}{busy ? T.saving : T.save}
                </button>
                {error && (
                  <div role="alert" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
                    <span style={{ color: 'var(--fx-red)' }}>{error}</span>
                    <button type="button" className="fx-btn ghost small" disabled={busy} onClick={save}>{T.retry}</button>
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}
    </Layout>
  );
};

export default StockCount;
