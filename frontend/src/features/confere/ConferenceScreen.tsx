import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, ClipboardCheck, EyeOff, List, Mic, MicOff, Minus, MoreVertical, PackageCheck, Plus,
  RotateCcw, ScanBarcode, Send, TrendingUp, X,
} from 'lucide-react';
import { confereService } from '../../services/confere.service';
import { copilotService } from '../../services/aiPlatform.service';
import { useVoice } from '../../hooks/useVoice';
import { parseConference, type ConferenceAction, type VoiceCommand } from '../../utils/voiceCommands';
import type { ConfereDocument, ConfereItem, ItemCount, ItemIssue } from '../../types/confere.types';
import Scanner from './Scanner';
import { Stepper } from './ui';

/**
 * A conferência em passos: Conferir (um produto por tela, sem rolar) →
 * Revisar (diferenças antes de fechar) → Pronto (resultado e WhatsApp).
 *
 * Nada se perde: cada toque vai para o celular na hora; o servidor recebe em
 * seguida, ao sair da tela ou quando o sinal voltar — inclusive o
 * encerramento feito sem internet.
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
const extrasKey = (docId: string) => `confere:extras:${docId}`;
const finishKey = (docId: string) => `confere:finish:${docId}`;
const readLocal = <T,>(k: string): T | null => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
};
const writeLocal = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* cheio ou bloqueado */ } };
const removeLocal = (k: string) => { try { localStorage.removeItem(k); } catch { /* bloqueado */ } };

type Result = 'OK' | 'FALTA' | 'SOBRA' | 'PENDENTE';
type Phase = 'contar' | 'revisar' | 'pronto';
type Counts = Record<string, ItemCount>;

const resultOf = (item: ConfereItem, c: ItemCount | undefined): { result: Result; diff: number } => {
  if (!c || c.counted == null) return { result: 'PENDENTE', diff: 0 };
  const expected = Number(item.quantity ?? 0);
  const diff = Math.round((c.counted - expected) * 1000) / 1000;
  return { result: diff === 0 ? 'OK' : diff < 0 ? 'FALTA' : 'SOBRA', diff };
};

const displayName = (item: ConfereItem) => item.catalogName || item.name;

const QtyLine: React.FC<{ item: ConfereItem }> = ({ item }) => {
  const showTrib = item.taxUnit && item.taxQuantity != null && item.taxUnit !== item.unit;
  return (
    <span>
      <strong className="tabular-nums">{qtyFmt(item.quantity)}</strong> {item.unit ?? ''}
      {showTrib && <span className="text-stone-500"> ({qtyFmt(item.taxQuantity)} {item.taxUnit})</span>}
    </span>
  );
};

const Photo: React.FC<{ item: ConfereItem; className: string }> = ({ item, className }) => {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#DCE5DF] bg-white ${className}`}>
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

/** Folha que sobe de baixo: opções e problema do item, sem tirar o produto da tela. */
const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
      className="flex max-h-[85dvh] w-full max-w-xl flex-col gap-3 overflow-auto rounded-t-[28px] bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-extrabold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Fechar" className="lg-soft flex h-12 w-12 items-center justify-center rounded-full"><X className="h-6 w-6" /></button>
      </div>
      {children}
    </div>
  </div>
);

