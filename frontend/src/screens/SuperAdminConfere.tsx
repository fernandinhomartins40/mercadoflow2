import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import Button from '../components/common/Button';
import { confereAdminService, money, type ConfereIcons } from '../services/confere.service';
import IconCropper from '../features/confere/IconCropper';
import type { AdminAccount, AdminOrder, ConferePlan, ConfereSettings, ConfereStats, IntelligencePreview } from '../types/confere.types';

/**
 * MercadoFlow Confere no superadmin: chave do Meu Danfe (revenda de leituras),
 * preço avulso, planos, leituras grátis, termos, chave Pix, confirmação dos
 * pagamentos e saldo de cada mercado.
 */

const CARD = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const INPUT = 'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20';
const LABEL = 'text-sm font-medium text-slate-700';

const errorText = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

const parseReais = (s: string) => {
  const n = Number(s.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const reais = (cents: number) => (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

const SettingsCard: React.FC<{ settings: ConfereSettings; onSaved: (s: ConfereSettings) => void }> = ({ settings, onSaved }) => {
  const [apiKey, setApiKey] = useState('');
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState({
    enabled: settings.enabled,
    price: reais(settings.pricePerReadCents),
    trial: String(settings.trialReads),
    pixKey: settings.pixKey ?? '',
    pixName: settings.pixMerchantName ?? '',
    pixCity: settings.pixMerchantCity ?? '',
    stripe: settings.stripeEnabled,
    terms: settings.termsText,
  });
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('save');
    setMsg(null);
    try {
      const next = await confereAdminService.save({
        enabled: draft.enabled,
        pricePerReadCents: parseReais(draft.price),
        trialReads: Number(draft.trial) || 0,
        pixKey: draft.pixKey.trim() || null,
        pixMerchantName: draft.pixName.trim() || null,
        pixMerchantCity: draft.pixCity.trim() || null,
        stripeEnabled: draft.stripe,
        termsText: draft.terms,
        ...(apiKey.trim() ? { meuDanfeApiKey: apiKey.trim() } : {}),
      });
      onSaved(next);
      setApiKey('');
      setMsg({ ok: true, text: 'Configuração salva.' });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, 'Não foi possível salvar.') });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    setMsg(null);
    try {
      const r = await confereAdminService.test();
      setMsg({ ok: r.ok, text: r.message });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, 'O teste falhou.') });
    } finally {
      setBusy(null);
    }
  };

  const set = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft({ ...draft, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });

  return (
    <form onSubmit={save} className={`${CARD} flex flex-col gap-5`} aria-labelledby="cfg-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-700"><KeyRound className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h2 id="cfg-title" className="text-base font-semibold text-slate-900">Serviço de leitura de notas</h2>
            <p className="text-sm text-slate-600">
              {settings.meuDanfeConfigured
                ? <>Api-Key do Meu Danfe cadastrada, terminando em <strong className="font-mono">{settings.meuDanfeKeyHint}</strong>.</>
                : 'Sem Api-Key do Meu Danfe: só lê quem tem certificado A1 ou importa o XML.'}
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={draft.enabled} onChange={set('enabled')} className="h-4 w-4 accent-green-600" />
          Confere ativo
        </label>
      </div>
      {!settings.encryptionReady && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">O servidor está sem AI_ENCRYPTION_KEY: a Api-Key e os certificados não podem ser guardados.</p>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Api-Key do Meu Danfe</span>
          <div className="relative">
            <input className={`${INPUT} pr-10 font-mono`} type={show ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings.meuDanfeConfigured ? 'Deixe em branco para manter a atual' : 'Cole a Api-Key gerada em API / Integração'} autoComplete="off" spellCheck={false} />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-800" aria-label={show ? 'Esconder' : 'Mostrar'}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>
        {settings.meuDanfeConfigured && (
          <Button type="button" variant="secondary" onClick={test} disabled={!!busy}>{busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Testar a chave'}</Button>
        )}
      </div>
      <p className="-mt-3 text-xs text-slate-500">A chave é validada no Meu Danfe sem gastar crédito, guardada cifrada e nunca volta para a tela.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Preço de uma leitura avulsa (R$)</span>
          <input className={INPUT} inputMode="decimal" value={draft.price} onChange={set('price')} />
          <span className="text-xs text-slate-500">Você paga R$ 0,03 ao Meu Danfe por nota buscada.</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Leituras grátis para testar</span>
          <input className={INPUT} inputMode="numeric" value={draft.trial} onChange={set('trial')} />
          <span className="text-xs text-slate-500">Dadas uma vez, no aceite dos termos.</span>
        </label>
      </div>

      <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold text-slate-800">Pix (recebe as compras de créditos)</legend>
        <label className="flex flex-col gap-1.5 sm:col-span-3">
          <span className={LABEL}>Chave Pix</span>
          <input className={INPUT} value={draft.pixKey} onChange={set('pixKey')} placeholder="CNPJ, e-mail, telefone ou chave aleatória" />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={LABEL}>Nome do recebedor (até 25 letras)</span>
          <input className={INPUT} maxLength={25} value={draft.pixName} onChange={set('pixName')} placeholder="MERCADOFLOW" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Cidade (até 15)</span>
          <input className={INPUT} maxLength={15} value={draft.pixCity} onChange={set('pixCity')} placeholder="SAO PAULO" />
        </label>
        <p className="text-xs text-slate-500 sm:col-span-3">
          O mercado recebe o QR code com o valor e um identificador. Ao ver o pagamento no extrato, confirme o pedido na lista abaixo e as leituras entram na hora.
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-3">
          <input type="checkbox" checked={draft.stripe} onChange={set('stripe')} className="h-4 w-4 accent-green-600" />
          Oferecer também pagamento pelo Stripe (confirmação automática; Pix no Stripe quando liberado na conta)
        </label>
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Termos que o mercado aceita</span>
        <textarea className={`${INPUT} h-40 py-2`} value={draft.terms} onChange={set('terms')} />
        <span className="text-xs text-slate-500">Mudar o texto cria uma versão nova: todo mercado precisa aceitar de novo. Versão atual {settings.termsVersion}.</span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!!busy}><Save className="mr-1.5 h-4 w-4" />{busy === 'save' ? 'Salvando…' : 'Salvar'}</Button>
        {msg && <span role="status" className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</span>}
      </div>
    </form>
  );
};

