import React, { useEffect, useState } from 'react';
import { BellOff, Copy, KeyRound, MessageCircle, X } from 'lucide-react';
import { useSuppliers } from '../../hooks/useSuppliers';
import { Card, PanelTitle } from '../../components/flow/Flow';
import {
  copilotAgentsService, mcpService, type AutonomyConfig, type CopilotAgentSettings, type CopilotLesson, type CopilotPrefs, type McpKeyRow,
} from '../../services/aiPlatform.service';
import { AGENT, apiError, when } from './shared';

/** "Como ele trabalha": até onde cada agente vai, silêncio, WhatsApp, integrações e o que a loja aprendeu. */

const LEVELS = [
  { value: 0, label: 'Só avisar' },
  { value: 1, label: 'Sugerir' },
  { value: 2, label: 'Deixar pronto' },
  { value: 3, label: 'Fazer sozinho' },
];

const AgentRow: React.FC<{ marketId: string; agent: CopilotAgentSettings; platform: AutonomyConfig | null; onSaved: (a: CopilotAgentSettings[]) => void }> = ({ marketId, agent, platform, onSaved }) => {
  const [form, setForm] = useState(agent);
  const [open, setOpen] = useState(false);
  const [cap, setCap] = useState<string | number>(agent.autonomy.cap ?? '');
  const [dailyCap, setDailyCap] = useState<string | number>(agent.autonomy.dailyCap ?? '');
  const [allowed, setAllowed] = useState<string[]>(agent.autonomy.allowedSuppliers);
  const [accept, setAccept] = useState(false);
  const [state, setState] = useState<string | null>(null);
  const { suppliers } = useSuppliers(form.level === 3 ? marketId : '');
  useEffect(() => setForm(agent), [agent]);
  const canAlone = agent.autonomy.available && !!platform?.enabled;
  const meta = AGENT[agent.agent];
  const Icon = meta?.icon;
  const save = async () => {
    setState('…');
    try {
      onSaved(await copilotAgentsService.saveAgent(marketId, agent.agent, {
        enabled: form.enabled, level: form.level, dailyLimit: form.dailyLimit, minImpact: form.minImpact,
        ...(form.level === 3 ? {
          autonomyCap: cap === '' ? null : Number(cap), autonomyDailyCap: dailyCap === '' ? null : Number(dailyCap),
          allowedSuppliers: allowed, autonomyAccepted: accept,
        } : {}),
      }));
      setState('Salvo.');
    } catch (e) {
      setState(apiError(e, 'Não foi possível salvar.'));
    }
  };
  const id = `agente-${agent.agent}`;
  return (
    <li className="fx-card fx-card-pad" aria-labelledby={id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {Icon && <span className="fx-icon-tile" style={{ width: 40, height: 40 }}><Icon aria-hidden="true" /></span>}
        <b id={id} style={{ flex: 1 }}>{agent.label}</b>
        <button type="button" role="switch" className="fx-switch" aria-checked={form.enabled} onClick={() => setForm({ ...form, enabled: !form.enabled })}
          aria-label={`Ligar o agente ${meta?.label ?? agent.agent}`} />
      </div>
      <div className="fx-seg" role="group" aria-label={`Até onde o ${agent.label} vai`} style={{ flexWrap: 'wrap' }}>
        {LEVELS.filter((l) => l.value < 3 || agent.autonomy.available).map((l) => (
          <button key={l.value} type="button" aria-pressed={form.level === l.value} disabled={l.value === 3 && !canAlone}
            title={l.value === 3 && !canAlone ? 'Ainda não liberado' : undefined}
            onClick={() => setForm({ ...form, level: l.value })}>{l.label}</button>
        ))}
      </div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ alignSelf: 'flex-start', border: 0, background: 'none', padding: 0, color: 'var(--fx-green)', fontWeight: 700, cursor: 'pointer' }}>
        {open ? 'Fechar ajustes' : 'Ajustar'}
      </button>
      {(open || form.level === 3) && (
        <div className="fx-stack" style={{ gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className="fx-field">Avisos por dia, no máximo
              <input type="number" min={0} max={50} value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) })} />
            </label>
            <label className="fx-field">Só avisar a partir de (R$)
              <input type="number" min={0} step={50} value={form.minImpact} onChange={(e) => setForm({ ...form, minImpact: Number(e.target.value) })} />
            </label>
          </div>
          {form.level === 3 && (
            <fieldset className="fx-stack" style={{ gap: 10, border: '1px solid var(--fx-line)', borderRadius: 14, padding: 12 }}>
              <legend style={{ fontWeight: 700, padding: '0 4px' }}>Limites para fazer sozinho</legend>
              <p className="fx-muted" style={{ margin: 0, fontSize: 13.5 }}>O Jev monta o rascunho de pedido sozinho e te avisa. Nada é enviado ao fornecedor. Dá para desfazer em 24 horas ou pausar tudo.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label className="fx-field">Teto por pedido (R$)
                  <input type="number" min={1} step={50} value={cap} onChange={(e) => setCap(e.target.value)} />
                </label>
                <label className="fx-field">Teto por dia (R$)
                  <input type="number" min={1} step={50} value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} />
                </label>
              </div>
              <div role="group" aria-label="Fornecedores permitidos" className="fx-stack" style={{ gap: 6 }}>
                <span className="fx-muted" style={{ fontSize: 13.5 }}>Só com estes fornecedores</span>
                {suppliers.length === 0 && <span className="fx-muted">Nenhum fornecedor cadastrado ainda.</span>}
                {suppliers.map((s) => (
                  <label key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" className="fx-check" checked={allowed.includes(s.id)}
                      onChange={(e) => setAllowed(e.target.checked ? [...allowed, s.id] : allowed.filter((x) => x !== s.id))} />
                    {s.nomeFantasia || s.razaoSocial}
                  </label>
                ))}
              </div>
              {agent.autonomy.acceptedAt ? <p className="fx-muted" style={{ margin: 0, fontSize: 13 }}>Você aceitou em {when(agent.autonomy.acceptedAt)}.</p> : (
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input type="checkbox" className="fx-check" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
                  <span>Aceito que o Copiloto monte o rascunho de pedido sozinho dentro desses limites e me avise.</span>
                </label>
              )}
            </fieldset>
          )}
        </div>
      )}
      <div className="fx-actions">
        <button type="button" className="fx-btn primary small" onClick={save}>Salvar</button>
        {state && <span role="status" className="fx-muted">{state}</span>}
      </div>
    </li>
  );
};

