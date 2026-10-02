import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, MessageCircle, RotateCw, ShieldCheck, UserPlus, X } from 'lucide-react';
import Layout from '../components/layout/Layout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

/**
 * Equipe: quem tem acesso à conta, com que papel e em que loja. O dono convida
 * por e-mail (ou manda o link pelo WhatsApp), muda papel e loja, desativa e
 * passa a titularidade.
 */

interface Store { id: string; name: string; is_root: boolean }
interface Member {
  id: string; name: string; email: string; teamRole: string; teamRoleLabel: string; active: boolean;
  lastLoginAt?: string | null; twoFactor: boolean; storeId: string; store: string; me: boolean;
}
interface Invite { id: string; email: string; name?: string; team_role: string; expires_at: string; store: string; expired: boolean }
interface Role { code: string; label: string; description: string }
interface Overview {
  stores: Store[];
  members: Member[];
  invites: Invite[];
  seats: { limit: number; active: number; pending: number; full: boolean };
  roles: Role[];
  transfer: { id: string; to_name: string; to_email: string; expires_at: string }[];
}

const CARD = 'flex flex-col gap-3 rounded-xl p-4';
const CARD_STYLE = { background: 'var(--surface-base)', border: '1px solid var(--border-soft)' };
const INPUT = 'rounded-lg px-3 py-2 text-sm';
const INPUT_STYLE = { background: 'var(--surface-soft)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' };
const when = (s?: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : 'nunca entrou');
const reasonOf = (err: any, fallback: string) => err?.response?.data?.userMessage || fallback;

