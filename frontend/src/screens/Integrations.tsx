import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, BookOpen, Check, KeyRound, Loader2, Mail, Plug, ShieldOff, X } from 'lucide-react';
import Layout from '../components/layout/Layout';
import { ActionHub, Card, Chip, ExplainStrip, PageHero, PanelTitle } from '../components/flow/Flow';
import { useAuth } from '../context/AuthContext';
import { integrationsService, type IntegrationPartner, type IntegrationsOverview, type PartnerCall } from '../services/integrations.service';
import { apiError } from './copilot/shared';

/**
 * Integrações: o dono decide quais ERPs conversam com a loja, com que
 * permissão, e vê tudo o que cada um mandou. Quem não tem ERP integrado pede
 * ao fornecedor do sistema por aqui.
 */

const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca');

const RESOURCE_LABEL: Record<string, string> = {
  products: 'Produtos', suppliers: 'Fornecedores', costs: 'Custos', prices: 'Preços', stock: 'Estoque', receipts: 'Notas de entrada',
  'inbound-products': 'Cadastro pronto (saiu)', 'inbound-receipts': 'Entradas prontas (saiu)',
};

const ScopeDialog: React.FC<{
  partner: { partnerId: string; name: string };
  scopes: Record<string, string>;
  initial: string[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (scopes: string[]) => void;
}> = ({ partner, scopes, initial, busy, onCancel, onConfirm }) => {
  const [chosen, setChosen] = useState<Set<string>>(new Set(initial.length ? initial : Object.keys(scopes)));
  const flip = (k: string) => setChosen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <div role="dialog" aria-modal="true" aria-label={`Autorizar ${partner.name}`}
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,20,15,.45)', display: 'grid', placeItems: 'center', zIndex: 60, padding: 16 }}>
      <Card style={{ maxWidth: 520, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
        <PanelTitle icon={KeyRound} title={`O que o ${partner.name} pode fazer`} sub="Você muda ou revoga quando quiser" />
        <div className="fx-stack" style={{ gap: 8, marginTop: 14 }}>
          {Object.entries(scopes).map(([k, label]) => (
            <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontSize: 15 }}>
              <input type="checkbox" className="fx-check" checked={chosen.has(k)} onChange={() => flip(k)} style={{ marginTop: 2 }} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <p className="fx-muted" style={{ fontSize: 13.5, margin: '12px 0 0' }}>
          Giro, tração, previsão e as recomendações do Tino nunca saem para o ERP.
        </p>
        <div className="fx-actions" style={{ marginTop: 16 }}>
          <button type="button" className="fx-btn dark" disabled={busy || chosen.size === 0} onClick={() => onConfirm([...chosen])}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}Autorizar
          </button>
          <button type="button" className="fx-btn ghost" onClick={onCancel}>Cancelar</button>
        </div>
      </Card>
    </div>
  );
};

const PartnerRow: React.FC<{
  p: IntegrationPartner;
  reciprocityDays: number;
  busy: boolean;
  onAuthorize: () => void;
  onRevoke: () => void;
}> = ({ p, reciprocityDays, busy, onAuthorize, onRevoke }) => (
  <div className="fx-row" style={{ cursor: 'default', alignItems: 'flex-start', flexWrap: 'wrap' }}>
    <span className="fx-icon-tile" style={{ width: 44, height: 44 }}><Plug aria-hidden="true" /></span>
    <span style={{ flex: '1 1 220px', minWidth: 0 }}>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 15.5 }}>{p.name}</b>
        {p.homologated && <Chip tone="lime">Homologado</Chip>}
        {p.suspended && <Chip tone="red">Suspenso</Chip>}
        {p.authorized && (p.receivesInbound ? <Chip tone="green">Troca em dia</Chip> : <Chip tone="amber">Sem envio de estoque e preço há {reciprocityDays}+ dias</Chip>)}
      </span>
      <span className="fx-muted" style={{ display: 'block', fontSize: 13.5, marginTop: 3 }}>
        {p.authorized
          ? `Autorizado em ${when(p.authorizedAt)} · última chamada ${when(p.lastCallAt)} · estoque ${when(p.lastStockAt)} · preços ${when(p.lastPricesAt)}`
          : p.website ? p.website : 'Não autorizado nesta loja'}
      </span>
    </span>
    <span className="fx-actions">
      <button type="button" className={`fx-btn small ${p.authorized ? 'ghost' : 'dark'}`} disabled={busy || p.suspended} onClick={onAuthorize}>
        <KeyRound aria-hidden="true" />{p.authorized ? 'Permissões' : 'Autorizar'}
      </button>
      {p.authorized && (
        <button type="button" className="fx-btn ghost small" disabled={busy} onClick={onRevoke}>
          <ShieldOff aria-hidden="true" />Revogar
        </button>
      )}
    </span>
  </div>
);