const ConferenceScreen: React.FC<{ marketId: string; docId: string }> = ({ marketId, docId }) => {
  const navigate = useNavigate();
  const [doc, setDoc] = useState<ConfereDocument | null>(() => readLocal<ConfereDocument>(docKey(docId)));
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts>(() => readLocal<Counts>(localKey(docId)) ?? {});
  const [extras, setExtras] = useState<string[]>(() => readLocal<string[]>(extrasKey(docId)) ?? []);
  const [blind, setBlind] = useState(false);
  const [mode, setMode] = useState<'passo' | 'lista'>('passo');
  const [phase, setPhase] = useState<Phase>('contar');
  const [index, setIndex] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [sheet, setSheet] = useState<'menu' | 'problema' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sync, setSync] = useState<'ok' | 'pending' | 'offline'>('ok');
  const [closing, setClosing] = useState(false);

  const countsRef = useRef(counts);
  const blindRef = useRef(blind);
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>();
  const touch = useRef<{ x: number; y: number } | null>(null);
  const voiceHandler = useRef<(text: string) => void>(() => {});
  // Mãos livres: com o reconhecimento do navegador, fica ouvindo até desligar.
  const voice = useVoice({ marketId, continuous: true, onText: (t) => voiceHandler.current(t) });
  const stopVoice = voice.stop;
  useEffect(() => { if (phase !== 'contar' || mode !== 'passo') stopVoice(); }, [phase, mode, stopVoice]);
  countsRef.current = counts;
  blindRef.current = blind;

  const push = useCallback(async (next: Counts, finish = false, summary?: unknown) => {
    setSync('pending');
    try {
      await confereService.saveCheck(marketId, docId, { counts: next, blind: blindRef.current, finish, summary });
      dirty.current = false;
      if (finish) removeLocal(finishKey(docId));
      setSync('ok');
      return true;
    } catch {
      if (finish) writeLocal(finishKey(docId), summary ?? {});
      setSync('offline');
      return false;
    }
  }, [marketId, docId]);

  /** Encerramento feito sem sinal: manda de novo. */
  const retryPendingFinish = useCallback(() => {
    const pending = readLocal<unknown>(finishKey(docId));
    if (pending) push(countsRef.current, true, pending);
    else if (dirty.current) push(countsRef.current);
  }, [docId, push]);

  useEffect(() => {
    confereService.document(marketId, docId).then((d) => {
      setDoc(d);
      writeLocal(docKey(docId), d);
      const local = readLocal<Counts>(localKey(docId));
      const hasLocal = !!local && Object.keys(local).length > 0;
      if (d.check) {
        setBlind(d.check.blind);
        if (d.check.status === 'DONE') setPhase('pronto');
        // O que está no celular vale mais que o do servidor (pode ter sido contado sem sinal).
        if (!hasLocal) setCounts((d.check.counts as Counts) ?? {});
      }
      if (hasLocal) { dirty.current = true; }
      retryPendingFinish();
      if (readLocal(finishKey(docId))) setPhase('pronto');
    }).catch((e) => {
      if (!doc) setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Não foi possível abrir a nota.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId, docId]);

  const update = (n: number, patch: Partial<ItemCount>) => {
    setCounts((prev) => {
      const current = prev[n] ?? { counted: null };
      const next = { ...prev, [n]: { ...current, ...patch } };
      writeLocal(localKey(docId), next);
      dirty.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => push(next), 1200);
      return next;
    });
  };

  // Sinal de volta, app para o fundo ou saída da tela: nada fica só no timer.
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = undefined; }
      retryPendingFinish();
    };
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('online', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('online', flush);
      document.removeEventListener('visibilitychange', hidden);
      flush();
    };
  }, [retryPendingFinish]);

  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);
  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);

  const items = useMemo(() => doc?.items ?? [], [doc]);
  const done = items.filter((it) => counts[it.number]?.counted != null).length;
  const safeIndex = Math.min(index, Math.max(0, items.length - 1));
  const item = items[safeIndex];
  const last = safeIndex >= items.length - 1;

  const summary = useMemo(() => {
    const falta: string[] = [];
    const sobra: string[] = [];
    const issues: string[] = [];
    let ok = 0;
    items.forEach((it) => {
      const c = counts[it.number];
      const { result, diff } = resultOf(it, c);
      const label = displayName(it);
      if (result === 'OK') ok += 1;
      if (result === 'FALTA') falta.push(`${qtyFmt(-diff)} ${it.unit ?? ''} de ${label}`);
      if (result === 'SOBRA') sobra.push(`${qtyFmt(diff)} ${it.unit ?? ''} de ${label}`);
      if (c?.issue) issues.push(`${ISSUES.find((i) => i.key === c.issue)?.label}: ${label}${c.note ? ` (${c.note})` : ''}`);
    });
    return { ok, falta, sobra, issues, pending: items.length - done, extras };
  }, [items, counts, done, extras]);

  const goTo = (i: number) => { setIndex(Math.max(0, Math.min(items.length - 1, i))); setMode('passo'); setPhase('contar'); };
  const next = () => (last ? setPhase('revisar') : setIndex(safeIndex + 1));

  const onScanProduct = (value: string) => {
    const code = value.replace(/\D/g, '');
    const hitBox = items.find((it) => it.ean === code);
    const hitUnit = items.find((it) => it.taxEan === code);
    const hit = hitBox ?? hitUnit;
    if (!hit) {
      setExtras((e) => {
        const nextExtras = e.includes(code) ? e : [...e, code];
        writeLocal(extrasKey(docId), nextExtras);
        return nextExtras;
      });
      setToast(`Código ${code} não está na nota`);
      navigator.vibrate?.([80, 60, 80]);
      return;
    }
    setIndex(items.indexOf(hit));
    if (!hitBox && hit.unit !== hit.taxUnit && hit.taxUnit) {
      setToast(`Esse é o código da unidade. ${displayName(hit)} vem em ${hit.unit}: conte as ${hit.unit}.`);
      return;
    }
    const current = counts[hit.number]?.counted ?? 0;
    update(hit.number, { counted: Math.round((current + 1) * 1000) / 1000 });
    setToast(`+1 ${hit.unit ?? ''} ${displayName(hit)}`);
  };

  const finish = async () => {
    setClosing(true);
    await push(counts, true, summary);
    setClosing(false);
    setPhase('pronto');
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
        <button type="button" onClick={() => navigate('/confere/')} className="flex items-center gap-2 text-lg font-semibold text-[#06592C]"><ArrowLeft className="h-6 w-6" />Voltar</button>
        <p className="rounded-2xl bg-amber-50 p-5 text-lg text-amber-900">{error}</p>
      </div>
    );
  }
  if (!doc) {
    return <div className="flex h-[60dvh] items-center justify-center" role="status"><div className="h-10 w-10 animate-spin rounded-full border-4 border-[#0A7A3D] border-t-transparent" /><span className="sr-only">Abrindo a nota</span></div>;
  }

  const syncLabel = sync === 'offline' ? 'Sem sinal: salvo no celular' : sync === 'pending' ? 'Salvando…' : 'Salvo';

  // Cabeçalho comum aos três passos: nota, estado do salvamento e o passo atual.
  const header = (step: 1 | 2 | 3, extra?: React.ReactNode) => (
    <header className="flex shrink-0 flex-col gap-2 px-3 pb-2 pt-[max(8px,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => navigate('/confere/')} aria-label="Voltar às notas" className="lg-card flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-sm"><ArrowLeft className="h-6 w-6" /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold leading-tight text-[#0F1A14]">{doc.emitterName ?? 'Fornecedor'}</p>
          <p className="truncate text-sm leading-tight text-[#5B6B62]">NF {doc.number}{volumesText(doc)}{doc.totalValue ? `, ${money(doc.totalValue)}` : ''}</p>
        </div>
        <span role="status" aria-label={syncLabel} title={syncLabel}
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${sync === 'offline' ? 'bg-amber-200 text-amber-900' : sync === 'pending' ? 'bg-white text-stone-600' : 'bg-green-100 text-[#06592C]'}`}>
          {sync === 'offline' ? 'Sem sinal' : sync === 'pending' ? 'Salvando' : 'Salvo'}
        </span>
        {extra}
      </div>
      <Stepper current={step} />
    </header>
  );

  // ── Passo 4: pronto ────────────────────────────────────────────────────
  if (phase === 'pronto') {
    const clean = !summary.falta.length && !summary.sobra.length && !summary.issues.length && !extras.length;
    return (
      <div className="flex h-[100dvh] flex-col">
        {header(3)}
        <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-3 pb-3">
          <div className={`rounded-[28px] p-5 ${clean ? 'cf-wallet text-white shadow-[0_18px_40px_-18px_rgba(6,89,44,0.8)]' : 'bg-amber-400 text-stone-900 shadow-[0_18px_40px_-18px_rgba(180,120,0,0.6)]'}`}>
            <ClipboardCheck className="h-10 w-10" aria-hidden="true" />
            <h1 className="mt-2 text-3xl font-extrabold leading-tight">{clean ? 'Tudo certo com a entrega' : 'Entrega com diferença'}</h1>
            <p className="mt-1 text-lg">{summary.ok} de {items.length} itens sem diferença{summary.pending ? `, ${summary.pending} sem contar` : ''}.</p>
            {sync === 'offline' && <p className="mt-2 text-base font-semibold">Sem sinal: o encerramento vai para o sistema assim que a internet voltar.</p>}
          </div>
          {[['Faltou', summary.falta, 'text-red-800'], ['Veio a mais', summary.sobra, 'text-amber-800'], ['Problemas', summary.issues, 'text-red-800']].map(([title, list, color]) =>
            (list as string[]).length ? (
              <section key={title as string} className="lg-card rounded-3xl p-4">
                <h2 className={`text-xl font-bold ${color}`}>{title as string}</h2>
                <ul className="mt-2 flex flex-col gap-1.5 text-lg">{(list as string[]).map((l) => <li key={l}>{l}</li>)}</ul>
              </section>
            ) : null)}
          {extras.length > 0 && (
            <section className="lg-card rounded-3xl p-4">
              <h2 className="text-xl font-bold text-amber-800">Fora da nota</h2>
              <p className="mt-1 text-lg">{extras.join(', ')}</p>
            </section>
          )}
          <a href="/app" className="rounded-3xl bg-[#0F1A14] p-4 text-white">
            <span className="block text-sm font-bold text-[#B6F36A]">MercadoFlow</span>
            <span className="mt-1 block text-lg font-bold">Quanto desses produtos você vende por dia?</span>
            <span className="mt-1 block text-white/70">Conecte o caixa ao MercadoFlow e veja a venda, o estoque e o que comprar, produto por produto.</span>
          </a>
        </main>
        <nav className="shrink-0 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2" aria-label="Depois da conferência">
          <div className="lg-bar flex flex-col gap-2 rounded-[28px] p-2">
            {!clean && (
              <a href={`https://wa.me/?text=${encodeURIComponent(whatsappText())}`} target="_blank" rel="noreferrer"
                className="flex h-14 items-center justify-center gap-3 rounded-[20px] lg-tinted [--tint:#0a7a3d] text-lg font-bold">
                <Send className="h-6 w-6" />Mandar para o fornecedor
              </a>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setPhase('contar'); setIndex(0); }}
                className="lg-soft flex h-14 items-center justify-center gap-2 whitespace-nowrap rounded-[20px] px-2 text-base font-bold max-[400px]:text-sm">
                <RotateCcw className="h-5 w-5" />Reabrir contagem
              </button>
              <Link to="/confere/ler" className={`flex h-14 items-center justify-center gap-2 rounded-[20px] text-base font-bold ${clean ? 'lg-tinted [--tint:#0a7a3d]' : 'lg-soft'}`}>
                <ScanBarcode className="h-5 w-5" />Ler outra nota
              </Link>
            </div>
          </div>
        </nav>
      </div>
    );
  }

  // ── Passo 3: revisar ───────────────────────────────────────────────────
  if (phase === 'revisar') {
    const withDiff = items.map((it, i) => ({ it, i, r: resultOf(it, counts[it.number]), c: counts[it.number] }))
      .filter(({ r, c }) => r.result === 'FALTA' || r.result === 'SOBRA' || c?.issue);
    const pendingItems = items.map((it, i) => ({ it, i })).filter(({ it }) => counts[it.number]?.counted == null);
    const tiles: Array<[string, number, string]> = [
      ['Certos', summary.ok, 'bg-green-100 text-green-900'],
      ['Com diferença', summary.falta.length + summary.sobra.length, 'bg-red-100 text-red-900'],
      ['Problemas', summary.issues.length, 'bg-amber-100 text-amber-900'],
      ['Sem contar', summary.pending, 'bg-stone-200 text-stone-800'],
    ];
    return (
      <div className="flex h-[100dvh] flex-col">
        {header(2)}
        <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-3 pb-3">
          <h1 className="text-2xl font-extrabold">Revise antes de encerrar</h1>
          <div className="grid grid-cols-2 gap-2">
            {tiles.map(([label, n, tone]) => (
              <div key={label} className={`rounded-3xl p-3 ring-1 ring-white/70 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] ${tone}`}>
                <p className="text-3xl font-extrabold tabular-nums">{n}</p>
                <p className="text-base font-semibold">{label}</p>
              </div>
            ))}
          </div>
          {withDiff.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-bold">Diferenças e problemas</h2>
              <ul className="flex flex-col gap-2">
                {withDiff.map(({ it, i, r, c }) => (
                  <li key={it.number}>
                    <button type="button" onClick={() => goTo(i)} className="lg-card flex w-full items-center gap-3 rounded-2xl p-3 text-left">
                      <Photo item={it} className="h-14 w-14" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-bold">{displayName(it)}</span>
                        <span className="block text-sm text-stone-700">
                          Nota {qtyFmt(it.quantity)}, contado {qtyFmt(c?.counted)} {it.unit ?? ''}
                          {c?.issue ? `, ${ISSUES.find((x) => x.key === c.issue)?.label}` : ''}
                        </span>
                      </span>
                      {r.result !== 'OK' && r.result !== 'PENDENTE' && (
                        <span className={`rounded-xl px-2 py-1 text-base font-extrabold tabular-nums ${r.result === 'FALTA' ? 'bg-red-600 text-white' : 'bg-amber-500 text-stone-900'}`}>
                          {r.diff > 0 ? '+' : ''}{qtyFmt(r.diff)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {pendingItems.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-bold">Sem contar</h2>
              <p className="text-base text-stone-700">Esses itens ficam registrados como não conferidos. Toque para contar.</p>
              <ul className="flex flex-col gap-2">
                {pendingItems.map(({ it, i }) => (
                  <li key={it.number}>
                    <button type="button" onClick={() => goTo(i)} className="lg-card flex w-full items-center gap-3 rounded-2xl p-3 text-left">
                      <Photo item={it} className="h-12 w-12" />
                      <span className="min-w-0 flex-1 truncate text-base font-bold">{displayName(it)}</span>
                      <ArrowRight className="h-5 w-5 text-stone-400" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {extras.length > 0 && <p className="rounded-3xl bg-amber-50 p-3 text-base text-amber-900">Bipados fora da nota: {extras.join(', ')}</p>}
          {withDiff.length === 0 && pendingItems.length === 0 && <p className="lg-card rounded-3xl p-4 text-lg">Tudo contado e sem diferença.</p>}
        </main>
        <nav className="shrink-0 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2" aria-label="Revisão">
          <div className="lg-bar flex gap-2 rounded-[28px] p-2">
            <button type="button" onClick={() => setPhase('contar')} className="lg-soft flex h-16 flex-none items-center justify-center gap-2 rounded-[20px] px-5 text-lg font-bold">
              <ArrowLeft className="h-6 w-6" />Voltar
            </button>
            <button type="button" onClick={finish} disabled={closing}
              className="flex h-16 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[20px] lg-tinted [--tint:#0a7a3d] px-3 text-lg font-bold max-[400px]:text-base disabled:opacity-60">
              <PackageCheck className="h-6 w-6 shrink-0 max-[420px]:hidden" />{closing ? 'Encerrando…' : 'Confirmar e encerrar'}
            </button>
          </div>
        </nav>
      </div>
    );
  }

  // ── Passo 2: conferir ──────────────────────────────────────────────────
  const c = item ? counts[item.number] : undefined;
  const r = item ? resultOf(item, c) : { result: 'PENDENTE' as Result, diff: 0 };
  const priceUp = item?.priceChangePercent != null && item.priceChangePercent >= 3;

  const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current;
    touch.current = null;
    if (!t) return;
    const dx = e.changedTouches[0].clientX - t.x;
    const dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) {
      if (dx < 0 && !last) setIndex(safeIndex + 1);
      if (dx > 0 && safeIndex > 0) setIndex(safeIndex - 1);
    }
  };

  const confirmExpected = () => {
    if (!item) return;
    update(item.number, { counted: Number(item.quantity ?? 0) });
    if (!last) {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => setIndex((i) => Math.min(items.length - 1, i + 1)), 350);
    }
  };

  // ── Voz: comandos lidos no aparelho; o Jev só escolhe a ação quando a lista não reconhece ──
  const applyVoice = (cmd: VoiceCommand<ConferenceAction>) => {
    if (!item) return;
    const current = c?.counted ?? 0;
    const round = (v: number) => Math.round(v * 1000) / 1000;
    const heard = `"${cmd.texto}"`;
    switch (cmd.acao) {
      case 'somar': {
        const total = round(current + (cmd.numero ?? 1));
        update(item.number, { counted: total });
        setToast(`${heard}: +${qtyFmt(cmd.numero ?? 1)}, total ${qtyFmt(total)}`);
        break;
      }
      case 'tirar': {
        const total = Math.max(0, round(current - (cmd.numero ?? 1)));
        update(item.number, { counted: total });
        setToast(`${heard}: -${qtyFmt(cmd.numero ?? 1)}, total ${qtyFmt(total)}`);
        break;
      }
      case 'definir':
        if (cmd.numero == null) { setToast(`${heard}: diga o número, ex.: "contei doze"`); break; }
        update(item.number, { counted: cmd.numero });
        setToast(`${heard}: contados ${qtyFmt(cmd.numero)}`);
        break;
      case 'veio_certo':
        if (blind) { setToast('Na conferência cega, diga quanto contou.'); break; }
        confirmExpected();
        setToast(`${heard}: veio certo`);
        break;
      case 'avaria':
      case 'validade':
      case 'trocado': {
        const key = cmd.acao === 'avaria' ? 'AVARIA' : cmd.acao === 'validade' ? 'VALIDADE' : 'TROCADO';
        update(item.number, { issue: key as ItemIssue, counted: c?.counted ?? null });
        setToast(`${heard}: ${ISSUES.find((x) => x.key === key)?.label} marcado`);
        break;
      }
      case 'proximo': next(); break;
      case 'anterior': if (safeIndex > 0) setIndex(safeIndex - 1); break;
      case 'revisar': voice.stop(); setPhase('revisar'); break;
      default: break;
    }
  };

  const onVoiceText = async (text: string) => {
    const local = parseConference(text);
    if (local) { applyVoice(local); return; }
    if (typeof navigator !== 'undefined' && !navigator.onLine) { setToast(`Não entendi "${text}".`); return; }
    try {
      const r = await copilotService.command(marketId, 'CONFERENCIA', text);
      if (r.acao) applyVoice({ acao: r.acao as ConferenceAction, numero: null, texto: text });
      else setToast(`Não entendi "${text}". Ex.: "mais dois", "contei doze", "avaria", "próximo".`);
    } catch {
      setToast(`Não entendi "${text}".`);
    }
  };

  voiceHandler.current = onVoiceText;

  return (
    <div className="flex h-[100dvh] flex-col">
      {header(1, (
        <button type="button" onClick={() => setSheet('menu')} aria-label="Opções da conferência"
          className="lg-card flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-sm"><MoreVertical className="h-6 w-6" /></button>
      ))}

      <div className="flex shrink-0 items-center gap-2 px-3 pb-2">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#DCE5DF]" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done} aria-label="Itens conferidos">
          <div className="h-full rounded-full bg-[#0A7A3D] transition-all" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums text-[#5B6B62]">{done}/{items.length} conferidos</span>
      </div>

      {toast && <div className="fixed inset-x-4 top-4 z-50 rounded-2xl bg-stone-900 px-5 py-4 text-lg font-semibold text-white shadow-xl" role="status">{toast}</div>}

      {mode === 'lista' ? (
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-3 pb-3">
          {items.map((it, i) => {
            const ic = counts[it.number];
            const res = resultOf(it, ic);
            return (
              <li key={it.number}>
                <button type="button" onClick={() => goTo(i)} className="lg-card flex w-full items-center gap-3 rounded-2xl p-3 text-left">
                  <Photo item={it} className="h-14 w-14" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold leading-tight text-stone-900">{displayName(it)}</span>
                    <span className="block text-sm text-stone-700">{blind ? 'Contagem cega' : <QtyLine item={it} />}</span>
                    {ic?.issue && <span className="block text-sm font-semibold text-red-700">{ISSUES.find((x) => x.key === ic.issue)?.label}</span>}
                  </span>
                  <span className={`flex h-11 min-w-11 items-center justify-center rounded-xl px-2 text-base font-extrabold tabular-nums ${
                    res.result === 'PENDENTE' ? 'bg-stone-100 text-stone-400' : blind || res.result === 'OK' ? 'bg-[#0A7A3D] text-white' : 'bg-red-600 text-white'}`}>
                    {res.result === 'PENDENTE' ? '—' : blind ? qtyFmt(ic?.counted) : res.result === 'OK' ? <Check className="h-6 w-6" /> : (res.diff > 0 ? '+' : '') + qtyFmt(res.diff)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : item && (
        <main className="flex min-h-0 flex-1 flex-col px-3 pb-2">
          <section onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
            className="flex min-h-0 flex-1 flex-col gap-[clamp(6px,1.4dvh,14px)] overflow-hidden rounded-3xl lg-card p-[clamp(12px,2dvh,20px)]"
            aria-label={`Item ${safeIndex + 1} de ${items.length}`}>
            <div className="flex shrink-0 items-center justify-between text-sm font-bold text-stone-500">
              <span>Item {safeIndex + 1} de {items.length}</span>
              {r.result !== 'PENDENTE' && !blind && (
                <span className={`rounded-full px-3 py-0.5 ${r.result === 'OK' ? 'bg-green-100 text-[#06592C]' : 'bg-red-100 text-red-800'}`}>
                  {r.result === 'OK' ? 'Confere' : r.result === 'FALTA' ? `Falta ${qtyFmt(-r.diff)}` : `Sobra ${qtyFmt(r.diff)}`}
                </span>
              )}
              {blind && <span className="flex items-center gap-1 rounded-full bg-[#EEF3F0] px-3 py-0.5 text-[#34443B]"><EyeOff className="h-4 w-4" />Cega</span>}
            </div>

            <div className="flex min-h-0 shrink items-center gap-3">
              <Photo item={item} className="aspect-square h-[clamp(64px,24dvh,220px)] max-w-[45%]" />
              <div className="min-w-0 flex-1">
                <h2 className="line-clamp-3 text-[clamp(1.1rem,3dvh,1.6rem)] font-extrabold leading-tight text-[#0F1A14]">{displayName(item)}</h2>
                {item.catalogName && item.catalogName !== item.name && <p className="mt-0.5 truncate text-sm text-stone-500">{item.name}</p>}
                {item.ean && <p className="mt-0.5 font-mono text-sm text-stone-500">{item.ean}</p>}
              </div>
            </div>

            {!blind && (
              <p className="shrink-0 rounded-2xl bg-[#EEF3F0] px-4 py-[clamp(6px,1.2dvh,12px)] text-[clamp(1.05rem,2.6dvh,1.35rem)] text-stone-800">Na nota: <QtyLine item={item} /></p>
            )}
            {(priceUp || item.lot || item.expiry || c?.issue) && (
              <div className="flex shrink-0 flex-wrap gap-1.5 text-sm font-semibold">
                {c?.issue && <span className="flex items-center gap-1 rounded-full bg-red-700 px-3 py-1 text-white"><AlertTriangle className="h-4 w-4" />{ISSUES.find((x) => x.key === c.issue)?.label}</span>}
                {priceUp && (
                  <span className="flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-red-800">
                    <TrendingUp className="h-4 w-4" />Preço +{item.priceChangePercent!.toLocaleString('pt-BR')}% ({money(item.lastUnitPrice)} → {money(item.unitPrice)})
                  </span>
                )}
                {(item.lot || item.expiry) && (
                  <span className="rounded-full bg-[#EEF3F0] px-3 py-1 text-[#34443B]">
                    {item.lot ? `Lote ${item.lot}` : ''}{item.lot && item.expiry ? ', ' : ''}{item.expiry ? `validade ${item.expiry.split('-').reverse().join('/')}` : ''}
                  </span>
                )}
              </div>
            )}

            <div className="min-h-0 flex-1" aria-hidden="true" />

            {/* Contador */}
            <div className="flex shrink-0 items-stretch gap-2">
              <button type="button" aria-label="Menos um" onClick={() => update(item.number, { counted: Math.max(0, Math.round(((c?.counted ?? 0) - 1) * 1000) / 1000) })}
                className="flex h-[clamp(56px,10dvh,80px)] w-[clamp(56px,10dvh,80px)] shrink-0 items-center justify-center rounded-2xl lg-soft"><Minus className="h-8 w-8" /></button>
              <label className="flex min-w-0 flex-1 flex-col items-center">
                <span className="sr-only">Quantidade contada em {item.unit ?? 'unidades'}</span>
                <input inputMode="decimal" value={c?.counted == null ? '' : String(c.counted).replace('.', ',')} placeholder="0"
                  onChange={(e) => {
                    const v = e.target.value.replace(',', '.').replace(/[^\d.]/g, '');
                    update(item.number, { counted: v === '' ? null : Number(v) });
                  }}
                  className="h-[clamp(56px,10dvh,80px)] w-full rounded-2xl border-4 border-yellow-400 bg-yellow-50 text-center text-[clamp(2rem,6dvh,3rem)] font-extrabold tabular-nums text-stone-900 outline-none focus:border-[#0A7A3D]" />
                <span className="text-sm font-semibold text-stone-600">{item.unit ?? 'unidades'} contadas</span>
              </label>
              <button type="button" aria-label="Mais um" onClick={() => update(item.number, { counted: Math.round(((c?.counted ?? 0) + 1) * 1000) / 1000 })}
                className="flex h-[clamp(56px,10dvh,80px)] w-[clamp(56px,10dvh,80px)] shrink-0 items-center justify-center rounded-2xl lg-tinted [--tint:#0a7a3d]"><Plus className="h-8 w-8" /></button>
            </div>

            <div className="flex shrink-0 gap-2">
              {!blind && (
                <button type="button" onClick={confirmExpected}
                  className="flex h-[clamp(48px,8dvh,64px)] flex-[1.6] items-center justify-center gap-2 rounded-2xl border-2 border-[#0A7A3D] bg-white/80 text-lg font-bold text-[#06592C] shadow-[inset_0_1px_1px_rgba(255,255,255,1)] active:bg-green-50">
                  <Check className="h-6 w-6" />Veio certo
                </button>
              )}
              <button type="button" onClick={() => setSheet('problema')} aria-haspopup="dialog"
                className={`flex h-[clamp(48px,8dvh,64px)] flex-1 items-center justify-center gap-2 rounded-2xl text-lg font-bold ${c?.issue ? 'lg-tinted [--tint:#b91c1c]' : 'lg-soft'}`}>
                <AlertTriangle className="h-5 w-5" />Problema
              </button>
            </div>
          </section>
        </main>
      )}

      {(voice.listening || voice.busy || voice.error) && (
        <p className="shrink-0 px-4 pt-1 text-center text-base font-semibold text-[#34443B]" role="status">
          {voice.error ?? (voice.busy ? 'Entendendo…' : voice.mode === 'servidor'
            ? 'Gravando: fale e toque no microfone para enviar.'
            : 'Ouvindo: "mais dois", "contei doze", "veio certo", "avaria", "próximo".')}
        </p>
      )}

      {/* Barra de ações no alcance do polegar */}
      <nav className="shrink-0 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2" aria-label="Ações da conferência">
        <div className="lg-bar flex items-center gap-2 rounded-[28px] p-2">
          {mode === 'passo' && (
            <button type="button" aria-label="Item anterior" disabled={safeIndex === 0} onClick={() => setIndex(safeIndex - 1)}
              className="lg-soft flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] disabled:opacity-40"><ArrowLeft className="h-7 w-7" /></button>
          )}
          {voice.mode !== 'nenhum' && mode === 'passo' && (
            <button type="button" onClick={voice.toggle} disabled={voice.busy} aria-pressed={voice.listening}
              aria-label={voice.listening ? 'Desligar comandos de voz' : 'Ligar comandos de voz'}
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] ${voice.listening ? 'lg-tinted [--tint:#b91c1c]' : 'lg-soft'}`}>
              {voice.listening ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
            </button>
          )}
          <button type="button" onClick={() => setScanning(true)} aria-label="Bipar"
            className="lg-soft flex h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-[20px] text-lg font-bold">
            <ScanBarcode className="h-6 w-6 shrink-0" /><span className="max-[359px]:hidden">Bipar</span>
          </button>
          {mode === 'passo' && !last ? (
            <button type="button" onClick={next}
              className="flex h-14 min-w-0 flex-[1.4] items-center justify-center gap-2 rounded-[20px] lg-tinted [--tint:#0a7a3d] text-lg font-bold">
              Próximo<ArrowRight className="h-6 w-6" />
            </button>
          ) : (
            <button type="button" onClick={() => setPhase('revisar')}
              className="flex h-14 min-w-0 flex-[1.4] items-center justify-center gap-2 rounded-[20px] lg-tinted [--tint:#0a7a3d] text-lg font-bold">
              Revisar<ArrowRight className="h-6 w-6" />
            </button>
          )}
        </div>
      </nav>

      {scanning && (
        <div className="fixed inset-0 z-40 flex flex-col bg-black">
          <div className="min-h-0 flex-1">
            <Scanner formats={['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_128']} height="100%" fullscreen
              hint="Bipe o código do produto" onDetect={onScanProduct} accept={(v) => /^\d{8,14}$/.test(v)} />
          </div>
          <div className="flex shrink-0 items-center gap-3 bg-stone-900 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 text-white">
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-stone-400">Cada bipe soma 1 no produto</span>
              <span className="block text-base font-bold tabular-nums">{done} de {items.length} conferidos</span>
            </span>
            <button type="button" onClick={() => setScanning(false)} className="flex h-14 items-center gap-2 rounded-2xl bg-white px-5 text-lg font-bold text-stone-900">
              <X className="h-6 w-6" />Fechar
            </button>
          </div>
        </div>
      )}

      {sheet === 'problema' && item && (
        <Sheet title="Problema no item" onClose={() => setSheet(null)}>
          <p className="truncate text-base text-stone-700">{displayName(item)}</p>
          <div className="grid gap-2" role="group" aria-label="Problema no item">
            {ISSUES.map((iss) => {
              const active = c?.issue === iss.key;
              return (
                <button key={iss.key} type="button" aria-pressed={active}
                  onClick={() => update(item.number, { issue: active ? null : iss.key, counted: c?.counted ?? null })}
                  className={`flex h-14 items-center gap-3 rounded-2xl px-4 text-lg font-bold ${active ? 'lg-tinted [--tint:#b91c1c]' : 'lg-soft'}`}>
                  {active ? <Check className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6 text-red-700" />}{iss.label}
                </button>
              );
            })}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-base font-semibold">Observação (opcional)</span>
            <input value={c?.note ?? ''} maxLength={140} onChange={(e) => update(item.number, { note: e.target.value, counted: c?.counted ?? null })}
              placeholder="Ex.: 2 caixas amassadas" className="h-14 rounded-2xl border border-[#CFDAD3] bg-[#F7FAF8] px-4 text-lg outline-none transition focus:border-[#0A7A3D] focus:bg-white focus:ring-4 focus:ring-[#0A7A3D]/15" />
          </label>
          <button type="button" onClick={() => setSheet(null)} className="h-14 rounded-[20px] lg-tinted [--tint:#0a7a3d] text-lg font-bold">Pronto</button>
        </Sheet>
      )}

      {sheet === 'menu' && (
        <Sheet title="Opções" onClose={() => setSheet(null)}>
          <div className="lg-glass grid grid-cols-2 rounded-full p-1" role="tablist" aria-label="Modo">
            {([['passo', 'Um por vez'], ['lista', 'Lista']] as const).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setSheet(null); }}
                className={`flex h-12 items-center justify-center gap-1 rounded-full text-base font-bold ${mode === k ? 'lg-tab-on' : 'text-[#5B6B62]'}`}>
                {k === 'lista' && <List className="h-5 w-5" />}{label}
              </button>
            ))}
          </div>
          <label className="lg-card flex items-center gap-3 rounded-2xl px-4 py-3 text-base font-semibold">
            <input type="checkbox" checked={blind} onChange={(e) => { setBlind(e.target.checked); blindRef.current = e.target.checked; push(countsRef.current); }} className="h-6 w-6 accent-[#0A7A3D]" />
            <EyeOff className="h-5 w-5 text-stone-500" />Conferência cega (esconde a quantidade da nota)
          </label>
          <p className="text-sm text-stone-600">{syncLabel}. Dica: arraste o produto para o lado para trocar de item.</p>
        </Sheet>
      )}
    </div>
  );
};

export default ConferenceScreen;