const Team: React.FC = () => {
  const { marketId } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'GERENTE', storeId: '' });
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [transfer, setTransfer] = useState({ toUserId: '', password: '' });

  const base = `/v1/markets/${marketId}/team`;

  const load = useCallback(async () => {
    if (!marketId) return;
    try {
      const { data: d } = await api.get<Overview>(base);
      setData(d);
      setForm((f) => ({ ...f, storeId: f.storeId || d.stores[0]?.id || '' }));
    } catch (err: any) {
      setError(reasonOf(err, 'Não foi possível carregar a equipe.'));
    }
  }, [marketId, base]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (run: () => Promise<any>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await run();
      await load();
      setNotice(done);
      return r;
    } catch (err: any) {
      setError(reasonOf(err, 'Não foi possível concluir agora.'));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await act(() => api.post(base + '/invites', form), `Convite enviado para ${form.email}.`);
    if (r?.data?.link) {
      setShareLink(r.data.link);
      setForm((f) => ({ ...f, email: '', name: '' }));
    }
  };

  const resend = async (i: Invite) => {
    const r = await act(() => api.post(`${base}/invites/${i.id}/resend`), `Convite reenviado para ${i.email}.`);
    if (r?.data?.link) setShareLink(r.data.link);
  };

  if (!data) {
    return <Layout><p className="text-sm" style={{ color: error ? '#991b1b' : 'var(--text-muted)' }}>{error || 'Carregando equipe...'}</p></Layout>;
  }

  const roleLabel = (code: string) => data.roles.find((r) => r.code === code)?.label || code;
  const multiStore = data.stores.length > 1;
  const unlimited = data.seats.limit < 0;
  const transferable = data.members.filter((m) => !m.me && m.active && m.storeId === data.stores.find((s) => s.is_root)?.id);
  const whatsapp = shareLink ? `https://wa.me/?text=${encodeURIComponent(`Você foi convidado para a equipe no MercadoFlow. Aceite aqui: ${shareLink}`)}` : null;

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Equipe</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Quem acessa a conta, com que papel e em que loja</p>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-primary)' }} data-testid="seats">
            {unlimited ? `${data.seats.active} pessoas` : `${data.seats.active} de ${data.seats.limit} pessoas`}
            {data.seats.pending > 0 && ` · ${data.seats.pending} convite(s) em aberto`}
          </p>
        </div>

        {notice && <p role="status" className="rounded-xl p-3 text-sm" style={{ background: 'var(--surface-soft)', color: 'var(--text-primary)' }}>{notice}</p>}
        {error && <p role="alert" className="rounded-xl p-3 text-sm" style={{ background: '#fef2f2', color: '#991b1b' }}>{error}</p>}

        {/* Convidar */}
        <section className={CARD} style={CARD_STYLE} aria-label="Convidar pessoa">
          <h2 className="flex items-center gap-2 text-base font-bold" style={{ color: 'var(--text-primary)' }}><UserPlus size={16} /> Convidar</h2>
          {data.seats.full ? (
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
              A equipe está completa no seu plano. <Link to="/app/assinatura" className="font-semibold text-green-700 hover:underline">Comprar usuário extra</Link> ou desative alguém.
            </p>
          ) : (
            <form onSubmit={invite} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                E-mail
                <input className={INPUT} style={INPUT_STYLE} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                Nome (opcional)
                <input className={INPUT} style={INPUT_STYLE} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                Papel
                <select className={INPUT} style={INPUT_STYLE} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {data.roles.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                </select>
              </label>
              {multiStore && (
                <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Loja
                  <select className={INPUT} style={INPUT_STYLE} value={form.storeId} onChange={(e) => setForm({ ...form, storeId: e.target.value })}>
                    {data.stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_root ? ' (rede toda)' : ''}</option>)}
                  </select>
                </label>
              )}
              <p className="text-xs sm:col-span-2 lg:col-span-4" style={{ color: 'var(--text-muted)' }}>
                {data.roles.find((r) => r.code === form.role)?.description}.
                {multiStore && ' Quem fica na matriz vê a rede toda; quem fica numa filial vê só a filial.'}
              </p>
              <div className="sm:col-span-2 lg:col-span-4">
                <button type="submit" disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  style={{ background: 'var(--brand-500, #22c55e)', color: '#fff' }}>
                  {busy ? 'Enviando...' : 'Enviar convite'}
                </button>
              </div>
            </form>
          )}
          {shareLink && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg p-3" style={{ background: 'var(--surface-soft)' }} data-testid="share-link">
              <span className="min-w-0 flex-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                O link também pode ir pelo WhatsApp. Vale por 7 dias e só uma vez.
              </span>
              <button type="button" onClick={() => navigator.clipboard?.writeText(shareLink)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}>
                <Copy size={13} /> Copiar link
              </button>
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
                  style={{ background: '#16a34a', color: '#fff' }}>
                  <MessageCircle size={13} /> Enviar pelo WhatsApp
                </a>
              )}
              <button type="button" aria-label="Fechar" onClick={() => setShareLink(null)} className="p-1" style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
            </div>
          )}
        </section>

        {/* Convites em aberto */}
        {data.invites.length > 0 && (
          <section className={CARD} style={CARD_STYLE} aria-label="Convites em aberto">
            <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Convites em aberto</h2>
            <ul className="flex flex-col gap-2">
              {data.invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-lg p-3 text-sm" style={{ background: 'var(--surface-soft)', color: 'var(--text-primary)' }}>
                  <span className="min-w-0 flex-1">
                    <strong>{i.email}</strong> · {roleLabel(i.team_role)}{multiStore ? ` · ${i.store}` : ''}
                    <span className="block text-xs" style={{ color: i.expired ? '#b91c1c' : 'var(--text-muted)' }}>
                      {i.expired ? 'Venceu' : `Vale até ${new Date(i.expires_at).toLocaleDateString('pt-BR')}`}
                    </span>
                  </span>
                  <button type="button" disabled={busy} onClick={() => resend(i)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
                    style={{ border: '1px solid var(--border-soft)' }}>
                    <RotateCw size={12} /> Reenviar
                  </button>
                  <button type="button" disabled={busy} onClick={() => act(() => api.delete(`${base}/invites/${i.id}`), 'Convite cancelado.')}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ color: '#b91c1c' }}>
                    Cancelar
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Pessoas */}
        <section className={CARD} style={CARD_STYLE} aria-label="Pessoas da equipe">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Pessoas</h2>
          <ul className="flex flex-col gap-2">
            {data.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg p-3 text-sm" data-testid={`member-${m.email}`}
                style={{ background: 'var(--surface-soft)', color: 'var(--text-primary)', opacity: m.active ? 1 : 0.6 }}>
                <span className="min-w-0 flex-1">
                  <strong>{m.name}</strong>{m.me && ' (você)'}
                  {m.twoFactor && <ShieldCheck size={13} className="ml-1 inline text-green-700" aria-label="Verificação em duas etapas ligada" />}
                  <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                    {m.email} · último acesso: {when(m.lastLoginAt)}{!m.active && ' · desativado'}
                  </span>
                </span>
                {m.teamRole === 'DONO' ? (
                  <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: '#dcfce7', color: '#166534' }}>Dono</span>
                ) : (
                  <>
                    <select aria-label={`Papel de ${m.name}`} className={INPUT} style={INPUT_STYLE} value={m.teamRole} disabled={busy}
                      onChange={(e) => act(() => api.put(`${base}/members/${m.id}`, { role: e.target.value }), `Papel de ${m.name} alterado.`)}>
                      {data.roles.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                    </select>
                    {multiStore && (
                      <select aria-label={`Loja de ${m.name}`} className={INPUT} style={INPUT_STYLE} value={m.storeId} disabled={busy}
                        onChange={(e) => act(() => api.put(`${base}/members/${m.id}`, { storeId: e.target.value }), `Loja de ${m.name} alterada.`)}>
                        {data.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    )}
                    <button type="button" disabled={busy}
                      onClick={() => act(() => api.post(`${base}/members/${m.id}/active`, { active: !m.active }), m.active ? `${m.name} desativado.` : `${m.name} reativado.`)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ border: '1px solid var(--border-soft)' }}>
                      {m.active ? 'Desativar' : 'Reativar'}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Titularidade */}
        <section className={CARD} style={CARD_STYLE} aria-label="Transferir titularidade">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Transferir a titularidade</h2>
          {data.transfer.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
              <span className="min-w-0 flex-1">
                Esperando {data.transfer[0].to_name} ({data.transfer[0].to_email}) aceitar. Vale até {new Date(data.transfer[0].expires_at).toLocaleDateString('pt-BR')}.
              </span>
              <button type="button" disabled={busy} onClick={() => act(() => api.delete(base + '/transfer'), 'Pedido de transferência cancelado.')}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ color: '#b91c1c' }}>
                Cancelar pedido
              </button>
            </div>
          ) : transferable.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Para passar a conta a outra pessoa, convide-a para a matriz primeiro. Ela precisa aceitar do lado dela.
            </p>
          ) : (
            <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => {
              e.preventDefault();
              void act(() => api.post(base + '/transfer', transfer), 'Pedido enviado. A titularidade muda quando a pessoa aceitar.')
                .then(() => setTransfer({ toUserId: '', password: '' }));
            }}>
              <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                Novo dono
                <select className={INPUT} style={INPUT_STYLE} required value={transfer.toUserId} onChange={(e) => setTransfer({ ...transfer, toUserId: e.target.value })}>
                  <option value="">Escolha</option>
                  {transferable.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                Sua senha, para confirmar
                <input className={INPUT} style={INPUT_STYLE} type="password" required autoComplete="current-password" value={transfer.password}
                  onChange={(e) => setTransfer({ ...transfer, password: e.target.value })} />
              </label>
              <div className="flex items-end">
                <button type="submit" disabled={busy} className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}>
                  Pedir transferência
                </button>
              </div>
              <p className="text-xs sm:col-span-3" style={{ color: 'var(--text-muted)' }}>
                Quando a pessoa aceitar, ela vira a dona da conta (assinatura e equipe) e você continua como gerente.
              </p>
            </form>
          )}
        </section>
      </div>
    </Layout>
  );
};

export default Team;
