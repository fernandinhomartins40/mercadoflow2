import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, Play, Plus, Power, Save, Search, Trash2, X, XCircle } from 'lucide-react';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import Button from '../components/common/Button';
import {
  aiAdminService, type AiLedgerRow, type AiOrderRow, type AiOverview, type AiPlanRow, type AiProviderRow, type AiRouteRow,
  type AiSettingsRow, type AiWallet, type ConsoleResult, type ConsoleTask, type WhatsAppConfig, type AiFallbackRow,
} from '../services/aiPlatform.service';

/**
 * IA e APIs: chaves da plataforma, roteamento por tarefa, orçamento, mercados
 * de teste, console de teste, uso e modo sombra do Jev. Proposta em
 * docs/PROPOSTA-IA-AGENTES.md (seção 4.3).
 */

const CARD = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const INPUT = 'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20';
const LABEL = 'text-sm font-medium text-slate-700';
const HINT = 'text-xs text-slate-500';

const errorText = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const num = (v: unknown) => Number(v ?? 0);
const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('pt-BR') : '—');

const PROVIDER_INFO: Record<string, { name: string; use: string; keyUrl: string }> = {
  DEEPSEEK: { name: 'DeepSeek', use: 'Modelo de linguagem (Flash e Pro): conversa, explicações, planos', keyUrl: 'https://platform.deepseek.com/api_keys' },
  JEV: { name: 'Jev (TypeSafe)', use: 'Decisões fechadas: ferramenta, alerta, relevância. Não escreve texto', keyUrl: 'https://console.typesafe.ai' },
  OPENROUTER: { name: 'OpenRouter', use: 'Modelos de reserva (Qwen, MiniMax, Kimi)', keyUrl: 'https://openrouter.ai/keys' },
  DEEPGRAM: { name: 'Deepgram', use: 'Voz paga (fala → texto), pacote Pro', keyUrl: 'https://console.deepgram.com' },
  WHATSAPP: { name: 'WhatsApp Business', use: 'Canal de mensagens dos agentes', keyUrl: 'https://business.facebook.com' },
};

const LAYER_LABEL: Record<string, string> = { TEMPLATE: 'Texto pronto', JEV: 'Jev', FLASH: 'Flash', PRO: 'Pro', VOZ: 'Voz', CANAL: 'Canal' };

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }> = ({ on, onChange, label, disabled }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${on ? 'bg-green-600' : 'bg-slate-300'}`}>
    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
  </button>
);

const Msg: React.FC<{ msg: { ok: boolean; text: string } | null }> = ({ msg }) =>
  msg ? <p role="status" className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p> : null;

type Tone = 'green' | 'amber' | 'red' | 'slate' | 'blue';
const TONE: Record<Tone, string> = {
  green: 'bg-green-50 text-green-800 ring-green-200',
  amber: 'bg-amber-50 text-amber-900 ring-amber-200',
  red: 'bg-red-50 text-red-800 ring-red-200',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-blue-50 text-blue-800 ring-blue-200',
};
const Pill: React.FC<{ tone: Tone; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONE[tone]}`}>{children}</span>
);

/** Estado de um provedor em uma palavra, para a lista e o guia. */
const providerState = (p: AiProviderRow | undefined): { label: string; tone: Tone; ok: boolean } => {
  if (!p || !p.configured) return { label: 'Sem chave', tone: 'slate', ok: false };
  if (p.lastCheckOk === false) return { label: 'Falhou no teste', tone: 'red', ok: false };
  if (!p.lastCheckAt) return { label: 'Falta testar', tone: 'amber', ok: false };
  if (!p.enabled) return { label: 'Desligado', tone: 'slate', ok: false };
  return { label: 'Pronto', tone: 'green', ok: true };
};

const REQUIRED_PROVIDERS = ['DEEPSEEK', 'JEV'];
const PROVIDER_ORDER = ['DEEPSEEK', 'JEV', 'OPENROUTER', 'DEEPGRAM', 'WHATSAPP'];

// ── Começar ─────────────────────────────────────────────────────────────

type GoTo = (tab: Tab) => void;

