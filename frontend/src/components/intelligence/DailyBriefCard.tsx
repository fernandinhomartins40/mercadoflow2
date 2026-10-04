import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Check, ChevronDown, ChevronRight, Loader2, MessageCircleQuestion, Mic, Pause, RefreshCw, Sparkles, Square, Volume2,
} from 'lucide-react';
import { copilotAgentsService, copilotService, type DailyBrief } from '../../services/aiPlatform.service';
import { canSpeak as speechAvailable, speak, stopSpeaking, useVoice } from '../../hooks/useVoice';
import { parseBrief, type BriefAction } from '../../utils/voiceCommands';
import { Chip } from '../flow/Flow';

const canSpeak = speechAvailable();

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: v >= 1000 ? 0 : 2 });

const QUICK = ['O que repor primeiro?', 'Por que as vendas caíram?', 'Onde está meu dinheiro parado?'];

/** Itens do resumo: os números vêm num item próprio; resumos antigos não o têm. */
type Numbers = { titulo: string; receitaOntem: number; cuponsOntem: number; variacao: number | null; pendentes: number; impactoPendente: number };

/**
 * Resumo do dia do Copiloto no painel floresta: os números de ontem em
 * destaque, o que merece atenção como linhas clicáveis, o que o Copiloto
 * preparou com o sim ali mesmo, e a voz (ouvir, responder falando).
 * O texto continua o mesmo, gerado toda manhã sem custo de IA.
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
  const topics = brief?.items.filter((i) => i.tipo === 'oportunidade') ?? [];
  const numbers = brief?.items.find((i) => i.tipo === 'numeros') as unknown as Numbers | undefined;
  const canApprove = !!decision && (decision.nivel ?? 2) >= 2 && approved !== decision.id;

  const approve = async () => {
    if (!decision || !marketId) { setHeard('Não há nada esperando a sua aprovação agora.'); return; }
    setApproving(true);
    try {
      await copilotAgentsService.approve(marketId, decision.id);
      setApproved(decision.id);
      setHeard(`Aprovado: ${decision.titulo}. Confira em Copiloto.`);
      speak('Pronto, aprovado.');
    } catch (e) {
      setHeard((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Não consegui aprovar agora.');
    } finally {
      setApproving(false);
    }
  };

  const act = (action: BriefAction | null, text: string) => {
    if (action === 'aprovar') void approve();
    else if (action === 'detalhe') navigate(decision ? '/app/copiloto' : '/app/inteligencia');
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

  const ask = (q: string) => navigate(`/app/perguntar?q=${encodeURIComponent(q)}`);
  const greeting = brief.text.split(/(?<=!)\s/)[0];
  const variation = numbers?.variacao;

  return (
    <section id="resumo-do-dia" className="fx-forest fx-brief" aria-labelledby="resumo-do-dia-titulo">
      <header className="fx-brief-head">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
          <span className={`fx-brief-orb ${speaking ? 'on' : ''}`} aria-hidden="true"><Sparkles /></span>
          <div style={{ minWidth: 0 }}>
            <h2 id="resumo-do-dia-titulo" className="fx-panel-title">Resumo do dia</h2>
            <p className="fx-panel-sub">{greeting} O Tino leu as vendas e as decisões da loja.</p>
          </div>
        </div>
        <div className="fx-brief-tools">
          {canSpeak && (
            <button type="button" onClick={listen} className="fx-btn lime small" aria-pressed={speaking}>
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
      </header>

      {(voice.listening || voice.error || heard) && (
        <p className="fx-brief-heard" role="status">
          {voice.error ?? (voice.listening ? `Ouvindo… diga ${decision ? '"aprova", ' : ''}"detalhe", "depois", "repete" ou pergunte.` : heard)}
        </p>
      )}

      <div className="fx-brief-grid">
        {/* Ontem, em números */}
        <div className="fx-brief-day">
          <small>Ontem{numbers?.titulo ? `, ${numbers.titulo}` : ''}</small>
          {numbers && numbers.receitaOntem > 0 ? (
            <>
              <b className="fx-num">{brl(numbers.receitaOntem)}</b>
              <span>{numbers.cuponsOntem.toLocaleString('pt-BR')} cupons
                {variation != null && <Chip tone={variation >= 0 ? 'lime' : 'red'}>{variation >= 0 ? '+' : '−'}{Math.abs(variation).toFixed(0)}% vs semana passada</Chip>}
              </span>
            </>
          ) : (
            <>
              <b style={{ fontSize: 'clamp(20px, 2vw, 26px)' }}>Sem vendas no sistema</b>
              <span>Confira se o agente do caixa está ligado.{' '}<Link to="/app/pdvs">Ver caixas</Link></span>
            </>
          )}
          {numbers && numbers.pendentes > 0 && (
            <Link to="/app/inteligencia" className="fx-brief-pending">
              <span><b className="fx-num">{numbers.pendentes.toLocaleString('pt-BR')}</b> {numbers.pendentes === 1 ? 'recomendação espera' : 'recomendações esperam'} você
                {numbers.impactoPendente > 0 && <small>retorno esperado de {brl(numbers.impactoPendente)}</small>}</span>
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
        </div>

        {/* O que merece atenção */}
        <div className="fx-brief-topics">
          <h3>{topics.length === 1 ? 'Merece atenção hoje' : 'Merecem atenção hoje'}</h3>
          {topics.length === 0 ? <p className="fx-muted" style={{ margin: 0 }}>Nada fora do normal. Bom dia para olhar as compras com calma.</p> : (
            <ol>
              {topics.map((t, n) => (
                <li key={t.id}>
                  <Link to="/app/inteligencia" className="fx-brief-topic">
                    <i>{n + 1}</i>
                    <span>{t.titulo}{t.impacto ? <small>{brl(Number(t.impacto))} em jogo</small> : null}</span>
                    <ChevronRight aria-hidden="true" />
                  </Link>
                  <button type="button" className="fx-brief-ask" onClick={() => ask(`O que fazer com: ${t.titulo}?`)} aria-label={`Perguntar ao Tino sobre ${t.titulo}`} title="Perguntar ao Tino">
                    <MessageCircleQuestion aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* O que o Copiloto preparou */}
        {decision && (
          <div className="fx-brief-ready">
            {decision.urgente && <span className="fx-chip red" style={{ alignSelf: 'flex-start' }}>Urgente</span>}
            <p className="fx-brief-ready-title">O Copiloto preparou: {decision.titulo}</p>
            {approved === decision.id ? (
              <p className="fx-brief-ok"><Check aria-hidden="true" />Aprovado. <Link to="/app/copiloto">Ver o resultado</Link></p>
            ) : (
              <>
                {canApprove && <p className="fx-brief-hint">Diga "aprova" para confirmar.</p>}
                <div className="fx-actions">
                  {canApprove && (
                    <button type="button" className="fx-btn dark small" onClick={approve} disabled={approving}>
                      {approving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}Aprovar
                    </button>
                  )}
                  <Link to="/app/copiloto" className="fx-btn ghost small">Revisar antes</Link>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <footer className="fx-brief-foot">
        <div className="fx-brief-quick" role="group" aria-label="Perguntas rápidas">
          {QUICK.map((q) => <button key={q} type="button" onClick={() => ask(q)}><Sparkles aria-hidden="true" />{q}</button>)}
        </div>
        <button type="button" className="fx-brief-more" aria-expanded={showText} onClick={() => setShowText((v) => !v)}>
          <ChevronDown aria-hidden="true" style={{ transform: showText ? 'rotate(180deg)' : 'none' }} />{showText ? 'Fechar o texto' : 'Ler o resumo inteiro'}
        </button>
      </footer>
      {showText && <p className="fx-brief-text">{brief.text}</p>}
    </section>
  );
};

export default DailyBriefCard;
