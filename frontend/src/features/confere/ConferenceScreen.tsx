import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronLeft, EyeOff, List, Minus, PackageCheck, Plus, ScanBarcode, Send,
  TrendingUp, X,
} from 'lucide-react';
import { confereService } from '../../services/confere.service';
import type { ConfereDocument, ConfereItem, ItemCount, ItemIssue } from '../../types/confere.types';
import Scanner from './Scanner';

/**
 * A conferência em si: um produto por vez (passo a passo) ou a lista inteira,
 * em letras grandes, com a foto do catálogo. Cada toque é salvo no celular na
 * hora (funciona sem sinal) e enviado ao servidor quando der.
 */

const qtyFmt = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const money = (v: number | null | undefined) =>
  v == null ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ISSUES: Array<{ key: ItemIssue; label: string }> = [
  { key: 'AVARIA', label: 'Avaria' },
  { key: 'VALIDADE', label: 'Validade curta' },
  { key: 'TROCADO', label: 'Produto trocado' },
];

const localKey = (docId: string) => `confere:check:${docId}`;
const docKey = (docId: string) => `confere:doc:${docId}`;
const readLocal = <T,>(k: string): T | null => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
};
const writeLocal = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* cheio ou bloqueado */ } };

type Result = 'OK' | 'FALTA' | 'SOBRA' | 'PENDENTE';

const resultOf = (item: ConfereItem, c: ItemCount | undefined): { result: Result; diff: number } => {
  if (!c || c.counted == null) return { result: 'PENDENTE', diff: 0 };
  const expected = Number(item.quantity ?? 0);
  const diff = Math.round((c.counted - expected) * 1000) / 1000;
  return { result: diff === 0 ? 'OK' : diff < 0 ? 'FALTA' : 'SOBRA', diff };
};

const displayName = (item: ConfereItem) => item.catalogName || item.name;

const QtyLine: React.FC<{ item: ConfereItem; className?: string }> = ({ item, className }) => {
  const showTrib = item.taxUnit && item.taxQuantity != null && item.taxUnit !== item.unit;
  return (
    <span className={className}>
      <strong className="tabular-nums">{qtyFmt(item.quantity)}</strong> {item.unit ?? ''}
      {showTrib && <span className="text-stone-500"> ({qtyFmt(item.taxQuantity)} {item.taxUnit})</span>}
    </span>
  );
};

