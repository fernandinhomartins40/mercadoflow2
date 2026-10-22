import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, CloudOff, Keyboard, Minus, PackageX, Plus, ScanBarcode } from 'lucide-react';
import { stockCountService, type CountProduct } from '../../services/confere.service';
import Scanner from './Scanner';
import { BigButton, Card, SectionTitle, TabHeader, errorText } from './ui';
import { buzz, isNativeApp, scanWithNative } from './native';
import { COUNT_TEXT as T, fmtUnits as qty, parseUnits as num } from '../../lib/stockCount';

/**
 * Contar estoque (Bipaê): bipa o produto, diz quantos tem na prateleira e no
 * depósito, salva e já bipa o próximo. A contagem fica guardada no celular
 * até chegar ao MercadoFlow: sem internet no depósito, nada se perde.
 * Textos iguais aos do painel (/app/contar), em lib/stockCount.
 */

interface Counted { productId: string; name: string; imageUrl: string | null; units: number; at: number; sent: boolean }

const queueKey = (marketId: string) => `bipae.contagem.${marketId}`;
const readQueue = (marketId: string): Counted[] => {
  try { return JSON.parse(localStorage.getItem(queueKey(marketId)) || '[]') as Counted[]; } catch { return []; }
};
const writeQueue = (marketId: string, list: Counted[]) => {
  try { localStorage.setItem(queueKey(marketId), JSON.stringify(list.slice(0, 300))); } catch { /* sem armazenamento */ }
};

const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

const Photo: React.FC<{ src: string | null; name: string; size: number }> = ({ src, name, size }) => {
  const [broken, setBroken] = useState(false);
  return src && !broken
    ? <img src={src} alt="" width={size} height={size} onError={() => setBroken(true)}
        className="shrink-0 rounded-2xl bg-white object-contain p-1 ring-1 ring-[#E6EDE8]" style={{ width: size, height: size }} />
    : <span aria-hidden="true" className="flex shrink-0 items-center justify-center rounded-2xl bg-[#E7F3EA] text-lg font-extrabold text-[#045e48]"
        style={{ width: size, height: size }}>{name.trim().slice(0, 2).toUpperCase()}</span>;
};

const Stepper: React.FC<{ id: string; label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }> = ({ id, label, value, onChange, autoFocus }) => {
  const step = (d: number) => onChange(String(Math.max(0, num(value) + d)));
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-bold">{label}</label>
      <div className="flex items-stretch overflow-hidden rounded-2xl bg-white ring-1 ring-[#CCD8CF]">
        <button type="button" onClick={() => step(-1)} aria-label={`Menos 1 em ${label.toLowerCase()}`} className="flex w-14 items-center justify-center active:bg-[#EEF3EF]"><Minus className="h-6 w-6" /></button>
        <input id={id} value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d,.]/g, ''))} inputMode="decimal" autoFocus={autoFocus}
          placeholder="0" className="min-w-0 flex-1 border-x border-[#E6EDE8] bg-transparent py-3 text-center text-3xl font-extrabold tabular-nums outline-none" />
        <button type="button" onClick={() => step(1)} aria-label={`Mais 1 em ${label.toLowerCase()}`} className="flex w-14 items-center justify-center active:bg-[#EEF3EF]"><Plus className="h-6 w-6" /></button>
      </div>
    </div>
  );
};