const PlansCard: React.FC = () => {
  const [plans, setPlans] = useState<ConferePlan[]>([]);
  const [draft, setDraft] = useState({ name: '', reads: '', price: '' });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { confereAdminService.plans().then(setPlans).catch(() => {}); }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setPlans(await confereAdminService.createPlan({ name: draft.name, reads: Number(draft.reads), priceCents: parseReais(draft.price), active: true }));
      setDraft({ name: '', reads: '', price: '' });
    } catch (err) {
      setError(errorText(err, 'Não foi possível criar o plano.'));
    }
  };

  return (
    <section className={`${CARD} flex flex-col gap-4`} aria-labelledby="plans-title">
      <h2 id="plans-title" className="text-base font-semibold text-slate-900">Planos de créditos</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="text-slate-500"><tr><th className="py-2">Plano</th><th>Leituras</th><th>Preço</th><th>Por leitura</th><th>Ativo</th><th /></tr></thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="py-2 font-medium text-slate-900">{p.name}</td>
                <td className="tabular-nums">{p.reads}</td>
                <td className="tabular-nums">{money(p.priceCents)}</td>
                <td className="tabular-nums text-slate-600">{money(Math.round(p.priceCents / p.reads))}</td>
                <td>
                  <input type="checkbox" checked={p.active} aria-label={`Ativar ${p.name}`} className="h-4 w-4 accent-green-600"
                    onChange={async (e) => setPlans(await confereAdminService.updatePlan(p.id, { ...p, active: e.target.checked }))} />
                </td>
                <td className="text-right">
                  <button type="button" aria-label={`Excluir ${p.name}`} className="rounded p-1 text-slate-500 hover:text-red-700"
                    onClick={async () => { if (window.confirm(`Excluir o plano ${p.name}?`)) setPlans(await confereAdminService.deletePlan(p.id)); }}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_120px_140px_auto] sm:items-end">
        <label className="flex flex-col gap-1.5"><span className={LABEL}>Nome</span><input className={INPUT} required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Pacote 200 notas" /></label>
        <label className="flex flex-col gap-1.5"><span className={LABEL}>Leituras</span><input className={INPUT} required inputMode="numeric" value={draft.reads} onChange={(e) => setDraft({ ...draft, reads: e.target.value })} /></label>
        <label className="flex flex-col gap-1.5"><span className={LABEL}>Preço (R$)</span><input className={INPUT} required inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></label>
        <Button type="submit"><Plus className="mr-1 h-4 w-4" />Criar</Button>
      </form>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
  );
};

