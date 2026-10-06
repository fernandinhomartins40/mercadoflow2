import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Loader2, Mic, Pause, RefreshCw, Sparkles, Square, Volume2 } from 'lucide-react';
import { copilotAgentsService, copilotService, type DailyBrief } from '../../services/aiPlatform.service';
import { canSpeak as speechAvailable, speak, stopSpeaking, useVoice } from '../../hooks/useVoice';
import { parseBrief, type BriefAction } from '../../utils/voiceCommands';

const canSpeak = speechAvailable();


/**
 * Resumo do Tino no Início: uma faixa com a frase do dia, ouvir, responder
 * falando e aprovar o que ele preparou. O texto é gerado toda manhã sem custo
 * de IA; o resto do Início mostra os números e as decisões.
 */
const DailyBriefCard: React.FC<{ marketId: string | null | undefined }> = ({ marketId }) => {
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const navigate = useNavigate();

  const decision = brief?.items.find((i) => i.tipo === 'decisao') as
    (DailyBrief['items'][number] & { nivel?: number; urgente?: boolean }) | undefined;
  const canApprove = !!decision && (decision.nivel ?? 2) >= 2 && approved !== decision.id;

  const approve = async () => {
    if (!decision || !marketId) { setHeard('Não há nada esperando a sua aprovação agora.'); return; }
    setApproving(true);
    try {
      await copilotAgentsService.approve(marketId, decision.id);
      setApproved(decision.id);
      setHeard(`Aprovado: ${decision.titulo}. Confira em Decidir.`);
      speak('Pronto, aprovado.');
    } catch (e) {
      setHeard((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Não consegui aprovar agora.');
    } finally {
      setApproving(false);
    }
  };

  const act = (action: BriefAction | null, text: string) => {
    if (action === 'aprovar') void approve();
    else if (action === 'detalhe') navigate('/app/decidir');
    else if (action === 'depois') { stopSpeaking(); setHeard('Combinado, fica para depois.'); }
    else if (action === 'repetir' && brief) { setSpeaking(true); speak(brief.text, () => setSpeaking(false)); }
    else if (action === 'pergunta') navigate(`/app/perguntar?voz=1&q=${encodeURIComponent(text)}`);
    else setHeard(`Não entendi "${text}". Diga "detalhe", "depois", "repete" ou faça uma pergunta.`);
  };

  // Responder falando: a lista fixa resolve no aparelho; só o que ela não reconhece vai ao Tino.
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
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    setSpeaking(true);
    speak(brief.text, () => setSpeaking(false));
  };

  const refresh = async () => {
    if (!marketId) return;
    setRefreshing(true);
    try { setBrief(await copilotService.refreshBrief(marketId)); } catch { /* mantém o resumo anterior */ } finally { setRefreshing(false); }
  };

  // Uma frase no Início; o texto inteiro abre ao pedir. Os números e as
  // decisões já estão no painel e na fila Decidir, então não se repetem aqui.
  const sentences = brief.text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const lead = sentences.slice(0, 2).join(' ');
  const hasMore = sentences.length > 2;

  return (
    <section id="resumo-do-dia" className="fx-forest" aria-label="Resumo do Tino" style={{ padding: 'clamp(14px, 1.6vw, 20px) clamp(16px, 2vw, 24px)' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className={`fx-brief-orb ${speaking ? 'on' : ''}`} aria-hidden="true" style={{ width: 44, height: 44 }}><Sparkles /></span>
        <p style={{ margin: 0, flex: '1 1 320px', minWidth: 0, fontSize: 15.5, lineHeight: 1.45 }}>
          {showText ? brief.text : lead}
          {hasMore && (
            <button type="button" className="fx-brief-more" style={{ display: 'inline', marginLeft: 8 }} aria-expanded={showText} onClick={() => setShowText((v) => !v)}>
              {showText ? 'Mostrar menos' : 'Ler tudo'}
            </button>
          )}
        </p>
        <div className="fx-brief-tools">
          {decision && canApprove && (
            <button type="button" className="fx-btn lime small" onClick={approve} disabled={approving} title={decision.titulo}>
              {approving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}Aprovar o que o Tino preparou
            </button>
          )}
          {canSpeak && (
            <button type="button" onClick={listen} className="fx-btn ghost small" aria-pressed={speaking}>
              {speaking ? <Pause aria-hidden="true" /> : <Volume2 aria-hidden="true" />}{speaking ? 'Parar' : 'Ouvir'}
              {speaking && <span className="fx-wave" aria-hidden="true"><i /><i /><i /><i /></span>}
            </button>
          )}
          {voice.mode !== 'nenhum' && (
            <button type="button" onClick={() => { setSpeaking(false); voice.toggle(); }} disabled={voice.busy}
              className={`fx-brief-round ${voice.listening ? 'rec' : ''}`} aria-pressed={voice.listening}
              aria-label={voice.listening ? 'Parar de ouvir' : 'Responder falando'} title="Responder falando: aprova, detalhe, depois, repete ou uma pergunta">
              {voice.busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : voice.listening ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
            </button>
          )}
          <button type="button" onClick={refresh} disabled={refreshing} className="fx-brief-round"
            aria-label="Atualizar o resumo com os números de agora" title="Atualizar">
            <RefreshCw className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
        </div>
      </div>
      {(voice.listening || voice.error || heard || approved) && (
        <p className="fx-brief-heard" role="status" style={{ marginTop: 10 }}>
          {voice.error ?? (voice.listening ? `Ouvindo… diga ${decision ? '"aprova", ' : ''}"detalhe", "depois", "repete" ou pergunte.` : heard)}
          {approved && !voice.listening && <> <Link to="/app/decidir?aba=resultado">Ver o resultado</Link></>}
        </p>
      )}
    </section>
  );
};

export default DailyBriefCard;
