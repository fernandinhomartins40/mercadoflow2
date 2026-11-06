import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, Loader2, ScanBarcode, X } from 'lucide-react';
import Scanner from '../../confere/Scanner';
import { buzz, hasNativeScanner, scanWithNative } from '../../confere/native';
import { storeMapService } from '../../../services/storeMap.service';
import ProductImage from '../../../components/product/ProductImage';
import type { LocatedProduct } from '../../../types/storeMap.types';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';
const BTN = `inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${FOCUS}`;
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'itf'] as const;

interface Props {
  marketId: string;
  /** "Módulo 2 · 3ª prateleira de cima". */
  where: string;
  /** Produto achado: entra na prateleira atual. */
  onFound: (p: LocatedProduct) => void;
  /** Passa para a prateleira de baixo (ou o próximo módulo); falso quando acabou. */
  onNext: () => boolean;
  onClose: () => void;
}

/**
 * Bipar a prateleira: cada código lido entra na prateleira atual, e um toque
 * passa para a de baixo. No app Android abre o leitor do Google, que lê um
 * código por vez; no navegador e no iPhone, a câmera fica aberta e lê em sequência.
 */
const ShelfScan: React.FC<Props> = ({ marketId, where, onFound, onNext, onClose }) => {
  const native = hasNativeScanner();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<LocatedProduct | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const onFoundRef = useRef(onFound);
  onFoundRef.current = onFound;

  const find = async (raw: string) => {
    const code = raw.replace(/\D/g, '');
    if (code.length < 6) return;
    setBusy(true); setMessage(null);
    try {
      const p = await storeMapService.byBarcode(marketId, code);
      onFoundRef.current(p);
      setLast(p);
      setCount((n) => n + 1);
      void buzz('ok');
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setMessage(status === 404 ? `O código ${code} não está no cadastro. Coloque pelo nome, na busca.` : 'Não foi possível buscar o produto. Bipe de novo.');
      void buzz('erro');
    } finally {
      setBusy(false);
    }
  };

  /** Leitor do Google: um código por vez, até a pessoa voltar sem ler. */
  const nativeLoop = async () => {
    setMessage(null);
    try {
      for (;;) {
        const value = await scanWithNative('produto');
        if (!value) break;
        await find(value);
      }
    } catch (e) {
      setMessage((e as Error)?.message || 'Não foi possível abrir o leitor.');
    }
  };

  useEffect(() => { if (native) void nativeLoop(); /* abre o leitor ao entrar */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [code, setCode] = useState('');
  const next = () => { if (!onNext()) setMessage('Esta era a última prateleira do lado.'); else { setLast(null); setCount(0); } };

  return (
    <div className="flex flex-col gap-3 rounded-xl p-3" style={{ background: 'var(--surface-soft)', border: '1px solid var(--brand-700)' }} aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
          <ScanBarcode className="mr-1 inline h-4 w-4" aria-hidden="true" />
          Bipando em <strong>{where}</strong>{count > 0 ? ` · ${count} bipado${count > 1 ? 's' : ''}` : ''}
        </p>
        <button type="button" onClick={onClose} className={`${BTN} min-h-[36px] w-9 px-0`} aria-label="Parar de bipar" style={{ color: 'var(--text-muted)' }}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {native ? (
        <button type="button" onClick={() => void nativeLoop()} className={`${BTN} text-white`} style={{ background: 'var(--brand-700)' }}>
          <ScanBarcode className="h-5 w-5" aria-hidden="true" /> Abrir o leitor
        </button>
      ) : (
        <Scanner formats={[...FORMATS]} paused={busy} height="34vh" hint="Aponte para o código de barras do produto"
          onDetect={(v) => { void find(v); }} />
      )}

      {/* Leitor USB ou código digitado. */}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void find(code); setCode(''); }}>
        <label htmlFor="shelf-scan-code" className="sr-only">Código de barras</label>
        <input id="shelf-scan-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ou digite o código de barras"
          className={`h-11 min-w-0 flex-1 rounded-lg px-3 text-sm ${FOCUS}`} style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
        <button type="submit" className={BTN} style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>Colocar</button>
      </form>

      {busy && <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Procurando o produto…</p>}
      {last && !busy && (
        <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
          <span className="h-9 w-9 shrink-0 overflow-hidden rounded" style={{ background: 'var(--surface-base)' }}><ProductImage src={last.imageUrl} alt="" className="h-full w-full object-contain" /></span>
          <span className="min-w-0 flex-1"><strong className="block truncate">{last.name}</strong>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>entrou nesta prateleira{last.places?.length ? ` · também está em ${last.places.length} outro${last.places.length > 1 ? 's' : ''} lugar${last.places.length > 1 ? 'es' : ''}` : ''}</span>
          </span>
        </p>
      )}
      {message && <p role="alert" className="text-sm" style={{ color: '#b45309' }}>{message}</p>}

      <button type="button" onClick={next} className={BTN} style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>
        <ArrowDown className="h-4 w-4" aria-hidden="true" /> Próxima prateleira
      </button>
    </div>
  );
};

export default ShelfScan;