const OrdersCard: React.FC<{ onChange: () => void }> = ({ onChange }) => {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [filter, setFilter] = useState('PENDING');
  const load = useCallback(() => { confereAdminService.orders(filter || undefined).then(setOrders).catch(() => setOrders([])); }, [filter]);
  useEffect(() => { load(); }, [load]);

  const act = async (o: AdminOrder, action: 'confirm' | 'cancel') => {
    const text = action === 'confirm'
      ? `Confirmar o pagamento de ${money(o.amountCents)} de ${o.marketName} (identificador ${o.txid})? ${o.reads} leituras entram na hora.`
      : `Cancelar o pedido de ${o.marketName}?`;
    if (!window.confirm(text)) return;
    await (action === 'confirm' ? confereAdminService.confirm(o.id) : confereAdminService.cancel(o.id));
    load();
    onChange();
  };

  return (
    <section className={`${CARD} flex flex-col gap-4`} aria-labelledby="orders-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="orders-title" className="text-base font-semibold text-slate-900">Pedidos de créditos</h2>
        <select className={`${INPUT} w-auto`} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar pedidos">
          <option value="PENDING">Aguardando pagamento</option>
          <option value="PAID">Pagos</option>
          <option value="CANCELED">Cancelados</option>
          <option value="">Todos</option>
        </select>
      </div>
      {orders === null ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : orders.length === 0 ? (
        <p className="text-sm text-slate-600">Nenhum pedido aqui.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-slate-500"><tr><th className="py-2">Mercado</th><th>Plano</th><th>Valor</th><th>Identificador Pix</th><th>Pedido em</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="py-2 font-medium text-slate-900">{o.marketName}</td>
                  <td>{o.planName ?? `${o.reads} leituras`}</td>
                  <td className="tabular-nums">{money(o.amountCents)}</td>
                  <td className="font-mono text-xs">{o.txid}</td>
                  <td className="text-slate-600">{new Date(o.createdAt).toLocaleString('pt-BR')}</td>
                  <td>{o.status === 'PAID' ? <span className="text-green-700">Pago{o.confirmedBy ? ` (${o.confirmedBy})` : ''}</span> : o.status === 'CANCELED' ? 'Cancelado' : 'Aguardando'}</td>
                  <td className="whitespace-nowrap text-right">
                    {o.status === 'PENDING' && (
                      <>
                        <button type="button" onClick={() => act(o, 'confirm')} className="mr-2 inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />Confirmar pagamento
                        </button>
                        <button type="button" onClick={() => act(o, 'cancel')} className="rounded p-1 text-slate-500 hover:text-red-700" aria-label="Cancelar pedido"><X className="h-4 w-4" /></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

const AccountsCard: React.FC<{ version: number }> = ({ version }) => {
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const load = useCallback(() => { confereAdminService.accounts().then(setAccounts).catch(() => setAccounts([])); }, []);
  useEffect(() => { load(); }, [load, version]);

  const adjust = async (a: AdminAccount) => {
    const value = window.prompt(`Quantas leituras dar a ${a.marketName}? (use negativo para tirar)`, '10');
    if (!value) return;
    const delta = Number(value);
    if (!Number.isInteger(delta) || delta === 0) return;
    await confereAdminService.adjust(a.marketId, delta, 'Ajuste pelo superadmin');
    load();
  };

  return (
    <section className={`${CARD} flex flex-col gap-4`} aria-labelledby="acc-title">
      <h2 id="acc-title" className="text-base font-semibold text-slate-900">Mercados no Confere</h2>
      {accounts === null ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : accounts.length === 0 ? (
        <p className="text-sm text-slate-600">Nenhum mercado aceitou os termos ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-slate-500"><tr><th className="py-2">Mercado</th><th>Saldo</th><th>Certificado</th><th>Leituras pagas (30 dias)</th><th>Notas guardadas</th><th>Termos aceitos</th><th /></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.marketId} className="border-t border-slate-100">
                  <td className="py-2 font-medium text-slate-900">{a.marketName}</td>
                  <td className="tabular-nums">{a.balance}</td>
                  <td>{a.hasCertificate ? <span className="text-green-700">Sim</span> : 'Não'}</td>
                  <td className="tabular-nums">{a.reads30d}</td>
                  <td className="tabular-nums">{a.documents}</td>
                  <td className="text-slate-600">{a.termsAcceptedAt ? new Date(a.termsAcceptedAt).toLocaleDateString('pt-BR') : '—'}</td>
                  <td className="text-right"><button type="button" onClick={() => adjust(a)} className="text-sm font-semibold text-green-700 hover:underline">Ajustar saldo</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

const IconCard: React.FC = () => {
  const [icons, setIcons] = useState<ConfereIcons | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { confereAdminService.icons().then(setIcons).catch(() => {}); }, []);
  return (
    <section className={`${CARD} flex flex-col gap-4`} aria-labelledby="icon-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {icons && <img src={icons.icon192} alt="Ícone atual do app" className="h-12 w-12 rounded-xl shadow" />}
          <div>
            <h2 id="icon-title" className="text-base font-semibold text-slate-900">Ícone do app</h2>
            <p className="text-sm text-slate-600">{icons?.custom ? 'Ícone próprio.' : 'Ícone padrão do Confere.'} Envie uma imagem e recorte em quadrado: os tamanhos do Android e do iPhone são gerados sozinhos.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <label className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Enviar imagem
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setMsg(null); e.target.value = ''; }} />
          </label>
          {icons?.custom && (
            <Button type="button" variant="ghost" onClick={async () => {
              if (!window.confirm('Voltar ao ícone padrão do Confere?')) return;
              setIcons(await confereAdminService.resetIcons());
              setMsg({ ok: true, text: 'Ícone padrão de volta.' });
            }}>Usar o padrão</Button>
          )}
        </div>
      </div>
      {file && (
        <IconCropper file={file} busy={busy} onGenerate={async (generated) => {
          setBusy(true);
          setMsg(null);
          try {
            setIcons(await confereAdminService.saveIcons(generated));
            setFile(null);
            setMsg({ ok: true, text: 'Ícone salvo. Celulares que já instalaram o app atualizam o ícone em alguns dias (é o sistema que decide).' });
          } catch (err) {
            setMsg({ ok: false, text: errorText(err, 'Não foi possível salvar o ícone.') });
          } finally {
            setBusy(false);
          }
        }} />
      )}
      {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
    </section>
  );
};

const DiagnoseCard: React.FC = () => {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof confereAdminService.diagnose>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try { setResult(await confereAdminService.diagnose(key)); } catch (err) { setError(errorText(err, 'O diagnóstico falhou.')); } finally { setBusy(false); }
  };
  const ok = result?.outcome === 'OK';
  return (
    <section className={`${CARD} flex flex-col gap-4`} aria-labelledby="diag-title">
      <div>
        <h2 id="diag-title" className="text-base font-semibold text-slate-900">Diagnóstico da consulta</h2>
        <p className="text-sm text-slate-600">Consulta uma chave no Meu Danfe e mostra cada chamada e resposta. Nota nova custa R$ 0,03 na sua conta do Meu Danfe; o saldo dos mercados não muda.</p>
      </div>
      <form onSubmit={run} className="flex flex-col gap-3 sm:flex-row">
        <input className={`${INPUT} font-mono`} value={key} onChange={(e) => setKey(e.target.value)} placeholder="Chave de acesso (44 números)" aria-label="Chave de acesso para diagnóstico" />
        <Button type="submit" disabled={busy || key.replace(/\D/g, '').length !== 44}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Consultar'}</Button>
      </form>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {result && (
        <div className="flex flex-col gap-2 text-sm">
          <p className={ok ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>
            {ok ? `Nota encontrada: ${result.emitter ?? 'fornecedor'}, ${result.items} itens` : `${result.outcome}: ${result.message ?? ''}`}
          </p>
          <p className="text-slate-600">Modelo da chave: {result.model ?? '—'} {result.model && result.model !== '55' ? '(não é NF-e de fornecedor)' : ''}</p>
          <ol className="flex flex-col gap-1 rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-800">
            {result.trace.length ? result.trace.map((t, i) => <li key={i} className="break-all">{t}</li>) : <li>Nenhuma chamada feita.</li>}
          </ol>
        </div>
      )}
    </section>
  );
};

const num = (v: number | null | undefined, d = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d }));
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Prévia da inteligência de produto para fabricantes: só lê o agregado
 * anônimo (sem mercado e sem fornecedor) e mostra o quanto da base já tem
 * localização e GTIN. O produto para fabricantes será construído em cima disto.
 */
const IntelligenceCard: React.FC = () => {
  const [data, setData] = useState<IntelligencePreview | null>(null);
  const [uf, setUf] = useState('');
  const [gtin, setGtin] = useState('');
  const [min, setMin] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback((u: string, g: string) => {
    confereAdminService.intelligence(u, g).then((d) => { setData(d); setMin(String(d.coverage.minStores)); })
      .catch((e) => setMsg(errorText(e, 'Não foi possível carregar.')));
  }, []);
  useEffect(() => { load('', ''); }, [load]);
  const rebuild = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await confereAdminService.rebuildIntelligence();
      setMsg(`Agregado recalculado desde ${new Date(`${r.from}T00:00`).toLocaleDateString('pt-BR')}: ${r.cells} células com ${r.minStores} lojas ou mais.`);
      load(uf, gtin);
    } catch (e) { setMsg(errorText(e, 'O recálculo falhou.')); } finally { setBusy(false); }
  };
  const saveMin = async () => {
    setMsg(null);
    try { setData(await confereAdminService.setMinStores(Number(min))); setMsg('Mínimo salvo. Vale a partir do próximo recálculo.'); }
    catch (e) { setMsg(errorText(e, 'Não foi possível salvar.')); }
  };
  const c = data?.coverage;
  const tiles: Array<[string, string]> = c ? [
    ['Mercados no Confere', num(c.markets)],
    ['Com localização', num(c.marketsWithLocation)],
    ['Notas completas', num(c.documents)],
    ['Itens guardados', num(c.items)],
    ['Itens com GTIN', num(c.itemsWithGtin)],
    ['Entradas de estoque', num(c.stockEntries)],
    ['Células no agregado', num(c.cells)],
    ['Autorizaram fabricantes', num(c.optedIn)],
  ] : [];
  return (
    <section className={`${CARD} flex flex-col gap-4`} aria-labelledby="intel-title">
      <div>
        <h2 id="intel-title" className="text-base font-semibold text-slate-900">Inteligência de produto (prévia)</h2>
        <p className="text-sm text-slate-600">
          Entrada de mercadoria por produto, semana e local, somada entre mercados. Uma célula (bairro, cidade ou UF) só entra com o
          mínimo de lojas abaixo e se nenhuma loja tiver mais de 70% do volume. Nada aqui identifica mercado ou fornecedor.
        </p>
      </div>
      {c && (
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {tiles.map(([label, value]) => (
            <li key={label} className="rounded-lg bg-slate-50 p-2">
              <span className="block text-xs text-slate-500">{label}</span>
              <span className="block text-base font-bold tabular-nums text-slate-900">{value}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-48 flex-col gap-1"><span className={LABEL}>Mínimo de lojas por célula</span>
          <input className={INPUT} inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} />
        </label>
        <Button variant="secondary" onClick={saveMin}>Salvar mínimo</Button>
        <Button onClick={rebuild} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Recalcular agora'}</Button>
      </div>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); load(uf, gtin); }}>
        <label className="flex w-24 flex-col gap-1"><span className={LABEL}>UF</span>
          <input className={INPUT} maxLength={2} value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} />
        </label>
        <label className="flex w-56 flex-col gap-1"><span className={LABEL}>GTIN</span>
          <input className={`${INPUT} font-mono`} value={gtin} onChange={(e) => setGtin(e.target.value.replace(/\D/g, ''))} />
        </label>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>
      {msg && <p role="status" className="text-sm text-slate-700">{msg}</p>}
      {data && (data.traction.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Tração por produto e UF</caption>
            <thead className="text-xs text-slate-500">
              <tr><th className="py-1 pr-3">Produto</th><th className="pr-3">UF</th><th className="pr-3 text-right">Unid. 4 sem.</th><th className="pr-3 text-right">4 sem. antes</th><th className="pr-3 text-right">Tração</th><th className="pr-3 text-right">Lojas</th><th className="text-right">Custo médio</th></tr>
            </thead>
            <tbody>
              {data.traction.map((t) => (
                <tr key={t.gtin + t.uf} className="border-t border-slate-100">
                  <td className="py-1.5 pr-3">
                    <button type="button" className="text-left hover:underline" onClick={() => { setGtin(t.gtin); load(uf, t.gtin); }}>
                      <span className="block font-medium text-slate-900">{t.productName ?? 'Produto sem cadastro'}</span>
                      <span className="font-mono text-xs text-slate-500">{t.gtin}</span>
                    </button>
                  </td>
                  <td className="pr-3">{t.uf}</td>
                  <td className="pr-3 text-right tabular-nums">{num(t.units4w)}</td>
                  <td className="pr-3 text-right tabular-nums">{num(t.unitsPrev4w)}</td>
                  <td className={`pr-3 text-right font-semibold tabular-nums ${t.growthPercent == null ? 'text-slate-400' : t.growthPercent >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {t.growthPercent == null ? '—' : `${t.growthPercent > 0 ? '+' : ''}${num(t.growthPercent, 1)}%`}
                  </td>
                  <td className="pr-3 text-right tabular-nums">{num(t.stores)}</td>
                  <td className="text-right tabular-nums">{t.avgCost == null ? '—' : money(Math.round(t.avgCost * 100))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          Ainda não há célula com o mínimo de lojas. O agregado cresce conforme mais mercados conferem notas; o recálculo automático roda toda madrugada.
        </p>
      ))}
      {data && gtin && (data.seasonality.length > 0 || data.cities.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Sazonalidade de {gtin}</h3>
            <ul className="mt-1 flex flex-col gap-0.5 text-sm">
              {data.seasonality.map((s) => <li key={s.uf + s.month}>{s.uf}, {MONTHS[s.month - 1]}: {num(s.units)} unid. ({s.stores} lojas)</li>)}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Custo por cidade (8 semanas)</h3>
            <ul className="mt-1 flex flex-col gap-0.5 text-sm">
              {data.cities.map((ct) => (
                <li key={ct.uf + ct.city}>{ct.city}/{ct.uf}: {num(ct.units)} unid., custo {money(Math.round(ct.min_cost * 100))} a {money(Math.round(ct.max_cost * 100))}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
};

const SuperAdminConfere: React.FC = () => {
  const [settings, setSettings] = useState<ConfereSettings | null>(null);
  const [stats, setStats] = useState<ConfereStats | null>(null);
  const [version, setVersion] = useState(0);

  const loadStats = useCallback(() => { confereAdminService.stats().then(setStats).catch(() => {}); }, []);
  useEffect(() => { confereAdminService.settings().then(setSettings).catch(() => {}); loadStats(); }, [loadStats]);

  const tiles: Array<[string, string]> = stats ? [
    ['Mercados', String(stats.accounts)],
    ['Com certificado A1', String(stats.withCertificate)],
    ['Notas lidas no mês', String(stats.readsMonth)],
    ['Leituras pagas no mês', String(stats.paidReadsMonth)],
    ['Custo Meu Danfe no mês', money(stats.paidReadsMonth * 3)],
    ['Recebido no mês', money(stats.revenueMonthCents)],
    ['Pedidos aguardando', String(stats.pendingOrders)],
  ] : [];

  return (
    <SuperAdminLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">MercadoFlow Confere</h1>
          <p className="text-sm text-slate-600">PWA grátis de conferência de mercadoria. Leitura grátis com certificado A1; sem ele, leituras de crédito revendidas do Meu Danfe.</p>
          <a href="/confere/" target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-semibold text-green-700 hover:underline">Abrir o app</a>
        </div>
        {stats && (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            {tiles.map(([label, value]) => (
              <li key={label} className="rounded-xl border border-slate-200 bg-white p-3">
                <span className="block text-xs text-slate-500">{label}</span>
                <span className="block text-lg font-bold tabular-nums text-slate-900">{value}</span>
              </li>
            ))}
          </ul>
        )}
        {settings ? <SettingsCard settings={settings} onSaved={setSettings} /> : <Loader2 className="h-6 w-6 animate-spin text-slate-400" />}
        <IconCard />
        <DiagnoseCard />
        <IntelligenceCard />
        <OrdersCard onChange={() => { loadStats(); setVersion((v) => v + 1); }} />
        <PlansCard />
        <AccountsCard version={version} />
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminConfere;
