import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, Play, Plus, Power, Save, Search, Trash2, X, XCircle } from 'lucide-react';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import Button from '../components/common/Button';
import {
  aiAdminService, type AiLedgerRow, type AiOrderRow, type AiOverview, type AiPlanRow, type AiProviderRow, type AiRouteRow,
  type AiSettingsRow, type AiWallet, type ConsoleResult, type ConsoleTask, type WhatsAppConfig,
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

// ── Visão geral ─────────────────────────────────────────────────────────

const StatusCard: React.FC<{ data: AiOverview; usage: Record<string, unknown> | null; onSettings: (s: AiSettingsRow) => void }> = ({ data, usage, onSettings }) => {
  const s = data.settings;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = async (patch: Partial<AiSettingsRow>) => {
    setBusy(true);
    setMsg(null);
    try { onSettings(await aiAdminService.saveSettings(patch)); } catch (e) { setMsg({ ok: false, text: errorText(e, 'Não foi possível salvar.') }); } finally { setBusy(false); }
  };
  const deepseek = data.providers.find((p) => p.provider === 'DEEPSEEK');
  const jev = data.providers.find((p) => p.provider === 'JEV');
  const spent = num(usage?.gastoHojeUsd);
  const budget = num(s.dailyBudgetUsd);
  const checklist: Array<[string, boolean]> = [
    ['Chave mestra de criptografia no servidor', s.encryptionReady],
    ['Chave do DeepSeek cadastrada e testada', !!deepseek?.configured && !!deepseek?.lastCheckOk],
    ['Chave do Jev cadastrada e testada (para o modo sombra)', !!jev?.configured && !!jev?.lastCheckOk],
    ['Pelo menos um mercado de teste', data.pilots.length > 0],
    ['IA da plataforma ligada', s.enabled],
  ];
  return (
    <section className={`${CARD} flex flex-col gap-4`} aria-labelledby="status-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="status-title" className="text-base font-semibold text-slate-900">IA da plataforma</h2>
          <p className="text-sm text-slate-600">Liga ou desliga o uso da chave da plataforma em todos os mercados. Desligada, todos ficam com o texto pronto do sistema.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-semibold ${s.enabled ? 'text-green-700' : 'text-slate-500'}`}>{s.enabled ? 'Ligada' : 'Desligada'}</span>
          <Toggle on={s.enabled} onChange={(v) => set({ enabled: v })} label="Ligar a IA da plataforma" disabled={busy} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3">
        <Toggle on={s.pilotOnly} onChange={(v) => set({ pilotOnly: v })} label="Só mercados de teste" disabled={busy} />
        <span className="text-sm text-slate-700">{s.pilotOnly ? 'Só os mercados de teste usam a IA (recomendado no começo)' : 'Todos os mercados com créditos usam a IA'}</span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-3">
        <li className="rounded-xl border border-slate-200 p-3"><span className={HINT}>Gasto de hoje</span>
          <span className="block text-lg font-bold tabular-nums">{usd(spent)}</span>
          <span className={`${HINT} ${spent >= budget ? 'font-semibold text-red-700' : ''}`}>teto diário {usd(budget)}{spent >= budget ? ': IA em pausa' : ''}</span></li>
        <li className="rounded-xl border border-slate-200 p-3"><span className={HINT}>Mercados de teste</span>
          <span className="block text-lg font-bold tabular-nums">{data.pilots.length}</span></li>
        <li className="rounded-xl border border-slate-200 p-3"><span className={HINT}>Saldo DeepSeek (último teste)</span>
          <span className="block text-lg font-bold tabular-nums">{deepseek?.lastCheckOk ? 'ok' : '—'}</span>
          <span className={HINT}>Veja em Chaves → Testar</span></li>
      </ul>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Para começar os testes</h3>
        <ol className="mt-2 flex flex-col gap-1.5">
          {checklist.map(([label, done], i) => (
            <li key={label} className="flex items-center gap-2 text-sm">
              {done ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <span className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-500">{i + 1}</span>}
              <span className={done ? 'text-slate-500 line-through' : 'text-slate-800'}>{label}</span>
            </li>
          ))}
        </ol>
      </div>
      <Msg msg={msg} />
    </section>
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
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(p.baseUrl);
  const [model, setModel] = useState(p.defaultModel ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async (enabled?: boolean) => {
    setBusy('save');
    setMsg(null);
    try {
      onChange(await aiAdminService.saveProvider(p.provider, { apiKey: apiKey.trim() || undefined, baseUrl, model, enabled }));
      setApiKey('');
      setMsg({ ok: true, text: 'Salvo.' });
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
    try { onChange(await aiAdminService.removeKey(p.provider)); } catch (e) { setMsg({ ok: false, text: errorText(e, 'Não foi possível remover.') }); }
  };
  return (
    <section className={`${CARD} flex flex-col gap-3`} aria-label={info.name}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{info.name}</h3>
          <p className="text-sm text-slate-600">{info.use}</p>
          <p className={HINT}>
            {p.configured ? <>Chave terminando em <span className="font-mono">{p.keyHint}</span></> : 'Sem chave'}
            {p.lastCheckAt ? <> · último teste {when(p.lastCheckAt)}: {p.lastCheckOk ? 'ok' : `falhou (${p.lastCheckError ?? ''})`}</> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${p.enabled ? 'text-green-700' : 'text-slate-500'}`}>{p.enabled ? 'Ligado' : 'Desligado'}</span>
          <Toggle on={p.enabled} onChange={(v) => save(v)} label={`Ligar ${info.name}`} disabled={!p.configured || !!busy} />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1"><span className={LABEL}>{p.configured ? 'Trocar a chave' : 'Chave de API'}</span>
          <input className={`${INPUT} font-mono`} type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder={p.configured ? 'deixe vazio para manter' : 'cole a chave aqui'} aria-label={`Chave de API de ${info.name}`} disabled={!encryptionReady} />
          <a href={info.keyUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-green-700 hover:underline">Onde criar a chave</a></label>
        <label className="flex flex-col gap-1"><span className={LABEL}>Endereço</span>
          <select className={INPUT} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} aria-label={`Endereço de ${info.name}`}>
            {p.allowedBaseUrls.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <span className={HINT}>Lista fixa: a chave nunca vai para outro servidor.</span></label>
        <label className="flex flex-col gap-1"><span className={LABEL}>{p.provider === 'WHATSAPP' ? 'ID do número (Phone number ID)' : 'Modelo padrão'}</span>
          <input className={`${INPUT} font-mono`} value={model} onChange={(e) => setModel(e.target.value)}
            aria-label={p.provider === 'WHATSAPP' ? 'ID do número do WhatsApp' : `Modelo padrão de ${info.name}`} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => save()} disabled={!!busy || !encryptionReady}>{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar</Button>
        <Button variant="secondary" onClick={test} disabled={!!busy || !p.configured}>{busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Testar</Button>
        {p.configured && <Button variant="ghost" onClick={remove} disabled={!!busy}><Trash2 className="h-4 w-4" />Remover chave</Button>}
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
        <span className="ml-1 select-all rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{WEBHOOK_URL}</span></p>
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

const RouteRow: React.FC<{ r: AiRouteRow; providers: AiProviderRow[]; onSaved: (rows: AiRouteRow[]) => void }> = ({ r, providers, onSaved }) => {
  const [f, setF] = useState({ ...r });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setF({ ...r }); }, [r]);
  const dirty = JSON.stringify(f) !== JSON.stringify(r);
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
  const small = (k: keyof AiRouteRow, label: string, w = 'w-20') => (
    <input className={`${INPUT} ${w} px-2 text-right tabular-nums`} aria-label={`${label} de ${r.label}`} value={String(f[k] ?? '')}
      onChange={(e) => setF({ ...f, [k]: e.target.value })} />
  );
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="py-2 pr-3"><span className="block font-medium text-slate-900">{r.label}</span><span className="font-mono text-xs text-slate-500">{r.task}</span>
        {r.notes && <span className="mt-0.5 block text-xs text-slate-500">{r.notes}</span>}</td>
      <td className="pr-2"><select className={`${INPUT} w-32`} value={f.layer} aria-label={`Camada de ${r.label}`} onChange={(e) => setF({ ...f, layer: e.target.value as AiRouteRow['layer'] })}>
        {Object.entries(LAYER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
      <td className="pr-2"><select className={`${INPUT} w-32`} value={f.provider ?? ''} aria-label={`Provedor de ${r.label}`} onChange={(e) => setF({ ...f, provider: e.target.value })}>
        {providers.map((p) => <option key={p.provider} value={p.provider}>{PROVIDER_INFO[p.provider]?.name ?? p.provider}</option>)}</select>
        <input className={`${INPUT} mt-1 w-32 font-mono`} value={f.model ?? ''} aria-label={`Modelo de ${r.label}`} placeholder="padrão do provedor" onChange={(e) => setF({ ...f, model: e.target.value })} /></td>
      <td className="pr-2">{small('maxContextTokens', 'Teto de contexto')}<span className={`${HINT} block`}>contexto</span>{small('maxOutputTokens', 'Teto de saída')}<span className={`${HINT} block`}>saída</span></td>
      <td className="pr-2">{small('creditsPerUse', 'Créditos por uso', 'w-16')}</td>
      <td className="pr-2">{small('inputPriceUsdM', 'Preço de entrada')}<span className={`${HINT} block`}>entrada/M</span>{small('outputPriceUsdM', 'Preço de saída')}<span className={`${HINT} block`}>saída/M</span></td>
      <td className="pr-2">{small('jevThreshold', 'Limite de confiança do Jev', 'w-16')}</td>
      <td className="pr-2"><div className="flex flex-col gap-2 pt-2">
        <label className="flex items-center gap-2 text-xs"><Toggle on={f.shadow} onChange={(v) => setF({ ...f, shadow: v })} label={`Modo sombra de ${r.label}`} />sombra</label>
        <label className="flex items-center gap-2 text-xs"><Toggle on={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} label={`Ligar ${r.label}`} />ligada</label></div></td>
      <td className="pt-1"><Button size="sm" onClick={save} disabled={!dirty}>Salvar</Button><Msg msg={msg} /></td>
    </tr>
  );
};

const RoutesCard: React.FC<{ routes: AiRouteRow[]; providers: AiProviderRow[]; onSaved: (rows: AiRouteRow[]) => void }> = ({ routes, providers, onSaved }) => (
  <section className={`${CARD} flex flex-col gap-3`} aria-labelledby="routes-title">
    <div>
      <h2 id="routes-title" className="text-base font-semibold text-slate-900">Roteamento por tarefa</h2>
      <p className="text-sm text-slate-600">Qual camada atende cada tarefa. Texto pronto não gasta nada; Jev decide por frações de centavo; Flash e Pro escrevem. Muda na hora, sem deploy.</p>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-left text-sm">
        <caption className="sr-only">Rotas de IA por tarefa</caption>
        <thead className="text-xs text-slate-500"><tr>
          <th className="py-1 pr-3">Tarefa</th><th>Camada</th><th>Provedor e modelo</th><th>Tokens</th><th>Créditos</th><th>Preço US$</th><th>Confiança Jev</th><th>Estado</th><th />
        </tr></thead>
        <tbody>{routes.map((r) => <RouteRow key={r.task} r={r} providers={providers} onSaved={onSaved} />)}</tbody>
      </table>
    </div>
  </section>
);

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
              {([['CHAT', 'Pergunta no chat'], ['EXPLAIN', 'Por quê? de uma oportunidade'], ['JEV', 'Decisão do Jev']] as const).map(([k, l]) => (
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
  <div className="overflow-x-auto">
    <table className="w-full text-left text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="text-xs text-slate-500"><tr>{cols.map(([, label]) => <th key={label} className="py-1 pr-3">{label}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => <tr key={i} className="border-t border-slate-100">{cols.map(([k, label, f]) => <td key={label} className="py-1.5 pr-3 tabular-nums">{f(r[k])}</td>)}</tr>)}
        {rows.length === 0 && <tr><td colSpan={cols.length} className="py-2 text-slate-500">Sem dados no período.</td></tr>}
      </tbody>
    </table>
  </div>
);

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
        <select className={`${INPUT} w-40`} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Período">
          {[1, 7, 30, 90].map((d) => <option key={d} value={d}>Últimos {d} dia{d > 1 ? 's' : ''}</option>)}
        </select>
      </div>
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-5">
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
        <Table caption="Uso por dia" rows={(usage.porDia ?? []) as Row[]} cols={[['dia', 'Dia', (v) => (v ? new Date(`${String(v)}T12:00`).toLocaleDateString('pt-BR') : '—')], ['chamadas', 'Chamadas', n], ['custo_usd', 'Custo', money], ['creditos', 'Créditos', n]]} /></div>
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
            <span className={p.active ? '' : 'text-slate-400 line-through'}><span className="font-medium">{p.name}</span> · {p.credits} créditos · {brl(p.priceCents / 100)} · {brl(p.priceCents / 100 / p.credits)} por crédito</span>
            <Button size="sm" variant="ghost" onClick={() => toggle(p)}><Power className="h-4 w-4" />{p.active ? 'Desativar' : 'Ativar'}</Button>
          </li>
        ))}
      </ul>
      <form onSubmit={addPlan} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1"><span className={LABEL}>Novo pacote</span><input className={INPUT} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Nome do pacote" /></label>
        <label className="flex flex-col gap-1"><span className={LABEL}>Créditos</span><input className={`${INPUT} w-28`} value={draft.credits} onChange={(e) => setDraft({ ...draft, credits: e.target.value })} aria-label="Créditos do pacote" /></label>
        <label className="flex flex-col gap-1"><span className={LABEL}>Preço (R$)</span><input className={`${INPUT} w-28`} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} aria-label="Preço do pacote" /></label>
        <Button type="submit" variant="secondary" disabled={!draft.name || !draft.credits || !draft.price}><Plus className="h-4 w-4" />Adicionar</Button>
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

const AuditCard: React.FC = () => {
  const [rows, setRows] = useState<Array<{ actor: string; action: string; detail: string; createdAt: string }>>([]);
  useEffect(() => { aiAdminService.audit().then(setRows).catch(() => {}); }, []);
  return (
    <section className={`${CARD} flex flex-col gap-3`} aria-labelledby="audit-title">
      <h2 id="audit-title" className="text-base font-semibold text-slate-900">Auditoria do painel</h2>
      <Table caption="Auditoria" rows={rows as unknown as Row[]} cols={[['createdAt', 'Quando', (v) => when(v as string)], ['actor', 'Quem', (v) => String(v ?? '—')], ['action', 'Ação', (v) => String(v)], ['detail', 'Detalhe', (v) => String(v ?? '')]]} />
    </section>
  );
};

// ── Página ──────────────────────────────────────────────────────────────

type Tab = 'geral' | 'chaves' | 'rotas' | 'piloto' | 'console' | 'uso' | 'pacotes' | 'auditoria';
const TABS: Array<[Tab, string]> = [['geral', 'Visão geral'], ['chaves', 'Chaves'], ['rotas', 'Roteamento'], ['piloto', 'Piloto e carteiras'],
  ['console', 'Console'], ['uso', 'Uso e sombra'], ['pacotes', 'Pacotes e pedidos'], ['auditoria', 'Auditoria']];

const SuperAdminAi: React.FC = () => {
  const [data, setData] = useState<AiOverview | null>(null);
  const [usage, setUsage] = useState<Row | null>(null);
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<Tab>('geral');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { aiAdminService.overview().then(setData).catch((e) => setError(errorText(e, 'Não foi possível abrir o painel.'))); }, []);
  useEffect(load, [load]);
  // Recarrega ao abrir as abas que mostram uso, para os números não ficarem velhos.
  useEffect(() => { if (tab === 'uso' || tab === 'geral') aiAdminService.usage(days).then(setUsage).catch(() => {}); }, [days, tab]);
  const patch = useMemo(() => (p: Partial<AiOverview>) => setData((d) => (d ? { ...d, ...p } : d)), []);

  return (
    <SuperAdminLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">IA e APIs</h1>
          <p className="text-sm text-slate-600">Chaves da plataforma, roteamento por tarefa, orçamento, mercados de teste e console. A plataforma compra os créditos nos provedores e revende pacotes aos mercados.</p>
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {data && !data.settings.encryptionReady && (
          <p role="alert" className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><KeyRound className="h-4 w-4" />O servidor está sem AI_ENCRYPTION_KEY: as chaves não podem ser guardadas.</p>
        )}
        <div className="lg-glass flex gap-1 overflow-x-auto rounded-full p-1 [scrollbar-width:none]" role="tablist" aria-label="Seções do painel de IA">
          {TABS.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${tab === k ? 'lg-tab-on' : 'lg-tab'}`}>{l}</button>
          ))}
        </div>
        {!data ? <Loader2 className="h-6 w-6 animate-spin text-slate-400" /> : (
          <>
            {tab === 'geral' && (<>
              <StatusCard data={data} usage={usage} onSettings={(s) => patch({ settings: s })} />
              <BudgetCard key="orcamento" settings={data.settings} onSaved={(s) => patch({ settings: s })} />
            </>)}
            {tab === 'chaves' && data.providers.map((p) => (
              <ProviderCard key={p.provider} p={p} encryptionReady={data.settings.encryptionReady} onChange={(rows) => patch({ providers: rows })} />
            ))}
            {tab === 'chaves' && <WhatsAppConfigCard encryptionReady={data.settings.encryptionReady} pilots={data.pilots} />}
            {tab === 'rotas' && <RoutesCard routes={data.routes} providers={data.providers} onSaved={(rows) => patch({ routes: rows })} />}
            {tab === 'piloto' && <PilotCard data={data} onPilots={(rows) => patch({ pilots: rows })} refresh={load} />}
            {tab === 'console' && <ConsoleCard data={data} />}
            {tab === 'uso' && <UsageCard usage={usage} days={days} setDays={setDays} />}
            {tab === 'pacotes' && <PlansOrdersCard plans={data.plans} onPlans={(p) => patch({ plans: p })} />}
            {tab === 'auditoria' && <AuditCard />}
          </>
        )}
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminAi;