const SetupGuide: React.FC<{ data: AiOverview; usage: Record<string, unknown> | null; onSettings: (s: AiSettingsRow) => void; go: GoTo }> = ({ data, usage, onSettings, go }) => {
  const s = data.settings;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = async (patch: Partial<AiSettingsRow>) => {
    setBusy(true);
    setMsg(null);
    try { onSettings(await aiAdminService.saveSettings(patch)); } catch (e) { setMsg({ ok: false, text: errorText(e, 'Não foi possível salvar.') }); } finally { setBusy(false); }
  };
  const prov = (k: string) => data.providers.find((p) => p.provider === k);
  const spent = num(usage?.gastoHojeUsd);
  const budget = num(s.dailyBudgetUsd);
  const steps: Array<{ title: string; hint: string; done: boolean; action?: React.ReactNode }> = [
    { title: 'Chave mestra no servidor', hint: 'Variável AI_ENCRYPTION_KEY do deploy. Sem ela, nenhuma chave pode ser guardada.', done: s.encryptionReady },
    { title: 'DeepSeek: salvar a chave e testar', hint: 'É quem escreve as respostas.', done: providerState(prov('DEEPSEEK')).ok,
      action: <Button size="sm" variant="secondary" onClick={() => go('chaves')}>Abrir chaves</Button> },
    { title: 'Jev: salvar a chave e testar', hint: 'Decide o que vale a pena por frações de centavo.', done: providerState(prov('JEV')).ok,
      action: <Button size="sm" variant="secondary" onClick={() => go('chaves')}>Abrir chaves</Button> },
    { title: 'Escolher um mercado de teste', hint: `Ele ganha ${s.pilotGrantCredits} créditos para testar.`, done: data.pilots.length > 0,
      action: <Button size="sm" variant="secondary" onClick={() => go('mercados')}>Abrir mercados</Button> },
    { title: 'Ligar a IA da plataforma', hint: 'Começa só para os mercados de teste.', done: s.enabled,
      action: <Toggle on={s.enabled} onChange={(v) => set({ enabled: v })} label="Ligar a IA da plataforma" disabled={busy} /> },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  const extras: Array<{ title: string; state: { label: string; tone: Tone }; tab: Tab }> = [
    { title: 'Reserva de modelos (OpenRouter)', state: providerState(prov('OPENROUTER')), tab: 'chaves' },
    { title: 'Voz paga (Deepgram)', state: providerState(prov('DEEPGRAM')), tab: 'chaves' },
    { title: 'Avisos no WhatsApp', state: providerState(prov('WHATSAPP')), tab: 'chaves' },
  ];
  return (
    <>
      <section className={`${CARD} flex flex-col gap-4`} aria-labelledby="guide-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="guide-title" className="text-base font-semibold text-slate-900">Para começar os testes</h2>
            <p className="text-sm text-slate-600">{doneCount === steps.length ? 'Tudo pronto. Use a aba Uso e testes para acompanhar.' : `${doneCount} de ${steps.length} passos feitos.`}</p>
          </div>
          <span className={`text-sm font-semibold ${s.enabled ? 'text-green-700' : 'text-slate-500'}`}>{s.enabled ? 'Ligada' : 'Desligada'}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount} aria-label="Passos feitos">
          <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
        <ol className="flex flex-col divide-y divide-slate-100">
          {steps.map((st, i) => (
            <li key={st.title} className="flex flex-wrap items-center gap-3 py-3">
              {st.done
                ? <CheckCircle2 className="h-6 w-6 shrink-0 text-green-600" aria-label="feito" />
                : <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 text-xs font-bold text-slate-600">{i + 1}</span>}
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold ${st.done ? 'text-slate-500' : 'text-slate-900'}`}>{st.title}</span>
                <span className={HINT}>{st.hint}</span>
              </span>
              {st.action && (!st.done || i === steps.length - 1) && <span className="shrink-0">{st.action}</span>}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3">
          <Toggle on={s.pilotOnly} onChange={(v) => set({ pilotOnly: v })} label="Só mercados de teste" disabled={busy} />
          <span className="min-w-0 flex-1 text-sm text-slate-700">{s.pilotOnly ? 'Só os mercados de teste usam a IA (recomendado no começo)' : 'Todos os mercados com créditos usam a IA'}</span>
        </div>
        <Msg msg={msg} />
      </section>

      <section className={`${CARD} flex flex-col gap-3`} aria-labelledby="extras-title">
        <h2 id="extras-title" className="text-base font-semibold text-slate-900">Opcionais</h2>
        <ul className="flex flex-col divide-y divide-slate-100">
          {extras.map((x) => (
            <li key={x.title} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1 text-sm text-slate-800">{x.title}</span>
              <Pill tone={x.state.tone}>{x.state.label}</Pill>
              <Button size="sm" variant="ghost" onClick={() => go(x.tab)}>Configurar</Button>
            </li>
          ))}
          <li className="flex flex-wrap items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1 text-sm text-slate-800">Agentes agindo sozinhos (nível 3)</span>
            <Button size="sm" variant="ghost" onClick={() => go('ajustes')}>Configurar</Button>
          </li>
        </ul>
      </section>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Situação de hoje">
        <li className={`${CARD} !p-4`}><span className={HINT}>Gasto de hoje</span>
          <span className="block text-xl font-bold tabular-nums text-slate-900">{usd(spent)}</span>
          <span className={`${HINT} ${spent >= budget ? 'font-semibold text-red-700' : ''}`}>teto diário {usd(budget)}{spent >= budget ? ': IA em pausa' : ''}</span></li>
        <li className={`${CARD} !p-4`}><span className={HINT}>Mercados de teste</span>
          <span className="block text-xl font-bold tabular-nums text-slate-900">{data.pilots.length}</span>
          <button type="button" onClick={() => go('mercados')} className="text-xs font-semibold text-green-700 hover:underline">Ver mercados</button></li>
        <li className={`${CARD} !p-4`}><span className={HINT}>DeepSeek</span>
          <span className="block"><Pill tone={providerState(prov('DEEPSEEK')).tone}>{providerState(prov('DEEPSEEK')).label}</Pill></span>
          <span className={HINT}>{prov('DEEPSEEK')?.lastCheckAt ? `último teste ${when(prov('DEEPSEEK')?.lastCheckAt)}` : 'ainda não testado'}</span></li>
      </ul>
    </>
  );
};

const BudgetCard: React.FC<{ settings: AiSettingsRow; onSaved: (s: AiSettingsRow) => void }> = ({ settings, onSaved }) => {
  const [form, setForm] = useState({
    dailyBudgetUsd: String(settings.dailyBudgetUsd), lowBalanceAlertUsd: String(settings.lowBalanceAlertUsd),
    defaultMonthlyCapCredits: String(settings.defaultMonthlyCapCredits), usdBrl: String(settings.usdBrl),
    pilotGrantCredits: String(settings.pilotGrantCredits),
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      onSaved(await aiAdminService.saveSettings({
        dailyBudgetUsd: Number(form.dailyBudgetUsd.replace(',', '.')), lowBalanceAlertUsd: Number(form.lowBalanceAlertUsd.replace(',', '.')),
        defaultMonthlyCapCredits: Number(form.defaultMonthlyCapCredits), usdBrl: Number(form.usdBrl.replace(',', '.')),
        pilotGrantCredits: Number(form.pilotGrantCredits),
      }));
      setMsg({ ok: true, text: 'Orçamento salvo.' });
    } catch (err) { setMsg({ ok: false, text: errorText(err, 'Não foi possível salvar.') }); }
  };
  const field = (k: keyof typeof form, label: string, hint: string) => (
    <label className="flex flex-col gap-1"><span className={LABEL}>{label}</span>
      <input className={INPUT} inputMode="decimal" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} aria-label={label} />
      <span className={HINT}>{hint}</span></label>
  );
  return (
    <form onSubmit={save} className={`${CARD} flex flex-col gap-4`} aria-labelledby="budget-title">
      <div>
        <h2 id="budget-title" className="text-base font-semibold text-slate-900">Orçamento e segurança do gasto</h2>
        <p className="text-sm text-slate-600">Quando o teto diário é atingido, a IA pausa até o dia seguinte e os mercados ficam com o texto pronto.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {field('dailyBudgetUsd', 'Teto de gasto diário (US$)', 'Soma de todos os mercados')}
        {field('lowBalanceAlertUsd', 'Alerta de saldo baixo (US$)', 'Aviso no painel quando o saldo do provedor ficar abaixo')}
        {field('defaultMonthlyCapCredits', 'Teto mensal padrão por mercado (créditos)', 'Cada mercado pode ter o seu teto')}
        {field('usdBrl', 'Câmbio (R$ por US$)', 'Usado nos relatórios de custo')}
        {field('pilotGrantCredits', 'Créditos de teste ao entrar no piloto', 'Concedidos uma vez')}
      </div>
      <div className="flex items-center gap-3"><Button type="submit"><Save className="h-4 w-4" />Salvar orçamento</Button><Msg msg={msg} /></div>
    </form>
  );
};

// ── Chaves ──────────────────────────────────────────────────────────────

const ProviderCard: React.FC<{ p: AiProviderRow; onChange: (rows: AiProviderRow[]) => void; encryptionReady: boolean }> = ({ p, onChange, encryptionReady }) => {
  const info = PROVIDER_INFO[p.provider];
  const required = REQUIRED_PROVIDERS.includes(p.provider);
  const state = providerState(p);
  const [editing, setEditing] = useState(!p.configured);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(p.baseUrl);
  const [model, setModel] = useState(p.defaultModel ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const isWa = p.provider === 'WHATSAPP';
  const save = async (enabled?: boolean) => {
    setBusy('save');
    setMsg(null);
    try {
      onChange(await aiAdminService.saveProvider(p.provider, { apiKey: apiKey.trim() || undefined, baseUrl, model, enabled }));
      setApiKey('');
      setMsg({ ok: true, text: 'Salvo.' });
      if (enabled === undefined) setEditing(false);
    } catch (e) { setMsg({ ok: false, text: errorText(e, 'Não foi possível salvar.') }); } finally { setBusy(null); }
  };
  const test = async () => {
    setBusy('test');
    setMsg(null);
    try {
      const r = await aiAdminService.test(p.provider);
      setMsg({ ok: r.ok, text: `${r.message} (${r.latencyMs} ms)${r.balance ? `. Saldo: ${r.balance}` : ''}` });
      onChange((await aiAdminService.overview()).providers);
    } catch (e) { setMsg({ ok: false, text: errorText(e, 'O teste falhou.') }); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!window.confirm(`Remover a chave de ${info.name}?`)) return;
    try { onChange(await aiAdminService.removeKey(p.provider)); setEditing(true); } catch (e) { setMsg({ ok: false, text: errorText(e, 'Não foi possível remover.') }); }
  };
  return (
    <section className={`${CARD} flex flex-col gap-3`} aria-label={info.name}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">{info.name}</h3>
            <Pill tone={required ? 'blue' : 'slate'}>{required ? 'Obrigatória' : 'Opcional'}</Pill>
            <Pill tone={state.tone}>{state.label}</Pill>
          </div>
          <p className="text-sm text-slate-600">{info.use}</p>
          {p.configured && (
            <p className={`${HINT} break-words`}>
              Chave terminando em <span className="font-mono">{p.keyHint}</span>
              {p.lastCheckAt ? <>; último teste {when(p.lastCheckAt)}: {p.lastCheckOk ? 'ok' : `falhou (${p.lastCheckError ?? ''})`}</> : null}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${p.enabled ? 'text-green-700' : 'text-slate-500'}`}>{p.enabled ? 'Ligado' : 'Desligado'}</span>
          <Toggle on={p.enabled} onChange={(v) => save(v)} label={`Ligar ${info.name}`} disabled={!p.configured || !!busy} />
        </div>
      </div>

      {editing ? (
        <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1"><span className={LABEL}>{p.configured ? 'Nova chave' : 'Chave de API'}</span>
              <input className={`${INPUT} font-mono`} type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder={p.configured ? 'deixe vazio para manter a atual' : 'cole a chave aqui'} aria-label={`Chave de API de ${info.name}`} disabled={!encryptionReady} />
              <a href={info.keyUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-green-700 hover:underline">Onde criar a chave</a></label>
            <label className="flex min-w-0 flex-col gap-1"><span className={LABEL}>{isWa ? 'ID do número (Phone number ID)' : 'Modelo padrão'}</span>
              <input className={`${INPUT} font-mono`} value={model} onChange={(e) => setModel(e.target.value)}
                aria-label={isWa ? 'ID do número do WhatsApp' : `Modelo padrão de ${info.name}`} /></label>
          </div>
          {p.allowedBaseUrls.length > 1 && (
            <label className="flex min-w-0 flex-col gap-1"><span className={LABEL}>Endereço</span>
              <select className={INPUT} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} aria-label={`Endereço de ${info.name}`}>
                {p.allowedBaseUrls.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <span className={HINT}>Lista fixa: a chave nunca vai para outro servidor.</span></label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => save()} disabled={!!busy || !encryptionReady}>{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar</Button>
            {p.configured && <Button variant="ghost" onClick={() => { setEditing(false); setApiKey(''); }}>Cancelar</Button>}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {p.configured && (
          <Button variant="secondary" onClick={test} disabled={!!busy}>{busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Testar</Button>
        )}
        {p.configured && !editing && <Button variant="ghost" onClick={() => setEditing(true)}><KeyRound className="h-4 w-4" />Trocar chave ou modelo</Button>}
        {p.configured && <Button variant="ghost" onClick={remove} disabled={!!busy}><Trash2 className="h-4 w-4" />Remover</Button>}
        <Msg msg={msg} />
      </div>
    </section>
  );
};

// ── WhatsApp: modelo de mensagem e webhook ─────────────────────────────

const WEBHOOK_URL = `${window.location.origin}/api/v1/public/whatsapp/webhook`;

const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');

const WhatsAppConfigCard: React.FC<{ encryptionReady: boolean; pilots: AiOverview['pilots'] }> = ({ encryptionReady, pilots }) => {
  const [target, setTarget] = useState(pilots[0]?.marketId ?? '');
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sendNow = async () => {
    if (!target) return;
    try {
      const r = await aiAdminService.notifyWhatsapp(target);
      setSendMsg({ ok: true, text: r.enviadas ? `${r.enviadas} mensagem(ns) enviada(s).` : 'Nada enviado: sem aceite, no horário de silêncio ou sem novidade.' });
    } catch (err) { setSendMsg({ ok: false, text: errorText(err, 'Não foi possível enviar.') }); }
  };
  const [cfg, setCfg] = useState<WhatsAppConfig | null>(null);
  const [form, setForm] = useState({ templateName: '', templateLang: '', verifyToken: '', appSecret: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    aiAdminService.whatsapp().then((c) => { setCfg(c); setForm({ templateName: c.templateName, templateLang: c.templateLang, verifyToken: '', appSecret: '' }); })
      .catch(() => setMsg({ ok: false, text: 'Não foi possível carregar.' }));
  }, []);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const c = await aiAdminService.saveWhatsapp({
        templateName: form.templateName, templateLang: form.templateLang,
        verifyToken: form.verifyToken.trim() || undefined, appSecret: form.appSecret.trim() || undefined,
      });
      setCfg(c);
      setForm({ ...form, verifyToken: '', appSecret: '' });
      setMsg({ ok: true, text: form.verifyToken ? `Salvo. Cole este token na Meta: ${form.verifyToken}` : 'Salvo.' });
    } catch (err) { setMsg({ ok: false, text: errorText(err, 'Não foi possível salvar.') }); }
  };
  if (!cfg) return <section className={CARD}><Loader2 className="h-5 w-5 animate-spin text-slate-400" /><Msg msg={msg} /></section>;
  return (
    <form onSubmit={save} className={`${CARD} flex flex-col gap-3`} aria-label="WhatsApp: modelo e webhook">
      <div>
        <h3 className="text-base font-semibold text-slate-900">WhatsApp: modelo de mensagem e webhook</h3>
        <p className="text-sm text-slate-600">
          Na Meta, crie um modelo da categoria Utilidade com o corpo <span className="font-mono">{'{{1}}'}</span> e dois botões de resposta rápida:
          <strong> Aprovar</strong> e <strong>Depois</strong>. O texto do aviso entra no {'{{1}}'}; o botão Aprovar responde à decisão.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1"><span className={LABEL}>Nome do modelo aprovado</span>
          <input className={`${INPUT} font-mono`} value={form.templateName} onChange={(e) => setForm({ ...form, templateName: e.target.value })} /></label>
        <label className="flex flex-col gap-1"><span className={LABEL}>Idioma do modelo</span>
          <input className={`${INPUT} font-mono`} value={form.templateLang} onChange={(e) => setForm({ ...form, templateLang: e.target.value })} /></label>
        <label className="flex flex-col gap-1"><span className={LABEL}>{cfg.verifyTokenSet ? 'Trocar o token de verificação' : 'Token de verificação do webhook'}</span>
          <span className="flex gap-2">
            <input className={`${INPUT} font-mono`} value={form.verifyToken} onChange={(e) => setForm({ ...form, verifyToken: e.target.value })}
              placeholder={cfg.verifyTokenSet ? 'já cadastrado; deixe vazio para manter' : 'gere ou cole'} aria-label="Token de verificação do webhook" />
            <Button type="button" variant="secondary" onClick={() => setForm({ ...form, verifyToken: newToken() })}>Gerar</Button>
          </span></label>
        <label className="flex flex-col gap-1"><span className={LABEL}>{cfg.appSecretSet ? `Trocar o segredo do app (atual termina em ${cfg.appSecretHint ?? '…'})` : 'Segredo do app (App Secret)'}</span>
          <input className={`${INPUT} font-mono`} type="password" autoComplete="off" value={form.appSecret} disabled={!encryptionReady}
            onChange={(e) => setForm({ ...form, appSecret: e.target.value })} placeholder={cfg.appSecretSet ? 'deixe vazio para manter' : 'cole o App Secret'} aria-label="Segredo do app do WhatsApp" />
          <span className={HINT}>Usado para conferir a assinatura de cada mensagem recebida. Guardado cifrado.</span></label>
      </div>
      <p className="text-sm text-slate-600">Endereço do webhook para cadastrar na Meta (campo <span className="font-mono">messages</span>):
        <span className="mt-1 block select-all break-all rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{WEBHOOK_URL}</span></p>
      <div className="flex flex-wrap items-center gap-2"><Button type="submit"><Save className="h-4 w-4" />Salvar WhatsApp</Button><Msg msg={msg} /></div>
      {pilots.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <label className="flex flex-col gap-1"><span className={LABEL}>Testar com um mercado do piloto</span>
            <select className={INPUT} value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Mercado para o teste do WhatsApp">
              {pilots.map((p) => <option key={p.marketId} value={p.marketId}>{p.name}</option>)}
            </select></label>
          <Button type="button" variant="secondary" onClick={sendNow}><Play className="h-4 w-4" />Enviar avisos agora</Button>
          <Msg msg={sendMsg} />
        </div>
      )}
    </form>
  );
};

// ── Roteamento ──────────────────────────────────────────────────────────

const routeState = (r: AiRouteRow): { label: string; tone: Tone } =>
  !r.enabled ? { label: 'Desligada', tone: 'slate' } : r.shadow ? { label: 'Em sombra', tone: 'amber' } : { label: 'Ligada', tone: 'green' };

const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string; wide?: boolean }> = ({ label, children, hint, wide }) => (
  <label className={`flex min-w-0 flex-col gap-1 ${wide ? 'col-span-2 sm:col-span-1' : ''}`}><span className="text-xs font-medium text-slate-600">{label}</span>{children}{hint && <span className={HINT}>{hint}</span>}</label>
);

const FallbackItem: React.FC<{ f: AiFallbackRow; onSaved: (rows: AiFallbackRow[]) => void }> = ({ f, onSaved }) => {
  const [form, setForm] = useState({ ...f });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setForm({ ...f }); }, [f]);
  const save = async () => {
    try {
      onSaved(await aiAdminService.saveFallback(f.task, f.position, {
        provider: form.provider, model: form.model, inputPriceUsdM: Number(form.inputPriceUsdM),
        outputPriceUsdM: Number(form.outputPriceUsdM), enabled: form.enabled,
      }));
      setMsg({ ok: true, text: 'Salvo' });
    } catch (e) { setMsg({ ok: false, text: errorText(e, 'Erro') }); }
  };
  const remove = async () => {
    try { onSaved(await aiAdminService.removeFallback(f.task, f.position)); } catch (e) { setMsg({ ok: false, text: errorText(e, 'Erro') }); }
  };
  const label = `${f.task} reserva ${f.position}`;
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3" aria-label={`Reserva ${f.position}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800">Reserva {f.position}</span>
        <span className="flex items-center gap-2 text-xs text-slate-600"><Toggle on={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label={`Ligar a ${label}`} />{form.enabled ? 'ligada' : 'desligada'}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Provedor"><select className={INPUT} value={form.provider} aria-label={`Provedor da ${label}`}
          onChange={(e) => setForm({ ...form, provider: e.target.value as AiFallbackRow['provider'] })}>
          <option value="OPENROUTER">OpenRouter</option><option value="DEEPSEEK">DeepSeek</option></select></Field>
        <Field label="Modelo" wide><input className={`${INPUT} font-mono`} value={form.model} aria-label={`Modelo da ${label}`} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
        <Field label="US$ por milhão (entrada)"><input className={INPUT} type="number" step="0.01" min={0} value={form.inputPriceUsdM} aria-label={`Preço de entrada da ${label}`} onChange={(e) => setForm({ ...form, inputPriceUsdM: Number(e.target.value) })} /></Field>
        <Field label="US$ por milhão (saída)"><input className={INPUT} type="number" step="0.01" min={0} value={form.outputPriceUsdM} aria-label={`Preço de saída da ${label}`} onChange={(e) => setForm({ ...form, outputPriceUsdM: Number(e.target.value) })} /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save}>Salvar reserva</Button>
        <Button size="sm" variant="ghost" onClick={remove} aria-label={`Remover a ${label}`}><Trash2 className="h-4 w-4" />Remover</Button>
        <Msg msg={msg} />
      </div>
    </li>
  );
};

const RouteCard: React.FC<{ r: AiRouteRow; providers: AiProviderRow[]; fallbacks: AiFallbackRow[]; onSaved: (rows: AiRouteRow[]) => void;
  onFallbacks: (rows: AiFallbackRow[]) => void }> = ({ r, providers, fallbacks, onSaved, onFallbacks }) => {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ...r });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setF({ ...r }); }, [r]);
  const dirty = JSON.stringify(f) !== JSON.stringify(r);
  const writes = r.layer === 'FLASH' || r.layer === 'PRO';
  const mine = fallbacks.filter((x) => x.task === r.task);
  const save = async () => {
    try {
      onSaved(await aiAdminService.saveRoute(r.task, {
        layer: f.layer, provider: f.provider ?? undefined, model: f.model ?? undefined, maxContextTokens: Number(f.maxContextTokens),
        maxOutputTokens: Number(f.maxOutputTokens), temperature: Number(f.temperature), jevThreshold: Number(f.jevThreshold),
        creditsPerUse: Number(f.creditsPerUse), inputPriceUsdM: Number(f.inputPriceUsdM), outputPriceUsdM: Number(f.outputPriceUsdM),
        shadow: f.shadow, enabled: f.enabled,
      }));
      setMsg({ ok: true, text: 'Salvo' });
    } catch (e) { setMsg({ ok: false, text: errorText(e, 'Erro') }); }
  };
  const addFallback = async () => {
    const used = mine.map((x) => x.position);
    const position = [1, 2, 3, 4, 5].find((n) => !used.includes(n));
    if (!position) return;
    try {
      onFallbacks(await aiAdminService.saveFallback(r.task, position, { provider: 'OPENROUTER', model: 'qwen/qwen3.5-flash', inputPriceUsdM: 0.1, outputPriceUsdM: 0.4, enabled: true }));
    } catch (e) { setMsg({ ok: false, text: errorText(e, 'Erro') }); }
  };
  const numField = (k: keyof AiRouteRow, label: string, aria: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <input className={`${INPUT} tabular-nums`} inputMode="decimal" aria-label={`${aria} de ${r.label}`} value={String(f[k] ?? '')}
        onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </Field>
  );
  const state = routeState(r);
  const providerName = PROVIDER_INFO[r.provider ?? '']?.name ?? r.provider ?? '—';
  return (
    <li className="rounded-xl border border-slate-200 bg-white" aria-label={r.label}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl p-3 text-left hover:bg-slate-50">
        <span className="min-w-0 flex-1 basis-56">
          <span className="block text-sm font-semibold text-slate-900">{r.label}</span>
          <span className="block truncate text-xs text-slate-500">{providerName}{r.model ? ` · ${r.model}` : ''} · {r.creditsPerUse} {r.creditsPerUse === 1 ? 'crédito' : 'créditos'} por uso</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <Pill tone="slate">{LAYER_LABEL[r.layer] ?? r.layer}</Pill>
          <Pill tone={state.tone}>{state.label}</Pill>
          {writes && <Pill tone={mine.length ? 'blue' : 'slate'}>{mine.length ? `${mine.length} reserva${mine.length > 1 ? 's' : ''}` : 'sem reserva'}</Pill>}
          <span className="text-xs font-semibold text-green-700">{open ? 'Fechar' : 'Editar'}</span>
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-slate-100 p-3">
          <p className="text-xs text-slate-500"><span className="font-mono">{r.task}</span>{r.notes ? `: ${r.notes}` : ''}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="Camada"><select className={INPUT} value={f.layer} aria-label={`Camada de ${r.label}`} onChange={(e) => setF({ ...f, layer: e.target.value as AiRouteRow['layer'] })}>
              {Object.entries(LAYER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Provedor"><select className={INPUT} value={f.provider ?? ''} aria-label={`Provedor de ${r.label}`} onChange={(e) => setF({ ...f, provider: e.target.value })}>
              {providers.map((p) => <option key={p.provider} value={p.provider}>{PROVIDER_INFO[p.provider]?.name ?? p.provider}</option>)}</select></Field>
            <Field label="Modelo" wide><input className={`${INPUT} font-mono`} value={f.model ?? ''} aria-label={`Modelo de ${r.label}`} placeholder="padrão do provedor" onChange={(e) => setF({ ...f, model: e.target.value })} /></Field>
            {numField('creditsPerUse', 'Créditos cobrados por uso', 'Créditos por uso')}
            {numField('maxContextTokens', 'Teto de entrada (tokens)', 'Teto de contexto')}
            {numField('maxOutputTokens', 'Teto de resposta (tokens)', 'Teto de saída')}
            {numField('inputPriceUsdM', 'US$ por milhão (entrada)', 'Preço de entrada')}
            {numField('outputPriceUsdM', 'US$ por milhão (saída)', 'Preço de saída')}
            {r.layer === 'JEV' && numField('jevThreshold', 'Confiança mínima do Jev (0 a 1)', 'Limite de confiança do Jev')}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
            <label className="flex items-center gap-2"><Toggle on={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} label={`Ligar ${r.label}`} />Ligada</label>
            <label className="flex items-center gap-2"><Toggle on={f.shadow} onChange={(v) => setF({ ...f, shadow: v })} label={`Modo sombra de ${r.label}`} />Em sombra (só observa, não decide)</label>
          </div>
          <div className="flex flex-wrap items-center gap-2"><Button size="sm" onClick={save} disabled={!dirty}>Salvar</Button><Msg msg={msg} /></div>
          {writes && (
            <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
              <h4 className="text-sm font-semibold text-slate-900">Se este modelo falhar</h4>
              <p className={HINT}>O Copiloto tenta as reservas na ordem, antes de cair no texto do sistema. O lojista paga o mesmo crédito. Confira o id do modelo no OpenRouter.</p>
              <ul className="flex flex-col gap-2">{mine.map((x) => <FallbackItem key={`${x.task}-${x.position}`} f={x} onSaved={onFallbacks} />)}</ul>
              {mine.length < 5 && <div><Button size="sm" variant="secondary" onClick={addFallback}><Plus className="h-4 w-4" />Adicionar reserva</Button></div>}
            </div>
          )}
        </div>
      )}
    </li>
  );
};

