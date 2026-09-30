import React, { useEffect, useRef, useState } from 'react';
import { Flashlight, FlashlightOff } from 'lucide-react';

/**
 * Câmera que lê código de barras.
 *
 * Chrome no Android tem o BarcodeDetector nativo; o Safari (iPhone) não tem,
 * então usamos o zxing em WebAssembly — o arquivo .wasm é servido pelo nosso
 * domínio (funciona sem internet depois da primeira vez). A biblioteca só é
 * baixada quando a câmera abre.
 */

type Format = 'code_128' | 'qr_code' | 'ean_13' | 'ean_8' | 'upc_a' | 'upc_e' | 'itf';

interface Detected { rawValue: string; format: string }
interface Detector { detect: (source: HTMLVideoElement) => Promise<Detected[]> }

let ponyfillPromise: Promise<new (opts: { formats: Format[] }) => Detector> | null = null;

const loadDetector = async (formats: Format[]): Promise<Detector> => {
  const native = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (native?.getSupportedFormats) {
    try {
      const supported = await native.getSupportedFormats();
      if (formats.every((f) => supported.includes(f))) return new native({ formats });
    } catch {
      // cai no zxing
    }
  }
  if (!ponyfillPromise) {
    ponyfillPromise = import('barcode-detector/ponyfill').then((mod) => {
      mod.prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? '/confere-app/zxing_reader.wasm' : prefix + path),
        },
      });
      return mod.BarcodeDetector as unknown as new (opts: { formats: Format[] }) => Detector;
    });
  }
  const Ctor = await ponyfillPromise;
  return new Ctor({ formats });
};

interface Props {
  formats: Format[];
  onDetect: (value: string, format: string) => void;
  /** Filtra leituras (ex.: só chaves de 44 dígitos). */
  accept?: (value: string, format: string) => boolean;
  paused?: boolean;
  /** Altura da área da câmera (CSS). */
  height?: string;
  hint?: string;
  /** Tela cheia: sem cantos arredondados. */
  fullscreen?: boolean;
}

const Scanner: React.FC<Props> = ({ formats, onDetect, accept, paused, height = '46vh', hint, fullscreen }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState<boolean | null>(null);
  const lastRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const onDetectRef = useRef(onDetect);
  const acceptRef = useRef(accept);
  const pausedRef = useRef(paused);
  onDetectRef.current = onDetect;
  acceptRef.current = accept;
  pausedRef.current = paused;

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador não dá acesso à câmera. Digite a chave abaixo.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean; focusMode?: string[] };
        if (caps.torch) setTorch(false);
        if (caps.focusMode?.includes('continuous')) {
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {});
        }
        const detector = await loadDetector(formats);
        setReady(true);
        const tick = async () => {
          if (stop) return;
          if (!pausedRef.current && video.readyState >= 2) {
            try {
              const found = await detector.detect(video);
              for (const f of found) {
                const value = (f.rawValue || '').trim();
                if (!value || (acceptRef.current && !acceptRef.current(value, f.format))) continue;
                const now = Date.now();
                // A mesma leitura seguida vale uma vez (a câmera vê o código várias vezes por segundo).
                if (value === lastRef.current.value && now - lastRef.current.at < 1800) continue;
                lastRef.current = { value, at: now };
                navigator.vibrate?.(60);
                onDetectRef.current(value, f.format);
                break;
              }
            } catch {
              // quadro ruim: tenta no próximo
            }
          }
          timer = setTimeout(tick, 140);
        };
        tick();
      } catch (e) {
        const name = (e as { name?: string })?.name;
        setError(name === 'NotAllowedError'
          ? 'A câmera foi bloqueada. Libere o acesso à câmera nas configurações do navegador, ou digite a chave abaixo.'
          : 'Não foi possível abrir a câmera. Digite a chave abaixo.');
      }
    })();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formats.join(',')]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  };

  return (
    <div className={`relative overflow-hidden bg-black ${fullscreen ? '' : 'rounded-3xl'}`} style={{ height }}>
      {error ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-lg text-white">{error}</div>
      ) : (
        <>
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted aria-label="Câmera" />
          {/* Mira: faixa larga, do jeito do código de barras do DANFE. */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[34%] w-[88%] rounded-2xl border-4 border-white/90 shadow-[0_0_0_2000px_rgba(0,0,0,0.35)]" />
          </div>
          <p className="absolute inset-x-0 bottom-3 text-center text-base font-semibold text-white drop-shadow">
            {ready ? (hint ?? 'Aponte para o código de barras') : 'Abrindo a câmera…'}
          </p>
          {torch !== null && (
            <button type="button" onClick={toggleTorch} aria-pressed={torch} aria-label={torch ? 'Apagar a lanterna' : 'Acender a lanterna'}
              className="absolute right-3 top-3 flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-white">
              {torch ? <FlashlightOff className="h-7 w-7" /> : <Flashlight className="h-7 w-7" />}
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default Scanner;
