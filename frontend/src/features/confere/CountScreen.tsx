import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, CloudOff, Keyboard, Minus, PackageX, Plus, ScanBarcode } from 'lucide-react';
import { stockCountService, type CountProduct } from '../../services/confere.service';
import Scanner from './Scanner';
import { BigButton, Card, SectionTitle, TabHeader, errorText } from './ui';
import { buzz, isNativeApp, scanWithNative } from './native';

/**
 * Contar estoque (Bipaê): bipa o produto, diz quantos tem na prateleira e no
 * depósito, salva e já bipa o próximo. A contagem fica guardada no celular
 * até chegar ao MercadoFlow: sem internet no depósito, nada se perde.
 */

interface Counted { productId: string; name: string; imageUrl: string | null; units: number; at: number; sent: boolean }

const queueKey = (marketId: string) => `bipae.contagem.${marketId}`;
const readQueue = (marketId: string): Counted[] => {
  try { return JSON.parse(localStorage.getItem(queueKey(marketId)) || '[]') as Counted[]; } catch { return []; }
};
const writeQueue = (marketId: string, list: Counted[]) => {
  try { localStorage.setItem(queueKey(marketId), JSON.stringify(list.slice(0, 300))); } catch { /* sem armazenamento */ }
};

const num = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const qty = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
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

  const pending = list.filter((c) => !c.sent);
  const total = num(shelf) + num(stock);

  /** Manda o que está na fila; o que não for, tenta de novo depois. */
  const sync = useCallback(async () => {
    if (syncing.current) return;
    const current = readQueue(marketId);
    const toSend = current.filter((c) => !c.sent);
    if (toSend.length === 0) return;
    syncing.current = true;
    try {
      await stockCountService.save(marketId, toSend.slice(0, 200).map((c) => ({ productId: c.productId, units: c.units })));
      const sentIds = new Set(toSend.slice(0, 200).map((c) => c.productId + c.at));
      const next = readQueue(marketId).map((c) => (sentIds.has(c.productId + c.at) ? { ...c, sent: true } : c));
      writeQueue(marketId, next);
      setList(next);
    } catch {
      // continua na fila
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
      else setError(errorText(e, 'Não foi possível buscar o produto. Confira a internet e bipe de novo.'));
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
      <TabHeader title="Contar estoque" subtitle="Bipe o produto e diga quantos tem" />
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
              <Stepper id="cont-prateleira" label="Na prateleira" value={shelf} onChange={setShelf} autoFocus={!native} />
              <Stepper id="cont-deposito" label="No depósito" value={stock} onChange={setStock} />
            </div>
            <p className="rounded-2xl bg-[#EEF3EF] px-4 py-3 text-lg">Total na loja: <strong className="tabular-nums">{qty(total)} {product.unit === 'KG' ? 'kg' : 'un.'}</strong></p>
            <div className="flex flex-col gap-2">
              <BigButton type="button" onClick={save}>{native ? 'Salvar e bipar o próximo' : 'Salvar contagem'}</BigButton>
              <button type="button" onClick={reset} className="py-3 text-base font-bold text-[#5F7067]">Pular este produto</button>
            </div>
          </Card>
        ) : missing ? (
          <Card className="flex flex-col items-center gap-3 text-center" aria-live="polite">
            <PackageX className="h-10 w-10 text-amber-700" aria-hidden="true" />
            <p className="text-xl font-extrabold">Produto não está no cadastro</p>
            <p className="text-[#5F7067]">Código {missing}. Ele aparece aqui depois da primeira venda ou da primeira nota de entrada.</p>
            <BigButton type="button" onClick={() => { reset(); if (native) void scan(); }}>Bipar outro produto</BigButton>
          </Card>
        ) : (
          <Card className="flex flex-col gap-4">
            {native ? (
              <BigButton type="button" onClick={scan} disabled={looking} className="flex items-center justify-center gap-2 py-5 text-xl">
                <ScanBarcode className="h-7 w-7" aria-hidden="true" />{looking ? 'Buscando...' : 'Bipar produto'}
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
                <button type="submit" disabled={code.length < 6 || looking} className="rounded-2xl bg-[#045e48] px-5 text-lg font-bold text-white disabled:opacity-50">Buscar</button>
              </form>
            ) : (
              <button type="button" onClick={() => setTyping(true)} className="flex items-center justify-center gap-2 py-2 text-base font-bold text-[#045e48]">
                <Keyboard className="h-5 w-5" aria-hidden="true" />Digitar o código
              </button>
            )}
          </Card>
        )}

        {error && <p role="alert" className="rounded-2xl bg-red-50 p-4 text-lg text-red-800">{error}</p>}

        {list.length > 0 && (
          <section className="flex flex-col gap-3 pb-6">
            <SectionTitle action={pending.length > 0 && (
              <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-700"><CloudOff className="h-4 w-4" aria-hidden="true" />{pending.length} na fila</span>
            )}>Contados ({list.length})</SectionTitle>
            <ul className="flex flex-col gap-2">
              {list.slice(0, 50).map((c) => (
                <li key={c.productId + c.at} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 lg-card">
                  <Photo src={c.imageUrl} name={c.name} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 font-bold leading-snug">{c.name}</span>
                    <span className="text-sm text-[#5F7067]">{c.sent ? 'Enviado' : 'Esperando internet'}</span>
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