const Photo: React.FC<{ item: ConfereItem; size: string }> = ({ item, size }) => {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ${size}`} style={{ border: '1px solid #e7e5e4' }}>
      {item.imageUrl && !failed
        ? <img src={item.imageUrl} alt="" className="h-full w-full object-contain p-1" onError={() => setFailed(true)} />
        : <PackageCheck className="h-1/2 w-1/2 text-stone-300" aria-hidden="true" />}
    </span>
  );
};

/** "18 volumes" — a espécie só entra quando diz algo ("caixas", "fardos"). */
const volumesText = (doc: ConfereDocument) => {
  if (!doc.volumes) return '';
  const kind = doc.volumeKind?.toLowerCase().trim();
  return `, ${doc.volumes} volumes${kind && !kind.startsWith('volume') ? ` (${kind})` : ''}`;
};

const ConferenceScreen: React.FC<{ marketId: string; docId: string }> = ({ marketId, docId }) => {
  const navigate = useNavigate();
  const [doc, setDoc] = useState<ConfereDocument | null>(() => readLocal<ConfereDocument>(docKey(docId)));
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, ItemCount>>(() => readLocal<Record<string, ItemCount>>(localKey(docId)) ?? {});
  const [blind, setBlind] = useState(false);
  const [mode, setMode] = useState<'passo' | 'lista'>('passo');
  const [index, setIndex] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [extras, setExtras] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);
  const [sync, setSync] = useState<'ok' | 'pending' | 'offline'>('ok');
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    confereService.document(marketId, docId).then((d) => {
      setDoc(d);
      writeLocal(docKey(docId), d);
      if (d.check) {
        setBlind(d.check.blind);
        if (d.check.status === 'DONE') setFinished(true);
        // O que está no celular vale mais que o do servidor (pode ter sido contado sem sinal).
        const local = readLocal<Record<string, ItemCount>>(localKey(docId));
        if (!local || Object.keys(local).length === 0) setCounts((d.check.counts as Record<string, ItemCount>) ?? {});
      }
    }).catch((e) => {
      if (!doc) setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Não foi possível abrir a nota.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId, docId]);

  const push = useCallback((next: Record<string, ItemCount>, finish = false, summary?: unknown) => {
    setSync('pending');
    return confereService.saveCheck(marketId, docId, { counts: next, blind, finish, summary })
      .then(() => setSync('ok'))
      .catch(() => setSync('offline'));
  }, [marketId, docId, blind]);

  const update = (n: number, patch: Partial<ItemCount>) => {
    setCounts((prev) => {
      const current = prev[n] ?? { counted: null };
      const next = { ...prev, [n]: { ...current, ...patch } };
      writeLocal(localKey(docId), next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => push(next), 1500);
      return next;
    });
  };

  // Voltou a internet: manda o que ficou no celular.
  useEffect(() => {
    const online = () => { if (sync === 'offline') push(counts); };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [sync, counts, push]);

  const items = doc?.items ?? [];
  const done = items.filter((it) => counts[it.number]?.counted != null).length;
  const item = items[Math.min(index, Math.max(0, items.length - 1))];

  const summary = useMemo(() => {
    const falta: string[] = [];
    const sobra: string[] = [];
    const issues: string[] = [];
    let ok = 0;
    items.forEach((it) => {
      const c = counts[it.number];
      const { result, diff } = resultOf(it, c);
      const label = `${displayName(it)}`;
      if (result === 'OK') ok += 1;
      if (result === 'FALTA') falta.push(`${qtyFmt(-diff)} ${it.unit ?? ''} de ${label}`);
      if (result === 'SOBRA') sobra.push(`${qtyFmt(diff)} ${it.unit ?? ''} de ${label}`);
      if (c?.issue) issues.push(`${ISSUES.find((i) => i.key === c.issue)?.label}: ${label}${c.note ? ` (${c.note})` : ''}`);
    });
    return { ok, falta, sobra, issues, pending: items.length - done };
  }, [items, counts, done]);

  const onScanProduct = (value: string) => {
    const code = value.replace(/\D/g, '');
    const hitBox = items.find((it) => it.ean === code);
    const hitUnit = items.find((it) => it.taxEan === code);
    const hit = hitBox ?? hitUnit;
    if (!hit) {
      setExtras((e) => (e.includes(code) ? e : [...e, code]));
      setToast(`Código ${code} não está na nota`);
      navigator.vibrate?.([80, 60, 80]);
      return;
    }
    const pos = items.indexOf(hit);
    setIndex(pos);
    if (!hitBox && hit.unit !== hit.taxUnit && hit.taxUnit) {
      setToast(`Esse é o código da unidade. ${displayName(hit)} vem em ${hit.unit}: conte as ${hit.unit}.`);
      return;
    }
    const current = counts[hit.number]?.counted ?? 0;
    update(hit.number, { counted: Math.round((current + 1) * 1000) / 1000 });
    setToast(`+1 ${hit.unit ?? ''} ${displayName(hit)}`);
  };

  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);

  const finish = async () => {
    await push(counts, true, summary);
    setFinished(true);
  };

  const whatsappText = () => {
    const lines = [
      `Conferência da NF ${doc?.number ?? ''} (${doc?.emitterName ?? 'fornecedor'})`,
      `${summary.ok} de ${items.length} itens conferidos sem diferença.`,
    ];
    if (summary.falta.length) lines.push('', 'Faltou:', ...summary.falta.map((l) => `- ${l}`));
    if (summary.sobra.length) lines.push('', 'Veio a mais:', ...summary.sobra.map((l) => `- ${l}`));
    if (summary.issues.length) lines.push('', 'Problemas:', ...summary.issues.map((l) => `- ${l}`));
    if (extras.length) lines.push('', `Produtos fora da nota (código): ${extras.join(', ')}`);
    lines.push('', 'Conferido com o MercadoFlow Confere');
    return lines.join('\n');
  };

  if (error) {
    return (
      <div className="flex flex-col gap-4 p-5">
        <button type="button" onClick={() => navigate('/confere/')} className="flex items-center gap-2 text-lg font-semibold text-green-800"><ArrowLeft className="h-6 w-6" />Voltar</button>
        <p className="rounded-2xl bg-amber-50 p-5 text-lg text-amber-900">{error}</p>
      </div>
    );
  }
  if (!doc) {
    return <div className="flex h-[60vh] items-center justify-center" role="status"><div className="h-10 w-10 animate-spin rounded-full border-4 border-green-700 border-t-transparent" /><span className="sr-only">Abrindo a nota</span></div>;
  }

  // ── Resumo final ──────────────────────────────────────────────────────
  if (finished) {
    const clean = !summary.falta.length && !summary.sobra.length && !summary.issues.length && !extras.length;
    return (
      <div className="flex flex-col gap-4 p-4 pb-28">
        <button type="button" onClick={() => navigate('/confere/')} className="flex items-center gap-2 self-start text-lg font-semibold text-green-800"><ChevronLeft className="h-6 w-6" />Notas</button>
        <div className={`rounded-3xl p-6 ${clean ? 'bg-green-700 text-white' : 'bg-amber-400 text-stone-900'}`}>
          <p className="text-lg font-semibold">{doc.emitterName}, NF {doc.number}</p>
          <h1 className="mt-1 text-3xl font-extrabold leading-tight">{clean ? 'Tudo certo com a entrega' : 'Entrega com diferença'}</h1>
          <p className="mt-2 text-lg">{summary.ok} de {items.length} itens sem diferença.</p>
        </div>
        {[['Faltou', summary.falta, 'text-red-800'], ['Veio a mais', summary.sobra, 'text-amber-800'], ['Problemas', summary.issues, 'text-red-800']].map(([title, list, color]) =>
          (list as string[]).length ? (
            <section key={title as string} className="rounded-3xl bg-white p-5">
              <h2 className={`text-xl font-bold ${color}`}>{title as string}</h2>
              <ul className="mt-2 flex flex-col gap-2 text-lg">{(list as string[]).map((l) => <li key={l}>{l}</li>)}</ul>
            </section>
          ) : null)}
        {extras.length > 0 && (
          <section className="rounded-3xl bg-white p-5">
            <h2 className="text-xl font-bold text-amber-800">Fora da nota</h2>
            <p className="mt-1 text-lg">{extras.join(', ')}</p>
          </section>
        )}
        <a href={`https://wa.me/?text=${encodeURIComponent(whatsappText())}`} target="_blank" rel="noreferrer"
          className="flex h-16 items-center justify-center gap-3 rounded-2xl bg-green-700 text-xl font-bold text-white">
          <Send className="h-6 w-6" />Mandar para o fornecedor
        </a>
        <button type="button" onClick={() => { setFinished(false); setIndex(0); }} className="h-14 rounded-2xl border-2 border-stone-300 text-lg font-semibold text-stone-800">
          Revisar a contagem
        </button>
        <a href="/app" className="rounded-3xl bg-stone-900 p-5 text-white">
          <span className="block text-sm font-semibold text-yellow-300">MercadoFlow</span>
          <span className="mt-1 block text-lg font-bold">Quanto desses produtos você vende por dia?</span>
          <span className="mt-1 block text-stone-300">Conecte o caixa ao MercadoFlow e veja a venda, o estoque e o que comprar, produto por produto.</span>
        </a>
      </div>
    );
  }

  const c = item ? counts[item.number] : undefined;
  const r = item ? resultOf(item, c) : { result: 'PENDENTE' as Result, diff: 0 };

  return (
    <div className="flex flex-col gap-3 pb-32">
      {/* Cabeçalho da nota */}
      <header className="sticky top-0 z-10 flex flex-col gap-2 bg-stone-100/95 px-4 pb-3 pt-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate('/confere/')} aria-label="Voltar às notas" className="flex h-12 w-12 items-center justify-center rounded-full bg-white"><ArrowLeft className="h-6 w-6" /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-stone-900">{doc.emitterName ?? 'Fornecedor'}</p>
            <p className="truncate text-sm text-stone-600">
              NF {doc.number}{volumesText(doc)}{doc.totalValue ? `, ${money(doc.totalValue)}` : ''}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${sync === 'offline' ? 'bg-amber-200 text-amber-900' : 'bg-white text-stone-600'}`} role="status">
            {sync === 'offline' ? 'Sem sinal: salvo no celular' : sync === 'pending' ? 'Salvando…' : 'Salvo'}
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-stone-300" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done} aria-label="Itens conferidos">
          <div className="h-full rounded-full bg-green-700 transition-all" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-stone-800">{done} de {items.length} conferidos</span>
          <div className="ml-auto flex rounded-xl bg-white p-1" role="tablist" aria-label="Modo">
            {([['passo', 'Um por vez'], ['lista', 'Lista']] as const).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
                className={`rounded-lg px-3 py-2 text-sm font-bold ${mode === k ? 'bg-green-700 text-white' : 'text-stone-700'}`}>
                {k === 'lista' ? <List className="mr-1 inline h-4 w-4" /> : null}{label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {toast && <div className="fixed inset-x-4 top-4 z-30 rounded-2xl bg-stone-900 px-5 py-4 text-lg font-semibold text-white shadow-xl" role="status">{toast}</div>}

      {scanning && (
        <div className="px-4">
          <Scanner formats={['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_128']} height="30vh"
            hint="Bipe o código do produto" onDetect={onScanProduct}
            accept={(v) => /^\d{8,14}$/.test(v)} />
        </div>
      )}

      {mode === 'passo' && item && (
        <section className="mx-4 flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm" aria-label={`Item ${index + 1} de ${items.length}`}>
          <div className="flex items-center justify-between text-base font-semibold text-stone-500">
            <span>Item {index + 1} de {items.length}</span>
            {r.result !== 'PENDENTE' && !blind && (
              <span className={`rounded-full px-3 py-1 ${r.result === 'OK' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {r.result === 'OK' ? 'Confere' : r.result === 'FALTA' ? `Falta ${qtyFmt(-r.diff)}` : `Sobra ${qtyFmt(r.diff)}`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Photo item={item} size="h-28 w-28" />
            <div className="min-w-0">
              <h2 className="text-2xl font-extrabold leading-tight text-stone-900">{displayName(item)}</h2>
              {item.catalogName && item.catalogName !== item.name && <p className="mt-1 text-sm text-stone-500">{item.name}</p>}
              {item.ean && <p className="mt-1 font-mono text-sm text-stone-500">{item.ean}</p>}
            </div>
          </div>
          {!blind && (
            <p className="rounded-2xl bg-stone-100 px-4 py-3 text-xl text-stone-800">Na nota: <QtyLine item={item} /></p>
          )}
          {item.priceChangePercent != null && item.priceChangePercent >= 3 && (
            <p className="flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-base font-semibold text-red-800">
              <TrendingUp className="h-5 w-5 shrink-0" />Preço {item.priceChangePercent.toLocaleString('pt-BR')}% maior que na última nota ({money(item.lastUnitPrice)} → {money(item.unitPrice)})
            </p>
          )}
          {(item.lot || item.expiry) && (
            <p className="text-base text-stone-600">{item.lot ? `Lote ${item.lot}` : ''}{item.lot && item.expiry ? ', ' : ''}{item.expiry ? `validade ${item.expiry.split('-').reverse().join('/')}` : ''}</p>
          )}
          {/* Contador */}
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Menos um" onClick={() => update(item.number, { counted: Math.max(0, (c?.counted ?? 0) - 1) })}
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-stone-200 text-stone-900 active:bg-stone-300"><Minus className="h-9 w-9" /></button>
            <label className="flex min-w-0 flex-1 flex-col items-center">
              <span className="sr-only">Quantidade contada</span>
              <input inputMode="decimal" value={c?.counted == null ? '' : String(c.counted).replace('.', ',')} placeholder="0"
                onChange={(e) => {
                  const v = e.target.value.replace(',', '.').replace(/[^\d.]/g, '');
                  update(item.number, { counted: v === '' ? null : Number(v) });
                }}
                className="h-20 w-full rounded-2xl border-4 border-yellow-400 bg-yellow-50 text-center text-5xl font-extrabold tabular-nums text-stone-900 outline-none focus:border-green-700" />
              <span className="mt-1 text-base font-semibold text-stone-600">{item.unit ?? 'unidades'} contadas</span>
            </label>
            <button type="button" aria-label="Mais um" onClick={() => update(item.number, { counted: Math.round(((c?.counted ?? 0) + 1) * 1000) / 1000 })}
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-green-700 text-white active:bg-green-800"><Plus className="h-9 w-9" /></button>
          </div>
          {!blind && (
            <button type="button" onClick={() => update(item.number, { counted: Number(item.quantity ?? 0) })}
              className="flex h-16 items-center justify-center gap-2 rounded-2xl border-2 border-green-700 text-xl font-bold text-green-800">
              <Check className="h-7 w-7" />Veio certo ({qtyFmt(item.quantity)} {item.unit})
            </button>
          )}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Problema no item">
            {ISSUES.map((iss) => {
              const active = c?.issue === iss.key;
              return (
                <button key={iss.key} type="button" aria-pressed={active} onClick={() => update(item.number, { issue: active ? null : iss.key, counted: c?.counted ?? null })}
                  className={`rounded-full px-4 py-2 text-base font-semibold ${active ? 'bg-red-700 text-white' : 'bg-stone-100 text-stone-800'}`}>
                  {active && <AlertTriangle className="mr-1 inline h-4 w-4" />}{iss.label}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {mode === 'lista' && (
        <ul className="mx-4 flex flex-col gap-2">
          {items.map((it, i) => {
            const ic = counts[it.number];
            const res = resultOf(it, ic);
            return (
              <li key={it.number}>
                <button type="button" onClick={() => { setIndex(i); setMode('passo'); }}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left">
                  <Photo item={it} size="h-16 w-16" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-bold leading-tight text-stone-900">{displayName(it)}</span>
                    <span className="block text-base text-stone-700">{blind ? 'Contagem cega' : <QtyLine item={it} />}</span>
                    {ic?.issue && <span className="block text-sm font-semibold text-red-700">{ISSUES.find((x) => x.key === ic.issue)?.label}</span>}
                  </span>
                  <span className={`flex h-12 min-w-12 items-center justify-center rounded-xl px-2 text-lg font-extrabold tabular-nums ${
                    res.result === 'PENDENTE' ? 'bg-stone-100 text-stone-400' : blind || res.result === 'OK' ? 'bg-green-700 text-white' : 'bg-red-600 text-white'}`}>
                    {res.result === 'PENDENTE' ? '—' : blind ? qtyFmt(ic?.counted) : res.result === 'OK' ? <Check className="h-6 w-6" /> : (res.diff > 0 ? '+' : '') + qtyFmt(res.diff)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <label className="mx-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-base font-semibold text-stone-800">
        <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} className="h-6 w-6 accent-green-700" />
        <EyeOff className="h-5 w-5 text-stone-500" />Conferência cega (esconde a quantidade da nota)
      </label>

      {/* Barra de ações no alcance do polegar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur" aria-label="Ações da conferência">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          {mode === 'passo' && (
            <button type="button" aria-label="Item anterior" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-100 disabled:opacity-40"><ArrowLeft className="h-7 w-7" /></button>
          )}
          <button type="button" onClick={() => setScanning((s) => !s)} aria-pressed={scanning}
            className={`flex h-16 flex-1 items-center justify-center gap-2 rounded-2xl text-lg font-bold ${scanning ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-900'}`}>
            {scanning ? <X className="h-6 w-6" /> : <ScanBarcode className="h-6 w-6" />}{scanning ? 'Fechar' : 'Bipar'}
          </button>
          {mode === 'passo' && index < items.length - 1 ? (
            <button type="button" onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
              className="flex h-16 flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-green-700 text-xl font-bold text-white">
              Próximo<ArrowRight className="h-6 w-6" />
            </button>
          ) : (
            <button type="button" onClick={finish}
              className="flex h-16 flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-green-700 text-xl font-bold text-white">
              <PackageCheck className="h-6 w-6" />{summary.pending ? `Encerrar (${summary.pending} sem contar)` : 'Encerrar'}
            </button>
          )}
        </div>
      </nav>
    </div>
  );
};

export default ConferenceScreen;