const ROUTE_GROUPS: Array<{ title: string; hint: string; layers: string[] }> = [
  { title: 'Escrevem texto', hint: 'Gastam créditos do lojista. Use reservas para não ficar sem resposta.', layers: ['FLASH', 'PRO'] },
  { title: 'Decisões do Jev', hint: 'Frações de centavo. Em sombra, só observam e não mudam nada.', layers: ['JEV'] },
  { title: 'Voz e WhatsApp', hint: 'Serviços pagos por uso fora do modelo de texto.', layers: ['VOZ', 'CANAL'] },
  { title: 'Texto pronto', hint: 'Sem custo. Mude a camada se quiser que a IA escreva.', layers: ['TEMPLATE'] },
];

const RoutesCard: React.FC<{ routes: AiRouteRow[]; providers: AiProviderRow[]; fallbacks: AiFallbackRow[]; onSaved: (rows: AiRouteRow[]) => void;
  onFallbacks: (rows: AiFallbackRow[]) => void }> = ({ routes, providers, fallbacks, onSaved, onFallbacks }) => (
  <section className={`${CARD} flex flex-col gap-4`} aria-labelledby="routes-title">
    <div>
      <h2 id="routes-title" className="text-base font-semibold text-slate-900">Tarefas da IA</h2>
      <p className="text-sm text-slate-600">Quem atende cada tarefa e quanto ela custa. Toque em uma tarefa para editar. Muda na hora, sem deploy.</p>
    </div>
    {ROUTE_GROUPS.map((g) => {
      const list = routes.filter((r) => g.layers.includes(r.layer));
      if (list.length === 0) return null;
      return (
        <div key={g.title} className="flex flex-col gap-2">
          <div><h3 className="text-sm font-semibold text-slate-900">{g.title}</h3><p className={HINT}>{g.hint}</p></div>
          <ul className="flex flex-col gap-2">
            {list.map((r) => <RouteCard key={r.task} r={r} providers={providers} fallbacks={fallbacks} onSaved={onSaved} onFallbacks={onFallbacks} />)}
          </ul>
        </div>
      );
    })}
  </section>
);