const QuietCard: React.FC<{ marketId: string; prefs: CopilotPrefs }> = ({ marketId, prefs }) => {
  const [form, setForm] = useState({ quietStart: prefs.quietStart.slice(0, 5), quietEnd: prefs.quietEnd.slice(0, 5) });
  const [state, setState] = useState<string | null>(null);
  return (
    <Card>
      <PanelTitle icon={BellOff} title="Horário de silêncio" sub="Nesse horário só chega o que for urgente." />
      <div className="fx-actions" style={{ marginTop: 12 }}>
        <label className="fx-field">Das<input type="time" value={form.quietStart} onChange={(e) => setForm({ ...form, quietStart: e.target.value })} /></label>
        <label className="fx-field">às<input type="time" value={form.quietEnd} onChange={(e) => setForm({ ...form, quietEnd: e.target.value })} /></label>
        <button type="button" className="fx-btn primary small" style={{ alignSelf: 'flex-end' }}
          onClick={async () => { try { await copilotAgentsService.savePrefs(marketId, form); setState('Salvo.'); } catch (e) { setState(apiError(e, 'Não foi possível salvar.')); } }}>
          Salvar horário
        </button>
        {state && <span role="status" className="fx-muted">{state}</span>}
      </div>
    </Card>
  );
};

const WhatsAppCard: React.FC<{ marketId: string; prefs: CopilotPrefs; onSaved: (p: CopilotPrefs) => void }> = ({ marketId, prefs, onSaved }) => {
  const [phone, setPhone] = useState(prefs.whatsappPhone ? prefs.whatsappPhone.replace(/^55/, '') : '');
  const [consent, setConsent] = useState(prefs.whatsappOptIn);
  const [state, setState] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (consent && !phone.replace(/\D/g, '')) { setState('Informe o número com DDD para receber no WhatsApp.'); return; }
    try {
      const p = await copilotAgentsService.savePrefs(marketId, { whatsappPhone: phone, whatsappOptIn: consent });
      onSaved(p);
      setState(p.whatsappOptIn ? 'Pronto: os avisos chegam no seu WhatsApp.' : 'Salvo. Você não recebe avisos no WhatsApp.');
    } catch (err) {
      setState(apiError(err, 'Não foi possível salvar.'));
    }
  };
  return (
    <Card as="section">
      <form onSubmit={save} className="fx-stack" aria-labelledby="whatsapp-titulo">
        <PanelTitle icon={MessageCircle} title={<span id="whatsapp-titulo">Avisos no WhatsApp</span>}
          sub="O resumo do dia e os avisos chegam no seu WhatsApp, com o botão Aprovar." />
        <label className="fx-field">Número com DDD
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(11) 98765-4321" maxLength={20} />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input type="checkbox" className="fx-check" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>Aceito receber avisos do MercadoFlow no WhatsApp. Posso cancelar quando quiser respondendo PARAR.</span>
        </label>
        <div className="fx-actions">
          <button type="submit" className="fx-btn primary small">Salvar WhatsApp</button>
          {state && <span role="status" className="fx-muted">{state}</span>}
        </div>
      </form>
    </Card>
  );
};

