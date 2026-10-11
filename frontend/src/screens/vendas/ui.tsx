import React, { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Chip } from '../../components/flow/Flow';
import { errorText } from '../../services/industry.service';
import { ORDER_STATUS, type OrderStatus } from '../../services/commerce.service';

/** Peças pequenas repetidas nas telas de vendas (portal, compras da loja e superadmin). */

export const field = (label: string, input: React.ReactNode, hint?: string) => (
  <label className="fx-field">{label}{input}{hint && <span className="fx-field-hint">{hint}</span>}</label>
);

export const grid = (min = 200): React.CSSProperties => ({
  display: 'grid', gap: 12, gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, alignItems: 'end',
});

/** Painel lateral com sombra; fecha no Esc e no clique fora. */
export const Drawer: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="fx-shade" onClick={onClose} aria-hidden="true" />
      <aside className="fx-drawer" role="dialog" aria-modal="true" aria-label={title} style={wide ? { width: 'min(760px, 100%)' } : undefined}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h2 className="fx-drawer-title" style={{ fontSize: 26 }}>{title}</h2>
          <button type="button" className="fx-btn ghost small" onClick={onClose} aria-label="Fechar"><X aria-hidden="true" /></button>
        </div>
        {children}
      </aside>
    </>
  );
};

/** Carrega, guarda o erro e oferece recarregar. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    try {
      setError(null);
      setData(await load());
    } catch (e) {
      setError(errorText(e, 'Não foi possível carregar agora.'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void reload(); }, [reload]);
  return { data, setData, error, reload };
}

/** Executa uma ação, mostrando a mensagem de erro ou de sucesso. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const run = async <T,>(work: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await work();
      if (success) setMsg({ text: success, ok: true });
      return r;
    } catch (e) {
      setMsg({ text: errorText(e), ok: false });
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  const view = msg ? <p role={msg.ok ? 'status' : 'alert'} style={{ margin: '10px 0 0', color: msg.ok ? 'var(--fx-green)' : 'var(--fx-red)', fontWeight: 600 }}>{msg.text}</p> : null;
  return { busy, run, msg: view, setMsg };
}

export const OrderChip: React.FC<{ status: OrderStatus }> = ({ status }) => {
  const s = ORDER_STATUS[status];
  return <Chip tone={s.tone}>{s.label}</Chip>;
};

export const dateTime = (v?: string | null) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export const dateOnly = (v?: string | null) => (v ? new Date(`${v.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—');
export const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
export const splitList = (v: string) => v.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);

export const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 14 };
export const thStyle: React.CSSProperties = { textAlign: 'left', color: 'var(--fx-muted)', fontWeight: 600, padding: '6px 8px', whiteSpace: 'nowrap' };
export const tdStyle: React.CSSProperties = { padding: '10px 8px', borderTop: '1px solid var(--fx-line)', verticalAlign: 'top' };
