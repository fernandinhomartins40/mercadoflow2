import { useCallback, useEffect, useRef, useState } from 'react';
import { copilotService } from '../services/aiPlatform.service';

/**
 * Voz do Copiloto no aparelho: reconhecimento e fala do próprio navegador
 * (grátis). Sem reconhecimento no navegador, grava o áudio e o servidor
 * transcreve (reserva paga, cobra créditos de IA; o áudio não é guardado).
 */

interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => Recognition;

const recognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const canRecord = () =>
  typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export type VoiceMode = 'navegador' | 'servidor' | 'nenhum';

export const voiceMode = (): VoiceMode => (recognitionCtor() ? 'navegador' : canRecord() ? 'servidor' : 'nenhum');

/** Fala um texto com a voz pt-BR do aparelho. */
export const speak = (text: string, onEnd?: () => void) => {
  if (!canSpeak() || !text) { onEnd?.(); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'pt-BR';
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('pt'));
  if (voice) u.voice = voice;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
};

export const stopSpeaking = () => { if (canSpeak()) window.speechSynthesis.cancel(); };

const MAX_RECORD_MS = 60_000;

const errorText = (code: string) =>
  code === 'not-allowed' || code === 'service-not-allowed'
    ? 'O microfone está bloqueado. Libere o microfone nas permissões do navegador.'
    : code === 'no-speech'
      ? 'Não ouvi nada. Aperte e fale perto do celular.'
      : code === 'audio-capture'
        ? 'Nenhum microfone encontrado.'
        : code === 'network'
          ? 'Sem internet para reconhecer a fala.'
          : 'Não consegui ouvir. Tente de novo.';

export interface UseVoiceOptions {
  marketId: string | null | undefined;
  /** Mãos livres: continua ouvindo e entrega cada frase (só com reconhecimento do navegador). */
  continuous?: boolean;
  onText: (text: string) => void;
}

export const useVoice = ({ marketId, continuous = false, onText }: UseVoiceOptions) => {
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mode = voiceMode();
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const wanted = useRef(false);
  const recognition = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const stop = useCallback(() => {
    wanted.current = false;
    if (timer.current) clearTimeout(timer.current);
    recognition.current?.stop();
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
    setListening(false);
  }, []);

  const startBrowser = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = 'pt-BR';
    r.continuous = continuous;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript?.trim();
        if (res.isFinal && text) onTextRef.current(text);
      }
    };
    r.onerror = (e) => {
      if (e.error === 'aborted' || (continuous && e.error === 'no-speech')) return;
      setError(errorText(e.error));
      wanted.current = false;
    };
    r.onend = () => {
      // Mãos livres: o navegador encerra sozinho depois de um silêncio; reabre enquanto o botão estiver ligado.
      if (continuous && wanted.current) {
        try { r.start(); return; } catch { /* segue para desligar */ }
      }
      wanted.current = false;
      setListening(false);
    };
    recognition.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError('Não consegui abrir o microfone.');
    }
  }, [continuous]);

  const startServer = useCallback(async () => {
    if (!marketId) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(errorText('not-allowed'));
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setListening(false);
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      if (!blob.size) return;
      setBusy(true);
      try {
        const r = await copilotService.transcribe(marketId, blob);
        if (r.ok && r.texto) onTextRef.current(r.texto);
        else setError(r.aviso || 'Não consegui entender o áudio.');
      } catch {
        setError('Não consegui enviar o áudio. Tente de novo ou digite.');
      } finally {
        setBusy(false);
      }
    };
    recorder.current = rec;
    rec.start();
    setListening(true);
    timer.current = setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, MAX_RECORD_MS);
  }, [marketId]);

  const start = useCallback(() => {
    if (listening || busy) return;
    setError(null);
    stopSpeaking();
    wanted.current = true;
    if (mode === 'navegador') startBrowser();
    else if (mode === 'servidor') void startServer();
    else setError('Este navegador não tem microfone disponível. Digite a pergunta.');
  }, [listening, busy, mode, startBrowser, startServer]);

  const toggle = useCallback(() => (listening ? stop() : start()), [listening, start, stop]);

  useEffect(() => () => {
    wanted.current = false;
    if (timer.current) clearTimeout(timer.current);
    recognition.current?.abort();
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
  }, []);

  return { mode, listening, busy, error, setError, start, stop, toggle };
};
