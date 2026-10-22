import React, { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { accountDeletion, deletionErrorText, formatDay, type DeletionStatus } from '../../services/accountDeletion';
import { BigButton, Field, Row } from './ui';

/**
 * "Excluir minha conta" no Bipaê (exigência da Play Store; LGPD-03). Bloqueia na
 * hora e apaga os dados pessoais depois de 30 dias; dá para desistir até lá.
 */
const DeleteAccount: React.FC = () => {
  const { logout, role } = useAuth();
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState<DeletionStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { accountDeletion.status().then(setStatus).catch(() => setStatus(null)); }, []);

  const days = status?.graceDays || 30;
  const owner = role === 'MARKET_OWNER';

  const close = () => {
    if (done) { void logout(); return; }
    setOpen(false); setPassword(''); setConfirmed(false); setMessage(null);
  };

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
    <>
      <Row onClick={() => setOpen(true)} icon={<Trash2 className="h-5 w-5" />} tone="stone" title="Excluir minha conta"
        detail={status?.pending ? `Marcada para ${formatDay(status.scheduledFor)}` : 'Apaga o acesso e os dados pessoais'} />

      {/* Dentro de <li>: o Row fica numa lista (Group). */}
      {open && (
        <li className="list-none">
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={close}>
          <div role="dialog" aria-modal="true" aria-label="Excluir minha conta" onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90dvh] w-full max-w-xl flex-col gap-4 overflow-auto rounded-t-3xl bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold">Excluir minha conta</h2>
              <button type="button" onClick={close} aria-label="Fechar" className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100"><X className="h-5 w-5" /></button>
            </div>

            {done ? (
              <>
                <p className="text-lg" role="status">
                  Pedido recebido. O acesso foi bloqueado e os seus dados pessoais serão apagados em {formatDay(done.scheduledFor)}.
                </p>
                <p className="text-base text-[#5F7067]">Mudou de ideia? Até essa data, entre com o seu e-mail e senha e toque em "Desistir da exclusão".</p>
                <BigButton type="button" onClick={() => { void logout(); }}>Entendi, sair</BigButton>
              </>
            ) : status?.pending ? (
              <>
                <p className="text-lg">A sua conta está marcada para exclusão em {formatDay(status.scheduledFor)}.</p>
                <BigButton type="button" disabled={busy} onClick={() => { void giveUp(); }}>Desistir da exclusão</BigButton>
              </>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-4">
                <ul className="flex list-disc flex-col gap-1 rounded-2xl bg-red-50 p-4 pl-8 text-base text-red-900">
                  <li>O seu acesso é bloqueado na hora, no Bipaê e no painel.</li>
                  <li>Depois de {days} dias, o seu nome, e-mail e telefone são apagados. Não dá para recuperar.</li>
                  <li>Até lá, você pode desistir: é só entrar com o seu e-mail e senha.</li>
                  {owner && <li>Se você é o único na equipe, a conta do mercado é encerrada e a assinatura é cancelada, sem novas cobranças.</li>}
                  {owner && <li>Se há outras pessoas na equipe, passe a titularidade para uma delas antes (no painel).</li>}
                  <li>As notas fiscais ficam guardadas, como a lei exige, sem os dados pessoais.</li>
                </ul>
                <Field label="Para confirmar, digite a sua senha" type="password" autoComplete="current-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)} />
                <label className="flex items-start gap-3 text-lg">
                  <input type="checkbox" className="mt-1.5 h-5 w-5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  Entendi e quero excluir a minha conta.
                </label>
                <button type="submit" disabled={busy || !confirmed || !password}
                  className="flex h-14 w-full items-center justify-center rounded-2xl bg-red-700 text-lg font-bold text-white disabled:opacity-50">
                  {busy ? 'Enviando…' : 'Excluir minha conta'}
                </button>
              </form>
            )}
            {message && <p role="alert" className="rounded-2xl bg-stone-100 p-4 text-base">{message}</p>}
          </div>
        </div>
        </li>
      )}
    </>
  );
};

export default DeleteAccount;
