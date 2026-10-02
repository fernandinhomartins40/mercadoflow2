import React, { useEffect, useState } from 'react';
import api from '../../services/api';

/**
 * Modelos dos avisos automáticos: o texto (com variáveis) e por onde cada um
 * sai — no app, por e-mail e pelo WhatsApp (para quem aceitou, fora do
 * horário de silêncio).
 */

interface Template {
  kind: string; label: string; title: string; body: string; defaultTitle: string; defaultBody: string;
  sendApp: boolean; sendEmail: boolean; sendWhatsapp: boolean; updatedAt?: string; updatedBy?: string;
}

const BOX = { background: 'var(--surface-base)', border: '1px solid var(--border-soft)' };
const INPUT_STYLE = { background: 'var(--surface-soft)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' };

const NoticeTemplatesPanel: React.FC = () => {
  const [list, setList] = useState<Template[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Template | null>(null);
  const [preview, setPreview] = useState<{ title: string; body: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.get<Template[]>('/v1/super-admin/billing/templates').then(({ data }) => setList(data))
      .catch(() => setMessage('Não foi possível carregar os modelos.'));
  }, []);

  const edit = (t: Template) => {
    setOpen(t.kind);
    setDraft(t);
    setPreview(null);
    setMessage(null);
  };

  const save = async (body: Record<string, unknown>, done: string) => {
    if (!draft) return;
    try {
      const { data } = await api.put<Template[]>(`/v1/super-admin/billing/templates/${draft.kind}`, body);
      setList(data);
      const fresh = data.find((x) => x.kind === draft.kind) || null;
      setDraft(fresh);
      const { data: p } = await api.get(`/v1/super-admin/billing/templates/${draft.kind}/preview`);
      setPreview(p);
      setMessage(done);
    } catch (err: any) {
      setMessage(err?.response?.data?.userMessage || 'Não foi possível salvar.');
    }
  };

  const channels = (t: Template) => [t.sendApp && 'app', t.sendEmail && 'e-mail', t.sendWhatsapp && 'WhatsApp'].filter(Boolean).join(' · ') || 'desligado';

  return (
    <section className="flex flex-col gap-3 rounded-xl p-4" style={BOX} data-testid="notice-templates">
      <div>
        <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Avisos automáticos</h2>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Variáveis: {'{nome}'}, {'{loja}'}, {'{plano}'}, {'{data}'}, {'{dias}'}, {'{valor}'}. O WhatsApp só sai para quem aceitou receber e fora do horário de silêncio.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {list.map((t) => (
          <li key={t.kind} className="rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
            <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => (open === t.kind ? setOpen(null) : edit(t))}
              aria-expanded={open === t.kind}>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.label}</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{channels(t)}</span>
            </button>
            {open === t.kind && draft && (
              <div className="mt-3 flex flex-col gap-2">
                <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Título
                  <input className="rounded-md px-2 py-1.5 text-sm" style={INPUT_STYLE} value={draft.title} maxLength={160}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Texto
                  <textarea className="rounded-md px-2 py-1.5 text-sm" style={INPUT_STYLE} rows={3} value={draft.body} maxLength={600}
                    onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                </label>
                <div className="flex flex-wrap gap-4 text-sm" style={{ color: 'var(--text-primary)' }}>
                  {([['sendApp', 'No app'], ['sendEmail', 'E-mail'], ['sendWhatsapp', 'WhatsApp']] as const).map(([k, l]) => (
                    <label key={k} className="flex items-center gap-1">
                      <input type="checkbox" checked={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.checked })} /> {l}
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="rounded-md px-3 py-1.5 text-xs font-semibold" style={{ background: 'var(--brand-500, #22c55e)', color: '#fff' }}
                    onClick={() => save({ title: draft.title, body: draft.body, sendApp: draft.sendApp, sendEmail: draft.sendEmail, sendWhatsapp: draft.sendWhatsapp }, 'Modelo salvo.')}>
                    Salvar modelo
                  </button>
                  <button type="button" className="rounded-md px-3 py-1.5 text-xs font-semibold" style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
                    onClick={() => save({ reset: true }, 'Texto padrão restaurado.')}>
                    Restaurar texto padrão
                  </button>
                </div>
                {preview && (
                  <div className="rounded-md p-2 text-xs" style={{ background: 'var(--surface-base)', color: 'var(--text-primary)' }} data-testid="template-preview">
                    <p className="font-semibold">{preview.title}</p>
                    <p>{preview.body}</p>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {message && <p role="status" className="text-xs" style={{ color: 'var(--text-muted)' }}>{message}</p>}
    </section>
  );
};

export default NoticeTemplatesPanel;