const CountScreen: React.FC<{ marketId: string }> = ({ marketId }) => {
  const native = isNativeApp();
  const [product, setProduct] = useState<CountProduct | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [code, setCode] = useState('');
  const [shelf, setShelf] = useState('');
  const [stock, setStock] = useState('');
  const [list, setList] = useState<Counted[]>(() => readQueue(marketId));
  const syncing = useRef(false);
  const lastCode = useRef('');
  // Envio da fila: 'erro' mostra "Tentar de novo"; a contagem segue guardada no celular.
  const [sendState, setSendState] = useState<'parado' | 'enviando' | 'erro'>('parado');

  const pending = list.filter((c) => !c.sent);
  const total = num(shelf) + num(stock);

  /** Manda o que está na fila; o que não for, tenta de novo depois. */
  const sync = useCallback(async () => {
    if (syncing.current) return;
    const current = readQueue(marketId);
    const toSend = current.filter((c) => !c.sent);
    if (toSend.length === 0) return;
    syncing.current = true;
    setSendState('enviando');
    try {
      await stockCountService.save(marketId, toSend.slice(0, 200).map((c) => ({ productId: c.productId, units: c.units })));
      const sentIds = new Set(toSend.slice(0, 200).map((c) => c.productId + c.at));
      const next = readQueue(marketId).map((c) => (sentIds.has(c.productId + c.at) ? { ...c, sent: true } : c));
      writeQueue(marketId, next);
      setList(next);
      setSendState('parado');
    } catch {
      // continua na fila
      setSendState('erro');
    } finally {
      syncing.current = false;
    }
  }, [marketId]);

  useEffect(() => {
    void sync();
    const on = () => { void sync(); };
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [sync]);

  const find = useCallback(async (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 6) return;
    lastCode.current = digits;
    setLooking(true); setError(null); setMissing(null);
    try {
      const p = await stockCountService.lookup(marketId, digits);
      void buzz('ok');
      setProduct(p);
      const already = readQueue(marketId).find((c) => c.productId === p.productId);
      setShelf(already ? qty(already.units) : '');
      setStock('');
      setTyping(false); setCode('');
    } catch (e) {
      void buzz('erro');
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 404) setMissing(digits);
      else setError(errorText(e, T.lookupError));
    } finally {
      setLooking(false);
    }
  }, [marketId]);

  const scan = useCallback(async () => {
    setError(null);
    try {
      const value = await scanWithNative('produto');
      if (value) await find(value);
    } catch (e) {
      setError(errorText(e, (e as Error)?.message || 'Não foi possível abrir o leitor.'));
    }
  }, [find]);

  const save = async () => {
    if (!product) return;
    const item: Counted = { productId: product.productId, name: product.name, imageUrl: product.imageUrl, units: total, at: Date.now(), sent: false };
    // Bipou de novo o mesmo produto: vale a contagem nova.
    const next = [item, ...readQueue(marketId).filter((c) => c.productId !== product.productId || c.sent)];
    writeQueue(marketId, next);
    setList(next);
    setProduct(null); setShelf(''); setStock('');
    void buzz('ok');
    void sync();
    if (native) void scan();
  };

  const reset = () => { setProduct(null); setMissing(null); setError(null); setShelf(''); setStock(''); };

  return (
    <>
      <TabHeader title={T.title} subtitle={T.subtitle} />
      <div className="flex flex-col gap-5 px-4 pt-2">
        {product ? (
          <Card className="flex flex-col gap-5" aria-label="Produto bipado">
            <div className="flex items-center gap-4">
              <Photo src={product.imageUrl} name={product.name} size={84} />
              <div className="min-w-0">
                <p className="text-xl font-extrabold leading-snug">{product.name}</p>
                <p className="mt-1 text-sm text-[#5F7067]">
                  {product.perDay ? `Vende ${qty(product.perDay)} por dia` : 'Sem venda nos últimos 90 dias'}
                  {product.lastUnits != null && product.lastCountedAt ? ` · contado ${dayMonth(product.lastCountedAt)}: ${qty(product.lastUnits)}` : ''}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stepper id="cont-prateleira" label={T.shelf} value={shelf} onChange={setShelf} autoFocus={!native} />
              <Stepper id="cont-deposito" label={T.stock} value={stock} onChange={setStock} />
            </div>
            <p className="rounded-2xl bg-[#EEF3EF] px-4 py-3 text-lg">{T.total}: <strong className="tabular-nums">{qty(total)} {product.unit === 'KG' ? 'kg' : 'un.'}</strong></p>
            <div className="flex flex-col gap-2">
              <BigButton type="button" onClick={save}>{native ? T.saveAndNext : T.save}</BigButton>
              <button type="button" onClick={reset} className="py-3 text-base font-bold text-[#5F7067]">{T.skip}</button>
            </div>
          </Card>
        ) : missing ? (
          <Card className="flex flex-col items-center gap-3 text-center" aria-live="polite">
            <PackageX className="h-10 w-10 text-amber-700" aria-hidden="true" />
            <p className="text-xl font-extrabold">{T.missingTitle}</p>
            <p className="text-[#5F7067]">{T.missingHint(missing)}</p>
            <BigButton type="button" onClick={() => { reset(); if (native) void scan(); }}>{T.scanOther}</BigButton>
          </Card>
        ) : (
          <Card className="flex flex-col gap-4">
            {native ? (
              <BigButton type="button" onClick={scan} disabled={looking} className="flex items-center justify-center gap-2 py-5 text-xl">
                <ScanBarcode className="h-7 w-7" aria-hidden="true" />{looking ? T.searching : T.scan}
              </BigButton>
            ) : (
              <div className="overflow-hidden rounded-3xl">
                <Scanner formats={['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'itf']} onDetect={(v) => { void find(v); }}
                  paused={looking} height="38vh" hint="Aponte para o código de barras do produto" />
              </div>
            )}
            {typing ? (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void find(code); }}>
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" autoFocus aria-label="Código de barras"
                  placeholder="Números do código de barras" className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 text-lg ring-1 ring-[#CCD8CF] outline-none" />
                <button type="submit" disabled={code.length < 6 || looking} className="rounded-2xl bg-[#045e48] px-5 text-lg font-bold text-white disabled:opacity-50">{looking ? T.searching : 'Buscar'}</button>
              </form>
            ) : (
              <button type="button" onClick={() => setTyping(true)} className="flex items-center justify-center gap-2 py-2 text-base font-bold text-[#045e48]">
                <Keyboard className="h-5 w-5" aria-hidden="true" />{T.typeCode}
              </button>
            )}
          </Card>
        )}

        {error && (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-red-50 p-4 text-lg text-red-800">
            <p>{error}</p>
            {lastCode.current && !product && (
              <button type="button" onClick={() => { void find(lastCode.current); }} disabled={looking}
                className="self-start rounded-2xl bg-white px-5 py-3 text-base font-bold text-red-800 ring-1 ring-red-200">{T.retry}</button>
            )}
          </div>
        )}

        {list.length === 0 && !product && !missing && (
          <p className="pb-6 text-center text-base text-[#5F7067]">{T.empty}</p>
        )}

        {list.length > 0 && (
          <section className="flex flex-col gap-3 pb-6">
            <SectionTitle action={pending.length > 0 ? (
              <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-700" aria-live="polite">
                <CloudOff className="h-4 w-4" aria-hidden="true" />{sendState === 'enviando' ? T.saving : `${pending.length} na fila`}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm font-bold text-[#157A3D]"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{T.allSent}</span>
            )}>{T.counted(list.length)}</SectionTitle>
            {sendState === 'erro' && pending.length > 0 && (
              <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-base text-amber-900">
                <span>{T.saveError} A contagem fica guardada no celular.</span>
                <button type="button" onClick={() => { void sync(); }} className="shrink-0 rounded-2xl bg-white px-4 py-2.5 font-bold ring-1 ring-amber-200">{T.retry}</button>
              </div>
            )}
            <ul className="flex flex-col gap-2">
              {list.slice(0, 50).map((c) => (
                <li key={c.productId + c.at} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 lg-card">
                  <Photo src={c.imageUrl} name={c.name} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 font-bold leading-snug">{c.name}</span>
                    <span className="text-sm text-[#5F7067]">{c.sent ? T.sent : T.waiting}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-lg font-extrabold tabular-nums">
                    {qty(c.units)}{c.sent && <CheckCircle2 className="h-5 w-5 text-[#157A3D]" aria-label="enviado" />}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
};

export default CountScreen;