const Integrations: React.FC = () => {
  const { marketId } = useAuth();
  const [data, setData] = useState<IntegrationsOverview | null>(null);
  const [calls, setCalls] = useState<PartnerCall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{ partnerId: string; name: string; scopes: string[] } | null>(null);
  const [code, setCode] = useState('');
  const [ask, setAsk] = useState({ erpName: '', vendorEmail: '', note: '' });

  const load = useCallback(async () => {
    if (!marketId) return;
    try {
      const [o, l] = await Promise.all([integrationsService.overview(marketId), integrationsService.log(marketId)]);
      setData(o);
      setCalls(l);
    } catch (e) {
      setError(apiError(e, 'Não foi possível carregar as integrações.'));
    }
  }, [marketId]);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setError(null); setNotice(null);
    try { await fn(); setNotice(ok); await load(); }
    catch (e) { setError(apiError(e, 'Não foi possível concluir agora.')); }
    finally { setBusy(false); }
  };

  const lookup = async () => {
    if (!marketId || !code.trim()) return;
    setBusy(true); setError(null);
    try {
      const p = await integrationsService.lookup(marketId, code.trim());
      setDialog({ partnerId: p.partnerId, name: p.name, scopes: [] });
    } catch (e) {
      setError(apiError(e, 'Nenhum ERP com este código.'));
    } finally {
      setBusy(false);
    }
  };

  const authorized = data?.partners.filter((p) => p.authorized) ?? [];
  const available = data?.partners.filter((p) => !p.authorized) ?? [];

  return (
    <Layout>
      <PageHero
        title={<>Seu ERP e a loja <mark>falando a mesma língua.</mark></>}
        subtitle="O ERP manda estoque, custo e preço; recebe a entrada de mercadoria pronta, lida das notas do Confere."
        side={<ActionHub icon={Plug} label="Ações de integrações" actions={[{ label: 'Documentação para o ERP', icon: BookOpen, to: '/desenvolvedores' }]} />}
      />

      <ExplainStrip items={[
        { icon: ArrowDownToLine, title: 'O ERP envia', text: 'Estoque, custo de compra, preço de venda, notas de entrada e cadastro. Margem e estoque deixam de ser estimativa.' },
        { icon: ArrowUpFromLine, title: 'O ERP recebe', text: 'Cadastro e entrada prontos das notas que o Confere lê, e os pedidos e preços que você aprovar.' },
        { icon: ShieldOff, title: 'Nunca sai', text: 'Giro, tração, sazonalidade, previsão e as recomendações do Tino ficam só aqui.' },
      ]} />

      {error && <p role="alert" className="fx-chip red" style={{ whiteSpace: 'normal', padding: '10px 14px' }}>{error}</p>}
      {notice && <p role="status" className="fx-chip green" style={{ whiteSpace: 'normal', padding: '10px 14px' }}>{notice}</p>}

      {!data ? <Card><Loader2 className="animate-spin" aria-label="Carregando" /></Card> : (
        <>
          <Card>
            <PanelTitle title="ERPs desta loja" sub={authorized.length ? `${authorized.length} autorizado${authorized.length > 1 ? 's' : ''}` : 'Nenhum autorizado ainda'} />
            <div className="fx-stack" style={{ gap: 8, marginTop: 14 }}>
              {[...authorized, ...available].map((p) => (
                <PartnerRow key={p.partnerId} p={p} reciprocityDays={data.reciprocityDays} busy={busy}
                  onAuthorize={() => setDialog({ partnerId: p.partnerId, name: p.name, scopes: p.scopes })}
                  onRevoke={() => { if (marketId && window.confirm(`Revogar o acesso do ${p.name}? Ele para de enviar e de receber dados desta loja.`)) void run(() => integrationsService.revoke(marketId, p.partnerId), 'Acesso revogado.'); }} />
              ))}
              {data.partners.length === 0 && <p className="fx-muted" style={{ margin: 0 }}>Ainda não há ERP homologado na lista. Use o código do seu ERP ou peça a integração abaixo.</p>}
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="fx-field" style={{ flex: '1 1 240px' }}>
                Tem o código que o seu ERP passou?
                <input className="fx-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="mfc_..." aria-label="Código do ERP" />
              </label>
              <button type="button" className="fx-btn ghost" disabled={busy || !code.trim()} onClick={lookup}><KeyRound aria-hidden="true" />Procurar</button>
            </div>
          </Card>

          <Card>
            <PanelTitle icon={Mail} title="Seu ERP ainda não conversa com a loja?" sub="Avisamos o fornecedor do seu sistema: a integração é gratuita para ele" />
            <form className="fx-stack" style={{ gap: 10, marginTop: 14 }} onSubmit={(e) => {
              e.preventDefault();
              if (!marketId) return;
              void run(async () => {
                const r = await integrationsService.requestErp(marketId, { erpName: ask.erpName, vendorEmail: ask.vendorEmail || undefined, note: ask.note || undefined });
                setAsk({ erpName: '', vendorEmail: '', note: '' });
                setNotice(r.emailed ? 'Pedido registrado e enviado ao fornecedor.' : 'Pedido registrado.');
              }, 'Pedido registrado.');
            }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label className="fx-field" style={{ flex: '1 1 200px' }}>Qual é o seu ERP?
                  <input className="fx-input" value={ask.erpName} required maxLength={200} onChange={(e) => setAsk({ ...ask, erpName: e.target.value })} />
                </label>
                <label className="fx-field" style={{ flex: '1 1 220px' }}>E-mail do fornecedor (opcional)
                  <input className="fx-input" type="email" value={ask.vendorEmail} onChange={(e) => setAsk({ ...ask, vendorEmail: e.target.value })} />
                </label>
              </div>
              <label className="fx-field">Recado (opcional)
                <input className="fx-input" value={ask.note} maxLength={1000} onChange={(e) => setAsk({ ...ask, note: e.target.value })} />
              </label>
              <div className="fx-actions">
                <button type="submit" className="fx-btn dark" disabled={busy || !ask.erpName.trim()}><Mail aria-hidden="true" />Pedir a integração</button>
              </div>
            </form>
            {data.requests.length > 0 && (
              <p className="fx-muted" style={{ margin: '12px 0 0', fontSize: 13.5 }}>
                Já pedido: {data.requests.map((r) => `${r.erpName} (${new Date(r.createdAt).toLocaleDateString('pt-BR')}${r.emailed ? ', avisado' : ''})`).join('; ')}
              </p>
            )}
          </Card>

          <Card>
            <PanelTitle title="O que os ERPs mandaram e receberam" sub="As últimas 100 chamadas" />
            {calls.length === 0 ? <p className="fx-muted" style={{ margin: '12px 0 0' }}>Nenhuma chamada ainda.</p> : (
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table className="fx-table" style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ textAlign: 'left', fontSize: 13, color: 'var(--fx-muted)' }}>
                    {['Quando', 'ERP', 'O quê', 'Itens', 'Aceitos', 'Recusados', 'Resultado'].map((h, i) => (
                      <th key={h} style={{ padding: '6px', fontWeight: 650, textAlign: i >= 3 && i <= 5 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {calls.map((c, i) => {
                      const res = c.path.split('/').pop() ?? c.path;
                      return (
                        <tr key={i} style={{ borderTop: '1px solid var(--fx-line)' }}>
                          <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{when(c.at)}</td>
                          <td style={{ padding: '8px 6px' }}>{c.partner}</td>
                          <td style={{ padding: '8px 6px' }}>{RESOURCE_LABEL[res] ?? res}{c.dryRun ? ' (teste)' : ''}</td>
                          <td className="fx-num" style={{ padding: '8px 6px', textAlign: 'right' }}>{c.items}</td>
                          <td className="fx-num" style={{ padding: '8px 6px', textAlign: 'right' }}>{c.accepted}</td>
                          <td className="fx-num" style={{ padding: '8px 6px', textAlign: 'right' }}>{c.rejected}</td>
                          <td style={{ padding: '8px 6px' }}>
                            {c.status === 200 && c.items > 0 && c.accepted === 0 && c.rejected > 0 ? <Chip tone="red">recusado</Chip>
                              : c.status === 200 && c.rejected > 0 ? <Chip tone="amber">parcial</Chip>
                              : c.status === 200 ? <Chip tone="green">ok</Chip> : c.status === 409 ? <Chip tone="amber">troca em atraso</Chip> : c.status === 403 ? <Chip tone="red">sem permissão</Chip> : <Chip tone="red">erro {c.status}</Chip>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="fx-muted" style={{ margin: '12px 0 0', fontSize: 13.5 }}>
              Desenvolvedor do ERP? <Link to="/desenvolvedores">Veja a documentação da API</Link>.
            </p>
          </Card>
        </>
      )}

      {dialog && data && marketId && (
        <ScopeDialog partner={dialog} scopes={data.scopes} initial={dialog.scopes} busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={(scopes) => { void run(() => integrationsService.authorize(marketId, dialog.partnerId, scopes), `${dialog.name} autorizado.`).then(() => setDialog(null)); }} />
      )}
    </Layout>
  );
};

export default Integrations;
