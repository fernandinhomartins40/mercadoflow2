import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { accountDeletion, deletionErrorText, formatDay, type DeletionStatus } from '../../services/accountDeletion';

/**
 * "Excluir minha conta" (LGPD-03). O acesso é bloqueado na hora; os dados
 * pessoais são apagados depois de 30 dias, e dá para desistir até lá.
 */

const BTN = 'rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60';
const INPUT_STYLE = { background: 'var(--surface-soft)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' };

const DeleteAccountCard: React.FC = () => {
  const { logout, role } = useAuth();
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState<DeletionStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { accountDeletion.status().then(setStatus).catch(() => setStatus(null)); }, []);

  if (!status) return null;
  const days = status.graceDays || 30;
  const owner = role === 'MARKET_OWNER';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      setDone(await accountDeletion.request(password));
      setPassword('');
    } catch (err) {
      setMessage(deletionErrorText(err, 'Não foi possível concluir agora. Tente de novo.'));
    } finally {
      setBusy(false);
    }
  };

  const giveUp = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await accountDeletion.cancel();
      setStatus(r);
      setMessage(r.userMessage || 'Pronto, a sua conta continua.');
    } catch (err) {
      setMessage(deletionErrorText(err, 'Não foi possível desistir agora. Tente de novo.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }} data-testid="delete-account-card">
      <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-soft)' }}>
        <Trash2 className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Excluir minha conta</p>
      </div>
      <div className="flex flex-col gap-3 p-5">
        {done ? (
          <div className="flex flex-col gap-3" role="status">
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
              Pedido recebido. O acesso foi bloqueado e os seus dados pessoais serão apagados em {formatDay(done.scheduledFor)}.
            </p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Mudou de ideia? Até essa data, entre com o seu e-mail e senha e toque em "Desistir da exclusão".
            </p>
            <button type="button" className={BTN} style={{ background: 'var(--text-primary)', color: 'var(--surface-base)', alignSelf: 'flex-start' }}
              onClick={() => { void logout(); }}>
              Entendi, sair
            </button>
          </div>
        ) : status.pending ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
              A sua conta está marcada para exclusão em {formatDay(status.scheduledFor)}.
            </p>
            <button type="button" disabled={busy} className={BTN} style={{ background: 'var(--brand-500, #22c55e)', color: '#fff', alignSelf: 'flex-start' }}
              onClick={() => { void giveUp(); }}>
              Desistir da exclusão
            </button>
          </div>
        ) : !open ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Apaga o seu acesso e os seus dados pessoais. {owner ? 'Se você é o único na equipe, a conta da loja também é encerrada.' : ''}
            </p>
            <button type="button" className={BTN} style={{ color: '#b91c1c', border: '1px solid #fecaca', alignSelf: 'flex-start' }}
              onClick={() => setOpen(true)}>
              Excluir minha conta
            </button>
          </div>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={submit}>
            <div className="rounded-lg p-3 text-sm" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#7f1d1d' }}>
              <p className="font-semibold">Antes de continuar, saiba o que acontece:</p>
              <ul className="mt-1 list-disc pl-5">
                <li>O seu acesso é bloqueado na hora, no painel e no Bipaê.</li>
                <li>Depois de {days} dias, o seu nome, e-mail e telefone são apagados. Não dá para recuperar.</li>
                <li>Até lá, você pode desistir: é só entrar com o seu e-mail e senha.</li>
                {owner && <li>Se você é o único na equipe, a conta da loja é encerrada e a assinatura é cancelada, sem novas cobranças (o que já foi pago não é devolvido).</li>}
                {owner && <li>Se há outras pessoas na equipe, passe a titularidade para uma delas antes.</li>}
                <li>As notas fiscais ficam guardadas, como a lei exige, sem os dados pessoais.</li>
              </ul>
            </div>
            <label className="flex flex-col gap-1 text-sm" style={{ color: 'var(--text-primary)' }}>
              Para confirmar, digite a sua senha
              <input className="rounded-lg px-3 py-2 text-sm" style={INPUT_STYLE} type="password" autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
              Entendi e quero excluir a minha conta.
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy || !confirmed || !password} className={BTN} style={{ background: '#b91c1c', color: '#fff' }}>
                {busy ? 'Enviando…' : 'Excluir minha conta'}
              </button>
              <button type="button" className={BTN} style={{ color: 'var(--text-primary)' }}
                onClick={() => { setOpen(false); setPassword(''); setConfirmed(false); setMessage(null); }}>
                Cancelar
              </button>
            </div>
          </form>
        )}
        {message && <p role="status" className="text-sm" style={{ color: 'var(--text-muted)' }}>{message}</p>}
      </div>
    </div>
  );
};

export default DeleteAccountCard;