const McpCard: React.FC<{ marketId: string }> = ({ marketId }) => {
  const [keys, setKeys] = useState<McpKeyRow[] | null>(null);
  const [tools, setTools] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [state, setState] = useState<string | null>(null);
  const endpoint = `${window.location.origin}/api/v1/mcp`;
  useEffect(() => {
    mcpService.list(marketId).then((r) => { setKeys(r.chaves); setTools(r.ferramentas); }).catch(() => setState('Não foi possível carregar.'));
  }, [marketId]);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await mcpService.create(marketId, name);
      setSecret(r.secret); setCopied(false); setName('');
      setKeys((await mcpService.list(marketId)).chaves); setState(null);
    } catch (err) { setState(apiError(err, 'Não foi possível criar a chave.')); }
  };
  const revoke = async (id: string) => { setKeys(await mcpService.revoke(marketId, id)); };
  return (
    <Card>
      <PanelTitle icon={KeyRound} title="Integração com outros assistentes (MCP)" sub="Deixe o Claude, o ChatGPT ou outro assistente consultar os números da loja, só para leitura." />
      <p style={{ margin: '12px 0 0' }}>Endereço: <span className="fx-num" style={{ background: 'var(--fx-card-2)', borderRadius: 6, padding: '2px 6px', fontSize: 13, userSelect: 'all' }}>{endpoint}</span>
        <span className="fx-muted" style={{ display: 'block', fontSize: 12.5 }}>Cabeçalho: Authorization: Bearer (a chave). {tools.length} consultas disponíveis.</span></p>
      {secret && (
        <div role="status" style={{ background: 'var(--fx-amber-soft)', color: 'var(--fx-amber)', borderRadius: 12, padding: 12, marginTop: 10 }}>
          <b>Copie a chave agora: ela não aparece de novo.</b>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
            <span className="fx-secret" style={{ wordBreak: 'break-all', fontSize: 12.5, userSelect: 'all' }}>{secret}</span>
            <button type="button" className="fx-btn ghost small" onClick={async () => { try { await navigator.clipboard.writeText(secret); setCopied(true); } catch { setCopied(false); } }}>
              <Copy aria-hidden="true" />{copied ? 'Copiada' : 'Copiar'}
            </button>
          </span>
        </div>
      )}
      <form onSubmit={create} className="fx-actions" style={{ marginTop: 12, alignItems: 'flex-end' }}>
        <label className="fx-field" style={{ flex: 1 }}>Nome da integração
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex.: Claude do escritório" />
        </label>
        <button type="submit" className="fx-btn primary small" disabled={!name.trim()}>Criar chave</button>
      </form>
      {state && <p role="alert" style={{ color: 'var(--fx-red)' }}>{state}</p>}
      {keys && keys.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {keys.map((k) => (
            <li key={k.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', color: k.revokedAt ? 'var(--fx-muted)' : undefined }}>
              <b>{k.name}</b><span className="fx-num" style={{ fontSize: 12.5 }}>{k.keyPrefix}…</span>
              <span className="fx-muted" style={{ fontSize: 12.5 }}>{k.revokedAt ? `revogada em ${when(k.revokedAt)}` : k.lastUsedAt ? `${k.calls} consultas, última em ${when(k.lastUsedAt)}` : 'ainda não usada'}</span>
              {!k.revokedAt && <button type="button" className="fx-btn ghost small" style={{ marginLeft: 'auto' }} onClick={() => revoke(k.id)}>Revogar</button>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const HowItWorks: React.FC<{ marketId: string; onClose: () => void; onAloneChange: (v: boolean) => void }> = ({ marketId, onClose, onAloneChange }) => {
  const [agents, setAgents] = useState<CopilotAgentSettings[] | null>(null);
  const [prefs, setPrefs] = useState<CopilotPrefs | null>(null);
  const [lessons, setLessons] = useState<CopilotLesson[]>([]);
  const [platform, setPlatform] = useState<AutonomyConfig | null>(null);
  useEffect(() => {
    copilotAgentsService.agents(marketId).then((r) => { setAgents(r.agentes); setPrefs(r.preferencias); setLessons(r.licoes); setPlatform(r.autonomia); });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [marketId, onClose]);
  return (
    <>
      <div className="fx-shade" onClick={onClose} aria-hidden="true" />
      <aside className="fx-drawer" role="dialog" aria-modal="true" aria-labelledby="como-trabalha">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h2 id="como-trabalha" className="fx-drawer-title">Como ele trabalha</h2>
            <p className="fx-muted" style={{ margin: '4px 0 0' }}>Escolha até onde cada agente vai. Os limites ficam em "Ajustar".</p>
          </div>
          <button type="button" className="fx-btn ghost small" onClick={onClose} aria-label="Fechar"><X aria-hidden="true" /></button>
        </div>
        {!agents || !prefs ? <p className="fx-muted">Carregando…</p> : (
          <>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {agents.map((a) => <AgentRow key={a.agent} marketId={marketId} agent={a} platform={platform}
                onSaved={(rows) => { setAgents(rows); onAloneChange(rows.some((x) => x.level === 3)); }} />)}
            </ul>
            <QuietCard marketId={marketId} prefs={prefs} />
            <WhatsAppCard marketId={marketId} prefs={prefs} onSaved={setPrefs} />
            <McpCard marketId={marketId} />
            <Card aria-labelledby="licoes">
              <h2 id="licoes" className="fx-section-title" style={{ fontSize: 18 }}>O que a loja já aprendeu</h2>
              {lessons.length === 0 ? <p className="fx-muted">Ainda nada. As lições vêm das conferências, do resultado das decisões e do que você recusa.</p> : (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>{lessons.map((l) => <li key={l.id}>{l.text}</li>)}</ul>
              )}
            </Card>
          </>
        )}
      </aside>
    </>
  );
};

export default HowItWorks;