// ── Autonomia (nível 3) ────────────────────────────────────────────────

const AutonomyCard: React.FC = () => {
  const [cfg, setCfg] = useState<{ enabled: boolean; maxActionCap: number } | null>(null);
  const [cap, setCap] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { aiAdminService.autonomy().then((c) => { setCfg(c); setCap(String(c.maxActionCap)); }).catch(() => {}); }, []);
  const save = async (enabled?: boolean) => {
    try {
      const c = await aiAdminService.saveAutonomy({ enabled: enabled ?? cfg?.enabled, maxActionCap: Number(cap) });
      setCfg(c);
      setMsg({ ok: true, text: 'Salvo.' });
    } catch (e) { setMsg({ ok: false, text: errorText(e, 'Não foi possível salvar.') }); }
  };
  if (!cfg) return null;
  return (
    <section className={`${CARD} flex flex-col gap-3`} aria-labelledby="autonomy-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="autonomy-title" className="text-base font-semibold text-slate-900">Autonomia dos agentes (nível 3)</h2>
          <p className="text-sm text-slate-600">Liberada, o lojista pode deixar o agente de Compras montar o rascunho de pedido sozinho, dentro do teto e dos fornecedores que ele escolher. Nada é enviado ao fornecedor sem revisão, e tudo pode ser desfeito em 24 horas.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${cfg.enabled ? 'text-green-700' : 'text-slate-500'}`}>{cfg.enabled ? 'Liberada' : 'Desligada'}</span>
          <Toggle on={cfg.enabled} onChange={(v) => save(v)} label="Liberar a autonomia dos agentes" />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1"><span className={LABEL}>Teto máximo por pedido (R$)</span>
          <input className={INPUT} type="number" min={1} step={50} value={cap} onChange={(e) => setCap(e.target.value)} /></label>
        <Button variant="secondary" onClick={() => save()}><Save className="h-4 w-4" />Salvar teto</Button>
        <Msg msg={msg} />
      </div>
    </section>
  );
};

// ── Piloto e carteiras ──────────────────────────────────────────────────

const WalletPanel: React.FC<{ marketId: string; name: string; onClose: () => void; onChange: () => void }> = ({ marketId, name, onClose, onChange }) => {
  const [data, setData] = useState<{ wallet: AiWallet; ledger: AiLedgerRow[] } | null>(null);
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');
  const [cap, setCap] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => { aiAdminService.wallet(marketId).then((d) => { setData(d); setCap(d.wallet.monthlyCap == null ? '' : String(d.wallet.monthlyCap)); }).catch(() => {}); }, [marketId]);
  useEffect(load, [load]);
  const adjust = async () => {
    try { await aiAdminService.adjust(marketId, Number(delta), note); setDelta(''); setNote(''); load(); onChange(); setMsg({ ok: true, text: 'Saldo ajustado.' }); }
    catch (e) { setMsg({ ok: false, text: errorText(e, 'Não foi possível ajustar.') }); }
  };
  const saveCap = async () => {
    try { await aiAdminService.setCap(marketId, cap.trim() === '' ? null : Number(cap)); load(); setMsg({ ok: true, text: 'Teto salvo.' }); }
    catch (e) { setMsg({ ok: false, text: errorText(e, 'Não foi possível salvar.') }); }
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-green-200 bg-green-50/40 p-4">
      <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-900">Carteira de {name}</h3>
        <button type="button" onClick={onClose} aria-label="Fechar carteira" className="rounded p-1 text-slate-500 hover:text-slate-900"><X className="h-4 w-4" /></button></div>
      {data ? (
        <>
          <p className="text-sm">Saldo <strong className="tabular-nums">{data.wallet.balance}</strong> créditos · usados no mês <strong className="tabular-nums">{data.wallet.monthUsed}</strong> de {data.wallet.effectiveCap}</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1"><span className={LABEL}>Créditos (+ ou −)</span><input className={`${INPUT} w-32`} value={delta} onChange={(e) => setDelta(e.target.value)} aria-label="Créditos a ajustar" /></label>
            <label className="flex min-w-[200px] flex-1 flex-col gap-1"><span className={LABEL}>Motivo</span><input className={INPUT} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Motivo do ajuste" /></label>
            <Button variant="secondary" onClick={adjust} disabled={!delta || Number.isNaN(Number(delta))}>Ajustar saldo</Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1"><span className={LABEL}>Teto mensal (vazio = padrão)</span><input className={`${INPUT} w-40`} value={cap} onChange={(e) => setCap(e.target.value)} aria-label="Teto mensal do mercado" /></label>
            <Button variant="secondary" onClick={saveCap}>Salvar teto</Button>
          </div>
          <Msg msg={msg} />
          <ul className="max-h-48 overflow-auto text-sm">
            {data.ledger.map((l, i) => (
              <li key={i} className="flex justify-between gap-3 border-t border-slate-100 py-1">
                <span className="text-slate-700">{l.note ?? l.kind}</span>
                <span className={`tabular-nums ${l.delta < 0 ? 'text-red-700' : 'text-green-700'}`}>{l.delta > 0 ? '+' : ''}{l.delta}</span>
              </li>
            ))}
            {data.ledger.length === 0 && <li className={HINT}>Sem movimentação.</li>}
          </ul>
        </>
      ) : <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
    </div>
  );
};

const PilotCard: React.FC<{ data: AiOverview; onPilots: (rows: AiOverview['pilots']) => void; refresh: () => void }> = ({ data, onPilots, refresh }) => {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Array<{ id: string; name: string; cnpj: string | null }>>([]);
  const [open, setOpen] = useState<{ id: string; name: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const search = async (e: React.FormEvent) => { e.preventDefault(); setHits(await aiAdminService.markets(q)); };
  const add = async (id: string) => {
    try { onPilots(await aiAdminService.addPilot(id)); setMsg({ ok: true, text: `Mercado adicionado com ${data.settings.pilotGrantCredits} créditos de teste.` }); setHits([]); setQ(''); }
    catch (e) { setMsg({ ok: false, text: errorText(e, 'Não foi possível adicionar.') }); }
  };
  const remove = async (id: string) => { if (window.confirm('Tirar este mercado do piloto?')) onPilots(await aiAdminService.removePilot(id)); };
  const pilotIds = new Set(data.pilots.map((p) => p.marketId));
  return (
    <section className={`${CARD} flex flex-col gap-4`} aria-labelledby="pilot-title">
      <div>
        <h2 id="pilot-title" className="text-base font-semibold text-slate-900">Mercados de teste</h2>
        <p className="text-sm text-slate-600">Com "só mercados de teste" ligado, só estes usam a IA da plataforma. Ao entrar, cada um ganha {data.settings.pilotGrantCredits} créditos (uma vez).</p>
      </div>
      <form onSubmit={search} className="flex gap-2">
        <input className={INPUT} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome ou CNPJ do mercado" aria-label="Buscar mercado" />
        <Button type="submit" variant="secondary"><Search className="h-4 w-4" />Buscar</Button>
      </form>
      {hits.length > 0 && (
        <ul className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200">
          {hits.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span><span className="font-medium">{h.name}</span> <span className="text-slate-500">{h.cnpj}</span></span>
              {pilotIds.has(h.id) ? <span className={HINT}>já está no piloto</span> : <Button size="sm" onClick={() => add(h.id)}><Plus className="h-4 w-4" />Adicionar</Button>}
            </li>
          ))}
        </ul>
      )}
      <Msg msg={msg} />
      <ul className="flex flex-col divide-y divide-slate-100">
        {data.pilots.map((p) => (
          <li key={p.marketId} className="flex flex-col gap-2 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span><span className="font-medium text-slate-900">{p.name}</span> <span className="text-slate-500">{p.cnpj}</span></span>
              <span className="flex items-center gap-2"><span className="tabular-nums">{p.balance} créditos</span>
                <Button size="sm" variant="secondary" onClick={() => setOpen(open?.id === p.marketId ? null : { id: p.marketId, name: p.name })}>Carteira</Button>
                <button type="button" onClick={() => remove(p.marketId)} aria-label={`Tirar ${p.name} do piloto`} className="rounded p-1 text-slate-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button></span>
            </div>
            {open?.id === p.marketId && <WalletPanel marketId={p.marketId} name={p.name} onClose={() => setOpen(null)} onChange={refresh} />}
          </li>
        ))}
        {data.pilots.length === 0 && <li className="py-2 text-sm text-slate-500">Nenhum mercado de teste ainda.</li>}
      </ul>
    </section>
  );
};

// ── Console ─────────────────────────────────────────────────────────────

const ConsoleCard: React.FC<{ data: AiOverview }> = ({ data }) => {
  const [marketId, setMarketId] = useState(data.pilots[0]?.marketId ?? '');
  const [task, setTask] = useState<ConsoleTask>('CHAT');
  const [input, setInput] = useState('Quanto vendi nos últimos 7 dias?');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConsoleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try { setResult(await aiAdminService.console({ marketId, task, input })); } catch (err) { setError(errorText(err, 'O teste falhou.')); } finally { setBusy(false); }
  };
  const examples: Record<ConsoleTask, string> = {
    CHAT: 'Quanto vendi nos últimos 7 dias?', EXPLAIN: '', JEV: 'O que eu preciso comprar para o fim de semana?',
  };
  return (
    <section className={`${CARD} flex flex-col gap-4`} aria-labelledby="console-title">
      <div>
        <h2 id="console-title" className="text-base font-semibold text-slate-900">Console de teste</h2>
        <p className="text-sm text-slate-600">Roda uma tarefa real contra um mercado de teste, sem debitar créditos, e mostra qual camada respondeu, tokens, custo e tempo.</p>
      </div>
      <form onSubmit={run} className="flex flex-col gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1"><span className={LABEL}>Mercado</span>
            <select className={INPUT} value={marketId} onChange={(e) => setMarketId(e.target.value)} aria-label="Mercado do teste">
              {data.pilots.length === 0 && <option value="">Adicione um mercado de teste primeiro</option>}
              {data.pilots.map((p) => <option key={p.marketId} value={p.marketId}>{p.name}</option>)}
            </select></label>
          <fieldset className="flex flex-col gap-1"><legend className={LABEL}>Tarefa</legend>
            <div className="flex flex-wrap gap-2">
              {([['CHAT', 'Pergunta no chat'], ['EXPLAIN', 'Por quê? de oportunidade'], ['JEV', 'Decisão do Jev']] as const).map(([k, l]) => (
                <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${task === k ? 'border-green-600 bg-green-50' : 'border-slate-300'}`}>
                  <input type="radio" name="task" className="accent-green-600" checked={task === k} onChange={() => { setTask(k); setInput(examples[k]); }} />{l}</label>
              ))}
            </div></fieldset>
        </div>
        {task !== 'EXPLAIN' && (
          <label className="flex flex-col gap-1"><span className={LABEL}>{task === 'JEV' ? 'Pergunta para o Jev classificar' : 'Pergunta do lojista'}</span>
            <textarea className={`${INPUT} h-20 py-2`} value={input} onChange={(e) => setInput(e.target.value)} aria-label="Texto do teste" /></label>
        )}
        {task === 'EXPLAIN' && <p className={HINT}>Usa a oportunidade aberta de maior prioridade do mercado.</p>}
        <div><Button type="submit" disabled={busy || !marketId}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Rodar teste</Button></div>
      </form>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {result && (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="Resultado do teste">
          <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <li><span className={HINT}>Camada</span><strong className="block">{result.camada}</strong></li>
            <li><span className={HINT}>Portão</span><strong className="block">{result.portao}</strong></li>
            <li><span className={HINT}>Tokens (entrada / saída)</span><strong className="block tabular-nums">{result.tokensEntrada ?? 0} / {result.tokensSaida ?? 0}</strong></li>
            <li><span className={HINT}>Custo · tempo</span><strong className="block tabular-nums">{brl(num(result.custoBrl))} · {result.tempoMs} ms</strong></li>
          </ul>
          {result.oportunidade && <p className="text-sm text-slate-600">Oportunidade: {result.oportunidade}</p>}
          {result.consultas && result.consultas.length > 0 && <p className="text-sm text-slate-600">Consultas usadas: {result.consultas.join(', ')}</p>}
          <pre className={`whitespace-pre-wrap rounded-lg bg-white p-3 font-sans text-sm ${result.sucesso ? 'text-slate-900' : 'text-red-700'}`}>
            {typeof result.resposta === 'string' ? result.resposta : JSON.stringify(result.resposta, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
};

// ── Uso e sombra ────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

const Table: React.FC<{ rows: Row[]; cols: Array<[string, string, (v: unknown) => string]>; caption: string }> = ({ rows, cols, caption }) => (
  <>
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-xs text-slate-500"><tr>{cols.map(([, label]) => <th key={label} className="py-1 pr-3 font-medium">{label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i} className="border-t border-slate-100">{cols.map(([k, label, f]) => <td key={label} className="py-1.5 pr-3 tabular-nums">{f(r[k])}</td>)}</tr>)}
          {rows.length === 0 && <tr><td colSpan={cols.length} className="py-2 text-slate-500">Sem dados no período.</td></tr>}
        </tbody>
      </table>
    </div>
    <ul className="flex flex-col gap-2 sm:hidden" aria-label={caption}>
      {rows.map((r, i) => (
        <li key={i} className="rounded-xl border border-slate-200 p-3 text-sm">
          <p className="break-words font-medium text-slate-900">{cols[0][2](r[cols[0][0]])}</p>
          <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {cols.slice(1).map(([k, label, f]) => (
              <div key={label} className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="break-words tabular-nums text-slate-800">{f(r[k])}</dd></div>
            ))}
          </dl>
        </li>
      ))}
      {rows.length === 0 && <li className="text-sm text-slate-500">Sem dados no período.</li>}
    </ul>
  </>
);

const dayLabel = (v: unknown) => {
  if (v == null) return '—';
  const d = typeof v === 'number' ? new Date(v) : new Date(`${String(v).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('pt-BR');
};

const AcceptLine: React.FC<{ a: Row }> = ({ a }) => {
  const rate = (x: unknown, y: unknown) => (num(y) > 0 ? `${Math.round((num(x) / num(y)) * 100)}%` : '—');
  return (
    <p className="mt-1 text-sm text-slate-600">
      Aceite das decisões dos agentes: {rate(a.aprovadas, a.decididas)} no geral e {rate(a.aprovadas_com_porque, a.decididas_com_porque)} quando o lojista pediu o Por quê?.
    </p>
  );
};

const UsageCard: React.FC<{ usage: Row | null; days: number; setDays: (d: number) => void }> = ({ usage, days, setDays }) => {
  if (!usage) return <section className={CARD}><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></section>;
  const fx = num(usage.cambio);
  const tot = (usage.totais ?? {}) as Row;
  const cost = num(tot.custo_usd) * fx;
  const revenue = num(usage.receitaCentavos) / 100;
  const s = (v: unknown) => String(v ?? '—');
  const n = (v: unknown) => num(v).toLocaleString('pt-BR');
  const money = (v: unknown) => brl(num(v) * fx);
  const pct = (v: unknown) => (v == null ? '—' : `${num(v).toLocaleString('pt-BR')}%`);
  return (
    <section className={`${CARD} flex flex-col gap-5`} aria-labelledby="usage-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="usage-title" className="text-base font-semibold text-slate-900">Uso, custo e modo sombra</h2>
          <p className="text-sm text-slate-600">Só a IA da plataforma (revenda). Custo pelo preço de referência de cada rota.</p></div>
        <select className={`${INPUT} sm:w-44`} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Período">
          {[1, 7, 30, 90].map((d) => <option key={d} value={d}>Últimos {d} dia{d > 1 ? 's' : ''}</option>)}
        </select>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {([['Chamadas', n(tot.chamadas)], ['Custo', brl(cost)], ['Créditos usados', n(tot.creditos)], ['Receita de pacotes', brl(revenue)],
          ['Margem bruta', revenue > 0 ? `${Math.round(((revenue - cost) / revenue) * 100)}%` : '—']] as const).map(([l, v]) => (
          <li key={l} className="rounded-xl border border-slate-200 p-3"><span className={HINT}>{l}</span><span className="block text-lg font-bold tabular-nums">{v}</span></li>
        ))}
      </ul>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Jev em modo sombra</h3>
        <p className={HINT}>Concordância entre o Jev e a referência (a escolha do DeepSeek ou o que o lojista fez). Quando a concordância confiante passar de 90%, dá para tirar a tarefa da sombra.</p>
        <Table caption="Modo sombra" rows={(usage.sombra ?? []) as Row[]} cols={[
          ['tarefa', 'Tarefa', s], ['amostras', 'Amostras', n], ['concordancia', 'Concordância', pct],
          ['concordancia_confiante', 'Concordância (confiantes)', pct], ['amostras_confiantes', 'Amostras confiantes', n],
          ['confianca_media', 'Confiança média', pct], ['tempo_medio_ms', 'Tempo médio (ms)', n]]} />
      </div>
      <div><h3 className="text-sm font-semibold text-slate-900">Custo por tarefa bem resolvida</h3>
        <p className={HINT}>Critério para escolher o modelo de cada tarefa: quanto custa cada resposta que deu certo. Use junto com a taxa de aceite das decisões.</p>
        <Table caption="Custo por modelo" rows={(usage.porModelo ?? []) as Row[]} cols={[
          ['tarefa', 'Tarefa', s], ['provedor', 'Provedor', s], ['modelo', 'Modelo', s], ['chamadas', 'Chamadas', n],
          ['taxa_sucesso', 'Sucesso', pct], ['custo_por_resolvida_usd', 'Custo por resolvida', (v) => (v == null ? '—' : brl(num(v) * fx))],
          ['tempo_medio_ms', 'Tempo médio (ms)', n]]} />
        <AcceptLine a={(usage.aceiteDasDecisoes ?? {}) as Row} /></div>
      <div><h3 className="text-sm font-semibold text-slate-900">Por tarefa</h3>
        <Table caption="Uso por tarefa" rows={(usage.porTarefa ?? []) as Row[]} cols={[
          ['tarefa', 'Tarefa', s], ['camada', 'Camada', (v) => LAYER_LABEL[String(v)] ?? s(v)], ['chamadas', 'Chamadas', n],
          ['tokens_entrada', 'Tokens entrada', n], ['tokens_saida', 'Tokens saída', n], ['custo_usd', 'Custo', money],
          ['creditos', 'Créditos', n], ['tempo_medio_ms', 'Tempo médio (ms)', n]]} /></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div><h3 className="text-sm font-semibold text-slate-900">Por provedor</h3>
          <Table caption="Uso por provedor" rows={(usage.porProvedor ?? []) as Row[]} cols={[['provedor', 'Provedor', s], ['chamadas', 'Chamadas', n], ['custo_usd', 'Custo', money]]} /></div>
        <div><h3 className="text-sm font-semibold text-slate-900">Por mercado</h3>
          <Table caption="Uso por mercado" rows={(usage.porMercado ?? []) as Row[]} cols={[['mercado', 'Mercado', s], ['chamadas', 'Chamadas', n], ['custo_usd', 'Custo', money], ['creditos', 'Créditos', n]]} /></div>
      </div>
      <div><h3 className="text-sm font-semibold text-slate-900">Por dia</h3>
        <Table caption="Uso por dia" rows={(usage.porDia ?? []) as Row[]} cols={[['dia', 'Dia', dayLabel], ['chamadas', 'Chamadas', n], ['custo_usd', 'Custo', money], ['creditos', 'Créditos', n]]} /></div>
    </section>
  );
};

// ── Pacotes e pedidos ───────────────────────────────────────────────────

const PlansOrdersCard: React.FC<{ plans: AiPlanRow[]; onPlans: (p: AiPlanRow[]) => void }> = ({ plans, onPlans }) => {
  const [orders, setOrders] = useState<AiOrderRow[]>([]);
  const [status, setStatus] = useState('PENDING');
  const [draft, setDraft] = useState({ name: '', credits: '', price: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => { aiAdminService.orders(status || undefined).then(setOrders).catch(() => {}); }, [status]);
  useEffect(load, [load]);
  const toCents = (v: string) => Math.round(Number(v.replace(/\./g, '').replace(',', '.')) * 100);
  const addPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try { onPlans(await aiAdminService.savePlan({ name: draft.name, credits: Number(draft.credits), priceCents: toCents(draft.price), active: true, sortOrder: plans.length + 1 })); setDraft({ name: '', credits: '', price: '' }); }
    catch (err) { setMsg({ ok: false, text: errorText(err, 'Não foi possível salvar.') }); }
  };
  const toggle = async (p: AiPlanRow) => onPlans(await aiAdminService.savePlan({ ...p, active: !p.active }));
  const act = async (o: AiOrderRow, a: 'confirm' | 'cancel') => {
    if (!window.confirm(a === 'confirm' ? `Confirmar o pagamento de ${brl(o.amountCents / 100)} de ${o.marketName}?` : 'Cancelar este pedido?')) return;
    try { await (a === 'confirm' ? aiAdminService.confirm(o.id) : aiAdminService.cancel(o.id)); load(); } catch (e) { setMsg({ ok: false, text: errorText(e, 'Erro') }); }
  };
  return (
    <section className={`${CARD} flex flex-col gap-4`} aria-labelledby="plans-title">
      <div><h2 id="plans-title" className="text-base font-semibold text-slate-900">Pacotes de créditos e pedidos</h2>
        <p className="text-sm text-slate-600">O lojista compra pelo Pix na chave da plataforma (a mesma do Confere). Confirme aqui quando o pagamento cair.</p></div>
      <ul className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200">
        {plans.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className={`min-w-0 ${p.active ? '' : 'text-slate-400 line-through'}`}><span className="block font-medium">{p.name}</span>
              <span className="block text-xs text-slate-500">{p.credits} créditos por {brl(p.priceCents / 100)} ({brl(p.priceCents / 100 / p.credits)} por crédito)</span></span>
            <Button size="sm" variant="ghost" onClick={() => toggle(p)}><Power className="h-4 w-4" />{p.active ? 'Desativar' : 'Ativar'}</Button>
          </li>
        ))}
      </ul>
      <form onSubmit={addPlan} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1"><span className={LABEL}>Novo pacote</span><input className={INPUT} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Nome do pacote" /></label>
        <label className="flex flex-col gap-1"><span className={LABEL}>Créditos</span><input className={`${INPUT} w-28`} value={draft.credits} onChange={(e) => setDraft({ ...draft, credits: e.target.value })} aria-label="Créditos do pacote" /></label>
        <label className="flex flex-col gap-1"><span className={LABEL}>Preço (R$)</span><input className={`${INPUT} w-28`} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} aria-label="Preço do pacote" /></label>
        <Button type="submit" variant="secondary" disabled={!draft.name || !draft.credits || !draft.price}><Plus className="h-4 w-4" />Adicionar pacote</Button>
      </form>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">Pedidos</h3>
        <select className={`${INPUT} w-40`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar pedidos">
          <option value="PENDING">Aguardando</option><option value="PAID">Pagos</option><option value="CANCELED">Cancelados</option><option value="">Todos</option>
        </select>
      </div>
      <Table caption="Pedidos de créditos" rows={orders as unknown as Row[]} cols={[
        ['marketName', 'Mercado', (v) => String(v)], ['credits', 'Créditos', (v) => String(v)], ['amountCents', 'Valor', (v) => brl(num(v) / 100)],
        ['txid', 'Identificador', (v) => String(v)], ['createdAt', 'Criado', (v) => when(v as string)], ['status', 'Situação', (v) => ({ PENDING: 'Aguardando', PAID: 'Pago', CANCELED: 'Cancelado' } as Record<string, string>)[String(v)] ?? String(v)]]} />
      {orders.filter((o) => o.status === 'PENDING').map((o) => (
        <div key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-xs">{o.txid}</span>
          <Button size="sm" onClick={() => act(o, 'confirm')}><CheckCircle2 className="h-4 w-4" />Confirmar pagamento</Button>
          <Button size="sm" variant="ghost" onClick={() => act(o, 'cancel')}><XCircle className="h-4 w-4" />Cancelar</Button>
        </div>
      ))}
      <Msg msg={msg} />
    </section>
  );
};

const AUDIT_LABEL: Record<string, string> = {
  AUTONOMY_SAVE: 'Autonomia alterada', CONSOLE: 'Teste no console', FALLBACK_REMOVE: 'Reserva removida', FALLBACK_SAVE: 'Reserva salva',
  ORDER_CANCEL: 'Pedido cancelado', ORDER_CONFIRM: 'Pagamento confirmado', PILOT_ADD: 'Mercado no piloto', PILOT_REMOVE: 'Mercado fora do piloto',
  PLAN_SAVE: 'Pacote salvo', PROVIDER_KEY_REMOVE: 'Chave removida', PROVIDER_SAVE: 'Chave salva', PROVIDER_TEST: 'Chave testada',
  ROUTE_SAVE: 'Tarefa alterada', SETTINGS_SAVE: 'Orçamento ou interruptor', WALLET_ADJUST: 'Saldo ajustado', WALLET_CAP: 'Teto mensal',
  WHATSAPP_CONFIG: 'WhatsApp configurado', WHATSAPP_NOTIFY: 'Avisos enviados',
};

const AuditCard: React.FC = () => {
  const [rows, setRows] = useState<Array<{ actor: string; action: string; detail: string; createdAt: string }>>([]);
  const [shown, setShown] = useState(10);
  useEffect(() => { aiAdminService.audit().then(setRows).catch(() => {}); }, []);
  return (
    <section className={`${CARD} flex flex-col gap-3`} aria-labelledby="audit-title">
      <div>
        <h2 id="audit-title" className="text-base font-semibold text-slate-900">Auditoria do painel</h2>
        <p className="text-sm text-slate-600">Toda alteração feita aqui, com quem fez e quando.</p>
      </div>
      <ul className="flex flex-col divide-y divide-slate-100">
        {rows.slice(0, shown).map((r, i) => (
          <li key={i} className="flex flex-col gap-0.5 py-2 text-sm sm:flex-row sm:items-baseline sm:gap-3">
            <span className="shrink-0 text-xs tabular-nums text-slate-500 sm:w-40">{when(r.createdAt)}</span>
            <span className="min-w-0 flex-1">
              <span className="font-medium text-slate-900">{AUDIT_LABEL[r.action] ?? r.action}</span>
              <span className="ml-2 font-mono text-[11px] text-slate-400">{r.action}</span>
              {r.detail && <span className="block break-words text-slate-600">{r.detail}</span>}
            </span>
            <span className="shrink-0 break-all text-xs text-slate-500 sm:max-w-[14rem] sm:text-right">{r.actor ?? '—'}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="py-2 text-sm text-slate-500">Nada registrado ainda.</li>}
      </ul>
      {rows.length > shown && (
        <div><Button size="sm" variant="secondary" onClick={() => setShown(shown + 20)}>Mostrar mais ({rows.length - shown})</Button></div>
      )}
    </section>
  );
};

// ── Página ──────────────────────────────────────────────────────────────

type Tab = 'comecar' | 'chaves' | 'mercados' | 'uso' | 'ajustes';
const TABS: Array<[Tab, string]> = [['comecar', 'Começar'], ['chaves', 'Chaves e canais'], ['mercados', 'Mercados e créditos'],
  ['uso', 'Uso e testes'], ['ajustes', 'Ajustes']];

const SuperAdminAi: React.FC = () => {
  const [data, setData] = useState<AiOverview | null>(null);
  const [usage, setUsage] = useState<Row | null>(null);
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<Tab>('comecar');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { aiAdminService.overview().then(setData).catch((e) => setError(errorText(e, 'Não foi possível abrir o painel.'))); }, []);
  useEffect(load, [load]);
  // Recarrega ao abrir as abas que mostram uso, para os números não ficarem velhos.
  useEffect(() => { if (tab === 'uso' || tab === 'comecar') aiAdminService.usage(days).then(setUsage).catch(() => {}); }, [days, tab]);
  const patch = useMemo(() => (p: Partial<AiOverview>) => setData((d) => (d ? { ...d, ...p } : d)), []);
  const go = (t: Tab) => { setTab(t); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const providers = data ? [...data.providers].sort((a, b) => PROVIDER_ORDER.indexOf(a.provider) - PROVIDER_ORDER.indexOf(b.provider)) : [];

  return (
    <SuperAdminLayout>
      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">IA e APIs</h1>
          <p className="text-sm text-slate-600">A plataforma compra a IA nos provedores e revende créditos aos mercados. Comece pelo passo a passo.</p>
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {data && !data.settings.encryptionReady && (
          <p role="alert" className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><KeyRound className="h-4 w-4 shrink-0" />O servidor está sem AI_ENCRYPTION_KEY: as chaves não podem ser guardadas.</p>
        )}
        <div className="lg-glass grid grid-cols-2 gap-1 rounded-2xl p-1 sm:flex sm:flex-wrap sm:rounded-full" role="tablist" aria-label="Seções do painel de IA">
          {TABS.map(([k, l], i) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${i === 0 ? 'col-span-2' : ''} ${tab === k ? 'lg-tab-on' : 'lg-tab'}`}>{l}</button>
          ))}
        </div>
        {!data ? <Loader2 className="h-6 w-6 animate-spin text-slate-400" /> : (
          <>
            {tab === 'comecar' && <SetupGuide data={data} usage={usage} onSettings={(s) => patch({ settings: s })} go={go} />}
            {tab === 'chaves' && (<>
              <p className="text-sm text-slate-600">Obrigatórias para começar: DeepSeek e Jev. As outras ligam recursos extras.</p>
              {providers.map((p) => (
                <React.Fragment key={p.provider}>
                  <ProviderCard p={p} encryptionReady={data.settings.encryptionReady} onChange={(rows) => patch({ providers: rows })} />
                  {p.provider === 'WHATSAPP' && <WhatsAppConfigCard encryptionReady={data.settings.encryptionReady} pilots={data.pilots} />}
                </React.Fragment>
              ))}
            </>)}
            {tab === 'mercados' && (<>
              <PilotCard data={data} onPilots={(rows) => patch({ pilots: rows })} refresh={load} />
              <PlansOrdersCard plans={data.plans} onPlans={(p) => patch({ plans: p })} />
            </>)}
            {tab === 'uso' && (<>
              <UsageCard usage={usage} days={days} setDays={setDays} />
              <ConsoleCard data={data} />
            </>)}
            {tab === 'ajustes' && (<>
              <BudgetCard key="orcamento" settings={data.settings} onSaved={(s) => patch({ settings: s })} />
              <RoutesCard routes={data.routes} providers={data.providers} fallbacks={data.fallbacks ?? []}
                onSaved={(rows) => patch({ routes: rows })} onFallbacks={(rows) => patch({ fallbacks: rows })} />
              <AutonomyCard />
              <AuditCard />
            </>)}
          </>
        )}
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminAi;
