import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pause, RefreshCw, Volume2 } from 'lucide-react';
import { copilotService, type DailyBrief } from '../../services/aiPlatform.service';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-500)] focus-visible:ring-offset-2';

const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

/**
 * Resumo do dia do Copiloto: texto pronto gerado toda manhã (sem custo de IA),
 * que o lojista lê ou ouve pela voz do próprio aparelho.
 */
const DailyBriefCard: React.FC<{ marketId: string | null | undefined }> = ({ marketId }) => {
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!marketId) return;
    let alive = true;
    copilotService.brief(marketId).then((b) => { if (alive) setBrief(b); }).catch(() => {});
    return () => { alive = false; };
  }, [marketId]);

  useEffect(() => () => { if (canSpeak) window.speechSynthesis.cancel(); }, []);

  if (!brief?.text) return null;

  const listen = () => {
    if (!canSpeak) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(brief.text);
    u.lang = 'pt-BR';
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('pt'));
    if (voice) u.voice = voice;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };

  const refresh = async () => {
    if (!marketId) return;
    setRefreshing(true);
    try {
      setBrief(await copilotService.refreshBrief(marketId));
    } catch {
      // mantém o resumo anterior
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section id="resumo-do-dia" className="lg-card lg-glass rounded-2xl p-4" aria-labelledby="resumo-do-dia-titulo">
      <div className="flex items-start justify-between gap-3">
        <h2 id="resumo-do-dia-titulo" className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          Resumo do dia
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {canSpeak && (
            <button
              type="button"
              onClick={listen}
              className={`flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${FOCUS}`}
              style={{ background: 'var(--brand-700)', color: '#fff' }}
              aria-pressed={speaking}
            >
              {speaking ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
              {speaking ? 'Parar' : 'Ouvir'}
            </button>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className={`flex h-10 w-10 items-center justify-center rounded-full ${FOCUS}`}
            style={{ color: 'var(--text-muted)' }}
            aria-label="Atualizar o resumo com os números de agora"
            title="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
        {brief.text}
      </p>
      {brief.items.length > 0 && (
        <p className="mt-2 text-sm">
          <Link to="/app/inteligencia" className={`font-semibold no-underline ${FOCUS}`} style={{ color: 'var(--brand-700)' }}>
            Ver os assuntos na Central de Inteligência
          </Link>
        </p>
      )}
    </section>
  );
};

export default DailyBriefCard;
