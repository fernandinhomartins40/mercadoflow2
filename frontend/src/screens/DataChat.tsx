import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHero, PanelTitle } from '../components/flow/Flow';
import Layout from '../components/layout/Layout';
import { useAuth } from '../context/AuthContext';
import { speak, stopSpeaking, useVoice } from '../hooks/useVoice';
import {
  dataChatService, ChatMessage, DemoAnswer, CONSULTA_LABEL,
} from '../services/dataChat.service';
import {
  MessageSquare, Send, Loader2, Sparkles, Database, AlertTriangle, Settings, Mic, Square,
} from 'lucide-react';

/**
 * Pergunte aos dados.
 *
 * A tela precisa deixar claro, sem dizer em voz alta, que os números não são
 * inventados: por isso cada resposta mostra quais consultas a alimentaram. Um
 * chat de IA sobre dados de negócio sem essa marcação convida o usuário a
 * confiar demais ou de menos — as duas coisas ruins.
 */
const DataChat: React.FC = () => {
  const { marketId } = useAuth();

  const [available, setAvailable] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [demo, setDemo] = useState<{ exemplos: DemoAnswer[]; mensagem?: string } | null>(null);
  const [creditNotice, setCreditNotice] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    if (!marketId) return;
    dataChatService.status(marketId)
      .then(s => {
        setAvailable(s.disponivel);
        setCreditNotice(s.avisoCreditos ?? null);
        setSuggestions(s.sugestoes || []);
        // Plano gratuito: em vez de porta trancada, três respostas prontas com
        // os números da própria loja.
        setDemo(s.modoDemonstracao
          ? { exemplos: s.exemplos || [], mensagem: s.mensagem }
          : null);
      })
      .catch(() => setAvailable(false));
  }, [marketId]);

  // Rola para a resposta nova. Sem isso, respostas longas empurram o campo de
  // digitação para fora da tela.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const send = useCallback(async (question: string, byVoice = false) => {
    if (!marketId || !question.trim() || sending) return;
    stopSpeaking();

    const historyForBackend = messages;
    setMessages(prev => [...prev, { autor: 'usuario', texto: question.trim() }]);
    setInput('');
    setSending(true);

    try {
      const res = await dataChatService.ask(marketId, question.trim(), historyForBackend);
      // Perguntou falando, ouve a resposta (voz do próprio aparelho, sem custo).
      if (byVoice) speak(res.sucesso ? res.resposta || '' : res.erro || 'Não consegui responder agora.');
      setMessages(prev => [...prev, res.sucesso
        ? {
          autor: 'assistente',
          texto: res.resposta || '',
          consultasUsadas: res.consultasUsadas,
        }
        : {
          autor: 'assistente',
          texto: res.erro || 'Não consegui responder agora.',
          erro: true,
        }]);
    } catch {
      setMessages(prev => [...prev, {
        autor: 'assistente',
        texto: 'Não consegui falar com o serviço agora. Tente de novo em instantes.',
        erro: true,
      }]);
    } finally {
      setSending(false);
    }
  }, [marketId, messages, sending]);

  // Aperte para falar: a frase reconhecida vira a pergunta e a resposta sai falada.
  const voice = useVoice({ marketId, onText: (text) => send(text, true) });

  // Pergunta vinda de outra tela (ex.: respondida por voz no resumo do dia).
  useEffect(() => {
    const q = params.get('q');
    if (!q || available === null) return;
    const byVoice = params.get('voz') === '1';
    setParams({}, { replace: true });
    send(q, byVoice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  /* ─── Plano gratuito: demonstração com dados reais ─── */
  if (demo) {
    return (
      <Layout>
        <div className="mx-auto flex w-full flex-col gap-4" style={{ maxWidth: '48rem' }}>
          <div
            className="rounded-xl p-5"
            style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" style={{ color: 'var(--brand-500)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Veja como funciona, com os dados da sua loja
              </p>
            </div>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              {demo.mensagem}
            </p>
            {creditNotice && (
              <p className="mt-2 rounded-lg px-3 py-2 text-sm" role="status"
                style={{ background: 'var(--surface-warning)', color: '#92400e' }}>
                {creditNotice}
              </p>
            )}
          </div>

          {demo.exemplos.map((ex, i) => (
            <div key={i} className="flex flex-col gap-3">
              <div className="flex justify-end">
                <div
                  className="max-w-[85%] rounded-xl px-4 py-2.5 text-sm"
                  style={{ background: 'var(--brand-500)', color: '#fff' }}
                >
                  {ex.pergunta}
                </div>
              </div>
              <div className="flex justify-start">
                <div
                  className="max-w-[85%] rounded-xl px-4 py-3"
                  style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}
                >
                  <span className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                    {ex.resposta}
                  </span>
                  <div
                    className="mt-3 flex items-center gap-1.5 border-t pt-2"
                    style={{ borderColor: 'var(--border-soft)' }}
                  >
                    <Database className="h-3 w-3" style={{ color: 'var(--text-soft)' }} />
                    <span className="text-[0.68rem]" style={{ color: 'var(--text-soft)' }}>
                      {CONSULTA_LABEL[ex.consulta] || ex.consulta}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <Link
            to="/app/planos"
            className="flex items-center justify-between gap-3 rounded-xl p-4 transition hover:opacity-90"
            style={{ border: '1px dashed var(--border-strong)', background: 'var(--surface-soft)' }}
          >
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Pergunte o que quiser
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Com créditos de IA (ou num plano pago) você conversa livremente com os dados da loja.
              </p>
            </div>
            <span className="text-xs font-semibold" style={{ color: 'var(--brand-700)' }}>
              Ver planos
            </span>
          </Link>
          <Link
            to="/app/configuracoes#creditos-ia"
            className="lg-tinted inline-flex items-center justify-center gap-2 self-start rounded-full px-4 py-2 text-sm font-semibold no-underline"
          >
            <Sparkles className="h-4 w-4" /> Comprar créditos de IA
          </Link>
        </div>
      </Layout>
    );
  }

  /* ─── Sem chave configurada ─── */
  if (available === false) {
    return (
      <Layout>
        <div className="max-w-2xl">
          <div
            className="rounded-xl p-8 text-center"
            style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}
          >
            <Sparkles className="mx-auto h-8 w-8" style={{ color: 'var(--brand-500)' }} />
            <h2 className="mt-4 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Pergunte aos dados da sua loja
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed"
              style={{ color: 'var(--text-muted)' }}>
              Faça perguntas como “o que preciso comprar essa semana?” e receba a
              resposta com os números reais da sua loja. Para usar, compre um pacote
              de créditos de IA do MercadoFlow.
            </p>
            {creditNotice && (
              <p className="mx-auto mt-3 max-w-md rounded-lg px-3 py-2 text-sm" role="status"
                style={{ background: 'var(--surface-warning)', color: '#92400e' }}>
                {creditNotice}
              </p>
            )}
            <Link
              to="/app/configuracoes#creditos-ia"
              className="lg-tinted mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold no-underline"
            >
              <Settings className="h-4 w-4" /> Comprar créditos de IA
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto flex w-full flex-col gap-4" style={{ maxWidth: '56rem' }}>
        {messages.length === 0 && (
          <PageHero title={<>Pergunte. <mark>A loja responde.</mark></>}
            subtitle="As respostas vêm sempre dos números da sua loja. Nada é estimado." />
        )}
        {/* Conversa */}
        <div className="flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="fx-forest">
              <PanelTitle icon={MessageSquare} title="Sobre o que você quer saber?" sub="Comece por uma destas ou escreva a sua pergunta." />
              <div className="mt-5 flex flex-wrap gap-2">
                {suggestions.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="fx-hub-btn"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={m.autor === 'usuario' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className="max-w-[85%] px-5 py-4"
                style={m.autor === 'usuario'
                  ? { background: 'var(--fx-forest)', color: '#fff', borderRadius: '22px 22px 6px 22px' }
                  : {
                    borderRadius: '22px 22px 22px 6px',
                    border: `1px solid ${m.erro ? '#fecaca' : 'var(--fx-line)'}`,
                    background: m.erro ? '#fef2f2' : 'var(--surface-base)',
                    color: m.erro ? '#991b1b' : 'var(--text-primary)',
                  }}
              >
                {m.erro && (
                  <AlertTriangle className="mb-1 inline-block h-3.5 w-3.5 mr-1.5" />
                )}
                <span className="whitespace-pre-wrap text-[15.5px] leading-relaxed">{m.texto}</span>

                {/* De onde vieram os números desta resposta. */}
                {m.consultasUsadas && m.consultasUsadas.length > 0 && (
                  <div
                    className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2"
                    style={{ borderColor: 'var(--border-soft)' }}
                  >
                    <Database className="h-3 w-3" style={{ color: 'var(--text-soft)' }} />
                    <span className="text-[0.68rem]" style={{ color: 'var(--text-soft)' }}>
                      dados consultados:
                    </span>
                    {m.consultasUsadas.map(c => (
                      <span
                        key={c}
                        className="rounded px-1.5 py-0.5 text-[0.68rem] font-medium"
                        style={{ background: 'var(--surface-soft)', color: 'var(--text-muted)' }}
                      >
                        {CONSULTA_LABEL[c] || c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div
                className="flex items-center gap-2 rounded-xl px-4 py-3"
                style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}
              >
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--brand-500)' }} />
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  consultando seus dados…
                </span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {(voice.listening || voice.error) && (
          <p className="text-sm" role="status" style={{ color: voice.error ? '#b91c1c' : 'var(--text-muted)' }}>
            {voice.error ?? (voice.mode === 'servidor' ? 'Gravando… toque de novo para enviar.' : 'Ouvindo… pode falar.')}
          </p>
        )}

        {/* Campo de pergunta */}
        <form
          onSubmit={e => { e.preventDefault(); send(input); }}
          className="sticky bottom-0 flex gap-2 py-3"
          style={{ background: 'var(--surface-app, transparent)' }}
        >
          <input
            aria-label="Sua pergunta"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={sending || available === null}
            maxLength={500}
            placeholder="Pergunte sobre vendas, estoque, compras…"
            className="flex-1 rounded-lg px-4 py-2.5 text-sm"
            style={{
              border: '1px solid var(--border-strong)',
              background: 'var(--surface-base)',
              color: 'var(--text-primary)',
            }}
          />
          {voice.mode !== 'nenhum' && (
            <button
              type="button"
              onClick={voice.toggle}
              disabled={sending || voice.busy || available === null}
              aria-pressed={voice.listening}
              aria-label={voice.listening ? 'Parar de ouvir' : 'Perguntar falando'}
              title={voice.mode === 'servidor' ? 'Perguntar falando (usa créditos de IA)' : 'Perguntar falando'}
              className="flex items-center justify-center rounded-lg px-3 py-2.5 transition disabled:opacity-50"
              style={voice.listening
                ? { background: '#b91c1c', color: '#fff' }
                : { border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
            >
              {voice.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : voice.listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--brand-500)' }}
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </Layout>
  );
};

export default DataChat;
