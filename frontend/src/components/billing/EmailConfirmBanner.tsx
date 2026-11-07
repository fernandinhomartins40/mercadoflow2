import React, { useState } from 'react';
import { MailCheck, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

const DISMISS_KEY = 'mf.emailConfirm.dismissed';

const readDismissed = () => {
  try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
};

/** Lembrete de confirmar o e-mail. Não bloqueia nada; fechado, só volta na próxima sessão. */
const EmailConfirmBanner: React.FC = () => {
  const { email, emailConfirmed } = useAuth();
  const [hidden, setHidden] = useState(readDismissed);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (emailConfirmed !== false || hidden) return null;

  const resend = async () => {
    setBusy(true);
    try {
      const r = await api.post('/v1/auth/resend-confirmation');
      setMessage(r.data?.message ?? 'Enviamos o link para o seu e-mail.');
    } catch (err) {
      setMessage((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Não foi possível enviar agora. Tente de novo em alguns minutos.');
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* sem armazenamento: fecha só nesta tela */ }
    setHidden(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl px-4 py-3 text-sm" role="status"
      style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}>
      <MailCheck className="h-4 w-4 shrink-0" style={{ color: 'var(--brand-700)' }} aria-hidden="true" />
      <span className="min-w-0 flex-1 basis-56">{message ?? <>Confirme o seu e-mail ({email}) para garantir que os avisos e a recuperação de senha cheguem até você.</>}</span>
      {!message && (
        <button type="button" onClick={resend} disabled={busy} className="min-h-[40px] rounded-lg px-3 font-semibold underline disabled:opacity-50" style={{ color: 'var(--brand-700)' }}>
          {busy ? 'Enviando…' : 'Enviar o link'}
        </button>
      )}
      <button type="button" onClick={close} aria-label="Fechar o lembrete" className="inline-flex h-10 w-10 items-center justify-center rounded-lg" style={{ color: 'var(--text-muted)' }}>
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};

export default EmailConfirmBanner;
