import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { useAuth } from '../context/AuthContext';
import {
  dataChatService, ChatMessage, CONSULTA_LABEL,
} from '../services/dataChat.service';
import {
  MessageSquare, Send, Loader2, Sparkles, Database, AlertTriangle, Settings,
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!marketId) return;
    dataChatService.status(marketId)
      .then(s => { setAvailable(s.disponivel); setSuggestions(s.sugestoes || []); })
      .catch(() => setAvailable(false));
  }, [marketId]);

  // Rola para a resposta nova. Sem isso, respostas longas empurram o campo de
  // digitação para fora da tela.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const send = useCallback(async (question: string) => {
    if (!marketId || !question.trim() || sending) return;

    const historyForBackend = messages;
    setMessages(prev => [...prev, { autor: 'usuario', texto: question.trim() }]);
    setInput('');
    setSending(true);

    try {
      const res = await dataChatService.ask(marketId, question.trim(), historyForBackend);
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
              resposta com os números reais da sua loja. Para usar, configure uma
              chave de IA — há serviços com plano gratuito.
            </p>
            <Link
              to="/app/configuracoes"
              className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: 'var(--brand-500)' }}
            >
              <Settings className="h-4 w-4" /> Configurar agora
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-4" style={{ maxWidth: '48rem' }}>
        {/* Conversa */}
        <div className="flex flex-col gap-4">
          {messages.length === 0 && (
            <div
              className="rounded-xl p-6"
              style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" style={{ color: 'var(--brand-500)' }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Sobre o que você quer saber?
                </p>
              </div>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                As respostas vêm sempre dos números da sua loja — nada é estimado.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {suggestions.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full px-3 py-1.5 text-xs font-medium transition hover:opacity-80"
                    style={{
                      border: '1px solid var(--border-strong)',
                      background: 'var(--surface-soft)',
                      color: 'var(--text-primary)',
                    }}
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
                className="max-w-[85%] rounded-xl px-4 py-3"
                style={m.autor === 'usuario'
                  ? { background: 'var(--brand-500)', color: '#fff' }
                  : {
                    border: `1px solid ${m.erro ? '#fecaca' : 'var(--border-soft)'}`,
                    background: m.erro ? '#fef2f2' : 'var(--surface-base)',
                    color: m.erro ? '#991b1b' : 'var(--text-primary)',
                  }}
              >
                {m.erro && (
                  <AlertTriangle className="mb-1 inline-block h-3.5 w-3.5 mr-1.5" />
                )}
                <span className="whitespace-pre-wrap text-sm leading-relaxed">{m.texto}</span>

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

        {/* Campo de pergunta */}
        <form
          onSubmit={e => { e.preventDefault(); send(input); }}
          className="sticky bottom-0 flex gap-2 py-3"
          style={{ background: 'var(--surface-app, transparent)' }}
        >
          <input
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
