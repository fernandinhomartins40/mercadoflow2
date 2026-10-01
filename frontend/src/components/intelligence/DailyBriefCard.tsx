import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Mic, Pause, RefreshCw, Square, Volume2 } from 'lucide-react';
import { copilotAgentsService, copilotService, type DailyBrief } from '../../services/aiPlatform.service';
import { canSpeak as speechAvailable, speak, stopSpeaking, useVoice } from '../../hooks/useVoice';
import { parseBrief, type BriefAction } from '../../utils/voiceCommands';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-500)] focus-visible:ring-offset-2';

const canSpeak = speechAvailable();

/**
 * Resumo do dia do Copiloto: texto pronto gerado toda manhã (sem custo de IA),
 * que o lojista lê ou ouve pela voz do próprio aparelho.
 */
const DailyBriefCard: React.FC<{ marketId: string | null | undefined }> = ({ marketId }) => {
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const navigate = useNavigate();

  const decision = brief?.items.find((i) => i.tipo === 'decisao');

  const approveByVoice = async () => {
    if (!decision || !marketId) { setHeard('Não há nada esperando a sua aprovação agora.'); return; }
    try {
      await copilotAgentsService.approve(marketId, decision.id);
      setHeard(`Aprovado: ${decision.titulo}. Confira em Copiloto.`);
      speak('Pronto, aprovado.');
    } catch (e) {
      setHeard((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Não consegui aprovar agora.');
    }
  };

  const act = (action: BriefAction | null, text: string) => {
    if (action === 'aprovar') void approveByVoice();
    else if (action === 'detalhe') navigate(decision ? '/app/copiloto' : '/app/inteligencia');
    else if (action === 'depois') { stopSpeaking(); setHeard('Combinado, fica para depois.'); }
    else if (action === 'repetir' && brief) { setSpeaking(true); speak(brief.text, () => setSpeaking(false)); }
    else if (action === 'pergunta') navigate(`/app/perguntar?voz=1&q=${encodeURIComponent(text)}`);
    else setHeard(`Não entendi "${text}". Diga "detalhe", "depois", "repete" ou faça uma pergunta.`);
  };

  // Responder falando: a lista fixa resolve no aparelho; só o que ela não reconhece vai ao Jev.
  const voice = useVoice({
    marketId,
    onText: async (text) => {
      setHeard(null);
      const local = parseBrief(text);
      if (local || !marketId) { act(local?.acao ?? null, text); return; }
      try {
        const r = await copilotService.command(marketId, 'RESUMO', text);
        act((r.acao as BriefAction | null) ?? null, text);
      } catch {
        act(null, text);
      }
    },
  });

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
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak(brief.text, () => setSpeaking(false));
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
          {voice.mode !== 'nenhum' && (
            <button
              type="button"
              onClick={() => { setSpeaking(false); voice.toggle(); }}
              disabled={voice.busy}
              className={`flex h-10 w-10 items-center justify-center rounded-full ${FOCUS}`}
              style={voice.listening ? { background: '#b91c1c', color: '#fff' } : { color: 'var(--brand-700)' }}
              aria-pressed={voice.listening}
              aria-label={voice.listening ? 'Parar de ouvir' : 'Responder falando'}
              title="Responder falando: detalhe, depois, repete ou uma pergunta"
            >
              {voice.busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                : voice.listening ? <Square className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
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
      {(voice.listening || voice.error || heard) && (
        <p className="mt-2 text-sm" role="status" style={{ color: voice.error ? '#b91c1c' : 'var(--text-muted)' }}>
          {voice.error ?? (voice.listening
            ? `Ouvindo… diga ${decision ? '"aprova", ' : ''}"detalhe", "depois", "repete" ou pergunte.`
            : heard)}
        </p>
      )}
      {brief.items.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {decision && (
            <Link to="/app/copiloto" className={`font-semibold no-underline ${FOCUS}`} style={{ color: 'var(--brand-700)' }}>
              Ver o que o Copiloto preparou
            </Link>
          )}
          <Link to="/app/inteligencia" className={`font-semibold no-underline ${FOCUS}`} style={{ color: 'var(--brand-700)' }}>
            Ver os assuntos na Central de Inteligência
          </Link>
        </p>
      )}
    </section>
  );
};

export default DailyBriefCard;
