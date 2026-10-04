import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle, Info } from 'lucide-react';

/**
 * Diálogos da aplicação no lugar de window.confirm / alert / prompt.
 *
 * Chamados de qualquer lugar e devolvem uma promessa:
 *   if (!(await confirmDialog('Remover o caixa?\n\nO agente para de enviar notas.'))) return;
 * A primeira frase (até "?" ou a primeira linha) vira o título; o resto, a
 * explicação. O botão usa o verbo da pergunta ("Remover", "Excluir"...) e fica
 * vermelho quando a ação apaga ou encerra algo.
 */

type Kind = 'confirm' | 'alert' | 'prompt';
interface Options { title?: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; defaultValue?: string; inputLabel?: string }
interface Request extends Options { kind: Kind; resolve: (v: boolean | string | null) => void }

let push: ((r: Request) => void) | null = null;
const queue: Request[] = [];

const DANGER = /^(remover|excluir|apagar|encerrar|tirar|cancelar o|revogar|desativar|bloquear)/i;
const VERB = /^(remover|excluir|apagar|encerrar|enviar|confirmar|voltar|criar|tirar|revogar|desativar|bloquear|liberar|publicar|descartar)/i;

const split = (text: string): { title: string; message?: string } => {
  const t = text.trim();
  const q = t.indexOf('?');
  const nl = t.indexOf('\n');
  const cut = q !== -1 && (nl === -1 || q < nl) ? q + 1 : nl !== -1 ? nl : t.length;
  const title = t.slice(0, cut).trim();
  const message = t.slice(cut).trim();
  return { title, message: message || undefined };
};

const open = (kind: Kind, textOrOpts: string | Options, extra?: Options) => new Promise<boolean | string | null>((resolve) => {
  const base = typeof textOrOpts === 'string' ? split(textOrOpts) : textOrOpts;
  const req: Request = { kind, resolve, ...base, ...extra };
  if (push) push(req); else queue.push(req);
});

export const confirmDialog = (text: string | Options, opts?: Options) => open('confirm', text, opts) as Promise<boolean>;
export const alertDialog = (text: string | Options, opts?: Options) => open('alert', text, opts).then(() => undefined);
export const promptDialog = (text: string | Options, defaultValue = '', opts?: Options) =>
  open('prompt', text, { defaultValue, ...opts }) as Promise<string | null>;

/** Montado uma vez na raiz da aplicação. */
export const DialogHost: React.FC = () => {
  const [req, setReq] = useState<Request | null>(null);
  const [value, setValue] = useState('');
  const okRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    push = (r) => {
      lastFocus.current = document.activeElement as HTMLElement | null;
      setValue(r.defaultValue ?? '');
      setReq(r);
    };
    const pending = queue.shift();
    if (pending) push(pending);
    return () => { push = null; };
  }, []);

  useEffect(() => {
    if (!req) return;
    const t = setTimeout(() => (req.kind === 'prompt' ? inputRef.current?.select() : okRef.current?.focus()), 20);
    return () => clearTimeout(t);
  }, [req]);

  if (!req) return null;

  const close = (result: boolean | string | null) => {
    req.resolve(result);
    setReq(null);
    lastFocus.current?.focus?.();
    const next = queue.shift();
    if (next) setTimeout(() => push?.(next), 0);
  };
  const cancel = () => close(req.kind === 'confirm' ? false : null);
  const ok = () => close(req.kind === 'prompt' ? value : true);

  const danger = req.danger ?? (req.kind === 'confirm' && DANGER.test(req.title ?? ''));
  const verb = (req.title ?? '').match(VERB)?.[1];
  const okLabel = req.confirmLabel ?? (req.kind === 'alert' ? 'Entendi' : verb ? verb.charAt(0).toUpperCase() + verb.slice(1).toLowerCase() : 'Confirmar');
  const Icon = req.kind === 'alert' ? Info : danger ? AlertTriangle : HelpCircle;

  return (
    <div className="fx-dialog-shade" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
        if (e.key === 'Enter' && req.kind !== 'prompt' && (e.target as HTMLElement).tagName !== 'BUTTON') ok();
        if (e.key === 'Tab') {
          // foco preso dentro do diálogo
          const els = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button, input'));
          const i = els.indexOf(document.activeElement as HTMLElement);
          if (e.shiftKey && i <= 0) { e.preventDefault(); els[els.length - 1]?.focus(); }
          else if (!e.shiftKey && i === els.length - 1) { e.preventDefault(); els[0]?.focus(); }
        }
      }}>
      <div className={`fx-dialog ${danger ? 'danger' : ''}`} role={req.kind === 'alert' ? 'alertdialog' : 'dialog'} aria-modal="true"
        aria-labelledby="fx-dialog-title" aria-describedby={req.message ? 'fx-dialog-msg' : undefined}>
        <span className="fx-dialog-icon" aria-hidden="true"><Icon /></span>
        <h2 id="fx-dialog-title">{req.title}</h2>
        {req.message && <p id="fx-dialog-msg">{req.message}</p>}
        {req.kind === 'prompt' && (
          <label className="fx-field" style={{ marginTop: 14 }}>{req.inputLabel ?? 'Valor'}
            <input ref={inputRef} className="input" value={value} onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }} />
          </label>
        )}
        <div className="fx-dialog-actions">
          {req.kind !== 'alert' && <button type="button" className="fx-btn ghost" onClick={cancel}>{req.cancelLabel ?? 'Cancelar'}</button>}
          <button ref={okRef} type="button" className={`fx-btn ${danger ? 'danger' : 'dark'}`} onClick={ok}>{okLabel}</button>
        </div>
      </div>
    </div>
  );
};
