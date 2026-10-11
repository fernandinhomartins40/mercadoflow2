import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, Megaphone, Network, Plus, Save, Send, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import SellerLayout, { useSeller } from './SellerLayout';
import { Card, Chip, ExplainStrip, Forest, PageHero, PanelTitle } from '../../components/flow/Flow';
import { confirmDialog } from '../../components/common/Dialogs';
import {
  AUDIENCE_LABEL, BARRED_LABEL, brlCents, brlPrice, sellerService, type Audience, type CampaignDetail, type CampaignPreview,
} from '../../services/commerce.service';
import { Drawer, OrderChip, dateOnly, dateTime, field, grid, inDays, splitList, tableStyle, tdStyle, thStyle, useAction, useLoad } from './ui';

const STATUS: Record<string, { label: string; tone: 'green' | 'amber' | 'gray' | 'red' }> = {
  RASCUNHO: { label: 'Rascunho', tone: 'amber' },
  ENVIADA: { label: 'No ar', tone: 'green' },
  ENCERRADA: { label: 'Encerrada', tone: 'gray' },
  CANCELADA: { label: 'Cancelada', tone: 'gray' },
};

interface Draft {
  id: string | null;
  title: string;
  message: string;
  targetType: 'PUBLICO' | 'NOMINAL';
  ufs: string;
  cities: string;
  audience: Audience;
  validFrom: string;
  validUntil: string;
  marketIds: string[];
  items: { gtin: string; unitPrice: string; minQuantity: string }[];
}

const blank = (): Draft => ({ id: null, title: '', message: '', targetType: 'PUBLICO', ufs: '', cities: '', audience: 'TODAS', validFrom: inDays(0),
  validUntil: inDays(30), marketIds: [], items: [{ gtin: '', unitPrice: '', minQuantity: '' }] });

const Campaigns: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const list = useLoad(() => sellerService.campaigns());
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(params.get('nova') ? blank() : null);
  useEffect(() => { if (params.get('nova')) { params.delete('nova'); setParams(params, { replace: true }); } }, [params, setParams]);

  return (
    <>
      <PageHero title={<>Campanhas para as lojas</>}
        subtitle="Uma condição especial com prazo. Para um público, a plataforma entrega sem dizer quais lojas receberam; pelo nome, só para lojas que autorizaram a sua empresa."
        side={<button type="button" className="fx-btn lime" onClick={() => setDraft(blank())}><Plus aria-hidden="true" />Nova campanha</button>} />
      <Card>
        <PanelTitle icon={Megaphone} title="Suas campanhas" />
        {!list.data ? <p className="fx-muted">Carregando…</p> : list.data.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Nenhuma campanha ainda.</p> : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={tableStyle}>
              <thead><tr><th style={thStyle}>Campanha</th><th style={thStyle}>Público</th><th style={thStyle}>Validade</th><th style={thStyle}>Lojas</th><th style={thStyle}>Pedidos</th><th style={thStyle}>Situação</th><th style={thStyle} /></tr></thead>
              <tbody>
                {list.data.map((c) => (
                  <tr key={c.id}>
                    <td style={tdStyle}><b>{c.title}</b><br /><small className="fx-muted">{c.number} · {c.items} produto(s)</small></td>
                    <td style={tdStyle}>{c.target_type === 'NOMINAL' ? 'Lojas escolhidas' : AUDIENCE_LABEL[c.target?.audience ?? 'TODAS']}
                      {c.target_type === 'PUBLICO' && (c.target?.ufs?.length || c.target?.cities?.length)
                        ? <><br /><small className="fx-muted">{[c.target?.ufs?.join(', '), c.target?.cities?.length ? `${c.target.cities.length} cidade(s)` : ''].filter(Boolean).join(' e ')}</small></> : null}</td>
                    <td style={tdStyle}>{dateOnly(c.valid_from)} a {dateOnly(c.valid_until)}</td>
                    <td style={tdStyle}>{c.status === 'RASCUNHO' ? '—' : c.delivered}</td>
                    <td style={tdStyle}>{c.status === 'RASCUNHO' ? '—' : c.ordered}</td>
                    <td style={tdStyle}><Chip tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Chip></td>
                    <td style={tdStyle}><button type="button" className="fx-btn ghost small" onClick={() => setOpenId(c.id)}>Abrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <ExplainStrip items={[
        { icon: ShieldCheck, title: 'Público mínimo', text: 'Para um público, a campanha só sai se alcançar várias lojas. Assim a contagem nunca aponta uma loja.' },
        { icon: Network, title: 'Contratos respeitados', text: 'Onde a sua indústria tem distribuidor exclusivo, a campanha chega à loja pelo distribuidor, e o pedido vai para ele.' },
        { icon: Eye, title: 'Nome só com pedido', text: 'Você conhece a loja quando ela pede, ou quando ela autoriza a sua empresa a vê-la pelo nome.' },
      ]} />

      {openId && <CampaignDrawer id={openId} onClose={() => { setOpenId(null); void list.reload(); }} onEdit={(d) => { setOpenId(null); setDraft(d); }} />}
      {draft && <Editor draft={draft} onClose={() => setDraft(null)} onSaved={(id) => { setDraft(null); setOpenId(id); void list.reload(); }} />}
    </>
  );
};

const toDraft = (c: CampaignDetail): Draft => ({
  id: c.id, title: c.title, message: c.message ?? '', targetType: c.target_type, ufs: c.target?.ufs?.join(', ') ?? '', cities: c.target?.cities?.join(', ') ?? '',
  audience: c.target?.audience ?? 'TODAS', validFrom: c.valid_from.slice(0, 10), validUntil: c.valid_until.slice(0, 10), marketIds: c.targets.map((t) => t.id),
  items: c.items.map((i) => ({ gtin: i.gtin, unitPrice: String(i.unit_price).replace('.', ','), minQuantity: String(i.min_quantity) })),
});

const Editor: React.FC<{ draft: Draft; onClose: () => void; onSaved: (id: string) => void }> = ({ draft: initial, onClose, onSaved }) => {
  const { me } = useSeller();
  const [d, setD] = useState(initial);
  const products = useLoad(() => sellerService.products());
  const clients = useLoad(() => sellerService.clients());
  const act = useAction();
  const authorized = (clients.data ?? []).filter((c) => c.authorized);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await act.run(() => sellerService.saveCampaign(d.id, {
      title: d.title, message: d.message, targetType: d.targetType, validFrom: d.validFrom, validUntil: d.validUntil, marketIds: d.marketIds,
      target: { ufs: splitList(d.ufs), cities: splitList(d.cities), audience: d.audience },
      items: d.items.filter((i) => i.gtin).map((i) => ({ gtin: i.gtin, unitPrice: i.unitPrice.replace(',', '.'), minQuantity: i.minQuantity || undefined })),
    }));
    if (r) onSaved(r.id);
  };
  const setItem = (i: number, v: Partial<Draft['items'][number]>) => { const items = [...d.items]; items[i] = { ...items[i], ...v }; setD({ ...d, items }); };

  return (
    <Drawer title={d.id ? 'Editar campanha' : 'Nova campanha'} onClose={onClose} wide>
      <form style={{ display: 'grid', gap: 12 }} onSubmit={save}>
        {field('Título', <input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} required maxLength={120} placeholder="Ex.: Páscoa com 12% abaixo da tabela" />)}
        {field('Mensagem para a loja', <textarea rows={3} value={d.message} onChange={(e) => setD({ ...d, message: e.target.value })} maxLength={2000} />)}
        <div style={grid(170)}>
          {field('Vale de', <input type="date" value={d.validFrom} onChange={(e) => setD({ ...d, validFrom: e.target.value })} required />)}
          {field('Vale até', <input type="date" value={d.validUntil} onChange={(e) => setD({ ...d, validUntil: e.target.value })} required />, 'Até 120 dias.')}
          {field('Para quem', <select value={d.targetType} onChange={(e) => setD({ ...d, targetType: e.target.value as Draft['targetType'] })}>
            <option value="PUBLICO">Um público (sem identificar as lojas)</option><option value="NOMINAL">Lojas escolhidas pelo nome</option>
          </select>)}
        </div>
        {d.targetType === 'PUBLICO' ? (
          <div style={grid(170)}>
            {field('Público', <select value={d.audience} onChange={(e) => setD({ ...d, audience: e.target.value as Audience })}>
              {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
            </select>, d.audience === 'RUPTURA' ? 'Vendiam nas 4 semanas anteriores e não venderam na última.' : d.audience !== 'TODAS' ? 'Pelas vendas dos últimos 28 dias.' : undefined)}
            {field('UFs', <input value={d.ufs} onChange={(e) => setD({ ...d, ufs: e.target.value })} placeholder="SP, MG" />, 'Em branco: todo o Brasil que você atende.')}
            {field('Cidades (código IBGE)', <input value={d.cities} onChange={(e) => setD({ ...d, cities: e.target.value })} placeholder="3509502" />)}
          </div>
        ) : (
          <fieldset style={{ border: '1px solid var(--fx-line)', borderRadius: 12, padding: 12 }}>
            <legend className="fx-muted" style={{ padding: '0 6px' }}>Lojas que autorizaram {me?.name ?? 'a sua empresa'}</legend>
            {authorized.length === 0 ? <p className="fx-muted" style={{ margin: 0 }}>Nenhuma loja autorizou ainda. Use um público.</p> : authorized.map((c) => (
              <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
                <input type="checkbox" checked={d.marketIds.includes(c.id)} onChange={(e) => setD({ ...d, marketIds: e.target.checked ? [...d.marketIds, c.id] : d.marketIds.filter((m) => m !== c.id) })} />
                {c.name} <span className="fx-muted">{c.city ? `· ${c.city} (${c.uf})` : ''}</span>
              </label>
            ))}
          </fieldset>
        )}

        <PanelTitle title="Produtos e preço da campanha" />
        {d.items.map((it, i) => {
          const p = products.data?.find((x) => x.gtin === it.gtin);
          return (
            <div key={i} style={grid(150)}>
              {field('Produto', <select value={it.gtin} onChange={(e) => setItem(i, { gtin: e.target.value })} required>
                <option value="">Escolha</option>
                {(products.data ?? []).filter((x) => x.status === 'ATIVO').map((x) => <option key={x.gtin} value={x.gtin}>{x.name}</option>)}
              </select>, p ? `Preço base ${brlPrice(p.base_price)}` : undefined)}
              {field('Preço na campanha', <input value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: e.target.value })} inputMode="decimal" required />)}
              {field('Mínimo', <input value={it.minQuantity} onChange={(e) => setItem(i, { minQuantity: e.target.value })} inputMode="decimal" placeholder={p ? String(p.min_quantity) : ''} />)}
              <button type="button" className="fx-btn ghost small" aria-label="Tirar produto" onClick={() => setD({ ...d, items: d.items.filter((_, j) => j !== i) })}><Trash2 aria-hidden="true" /></button>
            </div>
          );
        })}
        <button type="button" className="fx-btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setD({ ...d, items: [...d.items, { gtin: '', unitPrice: '', minQuantity: '' }] })}><Plus aria-hidden="true" />Adicionar produto</button>
        <p className="fx-muted" style={{ margin: 0 }}>Você define o preço de venda à loja. O preço de revenda ao consumidor é sempre decisão da loja.</p>
        <button type="submit" className="fx-btn primary" disabled={act.busy} style={{ alignSelf: 'flex-start' }}><Save aria-hidden="true" />Salvar rascunho</button>
        {act.msg}
      </form>
    </Drawer>
  );
};

const CampaignDrawer: React.FC<{ id: string; onClose: () => void; onEdit: (d: Draft) => void }> = ({ id, onClose, onEdit }) => {
  const [c, setC] = useState<CampaignDetail | null>(null);
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const act = useAction();
  useEffect(() => { sellerService.campaign(id).then(setC).catch(() => onClose());   // Só ao trocar de registro: onClose é recriado a cada render e recarregaria (apagando o que se digitou).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!c) return <Drawer title="Campanha" onClose={onClose}><p className="fx-muted">Carregando…</p></Drawer>;
  const reach = c.status === 'RASCUNHO' ? preview : c.stats;

  return (
    <Drawer title={c.title} onClose={onClose} wide>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Chip>
        <span className="fx-muted">{c.number} · {dateOnly(c.valid_from)} a {dateOnly(c.valid_until)}</span>
      </div>
      {c.message && <p style={{ margin: 0 }}>{c.message}</p>}
      <Card>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>Produto</th><th style={thStyle}>Preço base</th><th style={thStyle}>Na campanha</th><th style={thStyle}>Mínimo</th></tr></thead>
          <tbody>{c.items.map((i) => (
            <tr key={i.gtin}><td style={tdStyle}><b>{i.name ?? i.gtin}</b></td><td style={tdStyle}>{brlPrice(i.base_price)}</td><td style={tdStyle}><b>{brlPrice(i.unit_price)}</b></td><td style={tdStyle}>{i.min_quantity}</td></tr>
          ))}</tbody>
        </table>
      </Card>

      {reach && (
        <Forest aria-label="Alcance">
          {reach.tooSmall ? (
            <p style={{ margin: 0 }}>O público é pequeno demais: a campanha precisa alcançar ao menos <b>{reach.minStores}</b> lojas, para nenhuma ser identificada. Amplie a área ou o público.</p>
          ) : (
            <>
              <h3 style={{ margin: 0, fontSize: 22 }}>{reach.reach} {reach.reach === 1 ? 'loja' : 'lojas'} {c.status === 'RASCUNHO' ? (reach.reach === 1 ? 'vai receber' : 'vão receber') : (reach.reach === 1 ? 'recebeu' : 'receberam')}</h3>
              <p style={{ margin: '6px 0 0', opacity: 0.9 }}>{reach.direct} direto da sua empresa · {reach.viaDistributor} pelo distribuidor da área</p>
              {reach.byDistributor && Object.keys(reach.byDistributor).length > 0 && (
                <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>{Object.entries(reach.byDistributor).map(([n, v]) => <li key={n}>{n}: {v} loja(s)</li>)}</ul>
              )}
              {reach.barred && Object.keys(reach.barred).length > 0 && (
                <>
                  <p style={{ margin: '12px 0 4px', fontWeight: 700 }}>Ficaram de fora</p>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>{Object.entries(reach.barred).map(([k, v]) => <li key={k}>{BARRED_LABEL[k] ?? k}: {v}</li>)}</ul>
                </>
              )}
            </>
          )}
        </Forest>
      )}

      {c.status === 'RASCUNHO' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="fx-btn ghost" disabled={act.busy} onClick={async () => { const r = await act.run(() => sellerService.previewCampaign(c.id)); if (r) setPreview(r); }}><Eye aria-hidden="true" />Ver o alcance</button>
          <button type="button" className="fx-btn ghost" onClick={() => onEdit(toDraft(c))}>Editar</button>
          <button type="button" className="fx-btn primary" disabled={act.busy || !preview || preview.tooSmall} onClick={async () => {
            if (!(await confirmDialog(`Enviar para ${preview?.reach} lojas? Depois de enviada, a campanha não muda mais.`, { confirmLabel: 'Enviar' }))) return;
            const r = await act.run(() => sellerService.sendCampaign(c.id), 'Campanha enviada.');
            if (r) setC(r);
          }}><Send aria-hidden="true" />Enviar</button>
          <button type="button" className="fx-btn ghost" disabled={act.busy} onClick={async () => { const r = await act.run(() => sellerService.closeCampaign(c.id)); if (r) setC(r); }}><XCircle aria-hidden="true" />Descartar</button>
        </div>
      )}
      {c.status === 'ENVIADA' && (
        <button type="button" className="fx-btn ghost" style={{ alignSelf: 'flex-start' }} disabled={act.busy} onClick={async () => {
          if (!(await confirmDialog('Encerrar a campanha antes do prazo? As lojas deixam de poder pedir por ela.', { danger: true, confirmLabel: 'Encerrar' }))) return;
          const r = await act.run(() => sellerService.closeCampaign(c.id));
          if (r) setC(r);
        }}><XCircle aria-hidden="true" />Encerrar agora</button>
      )}
      {c.status === 'RASCUNHO' && !preview && <p className="fx-muted" style={{ margin: 0 }}>Veja o alcance antes de enviar.</p>}
      {act.msg}

      {c.results && (
        <Card>
          <PanelTitle icon={Megaphone} title="Resultado" sub={c.results.byStatus.map((s) => `${s.n} ${({ ENTREGUE: 'sem abrir', VISTA: 'vistas', PEDIDO: 'com pedido', RECUSADA: 'recusadas' } as Record<string, string>)[s.status] ?? s.status}`).join(' · ')} />
          {c.results.orders.length === 0 ? <p className="fx-muted" style={{ marginTop: 10 }}>Nenhum pedido ainda.</p> : (
            <table style={{ ...tableStyle, marginTop: 10 }}>
              <thead><tr><th style={thStyle}>Pedido</th><th style={thStyle}>Loja</th><th style={thStyle}>Atendido por</th><th style={thStyle}>Valor</th><th style={thStyle}>Situação</th></tr></thead>
              <tbody>{c.results.orders.map((o) => (
                <tr key={o.number}>
                  <td style={tdStyle}>{o.number}<br /><small className="fx-muted">{dateTime(o.created_at)}</small></td>
                  <td style={tdStyle}>{o.market_name}<br /><small className="fx-muted">{o.city ? `${o.city} (${o.uf})` : ''}</small></td>
                  <td style={tdStyle}>{o.fulfilled_by}</td>
                  <td style={tdStyle}>{brlCents(o.total_cents)}</td>
                  <td style={tdStyle}><OrderChip status={o.status} /></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>
      )}
    </Drawer>
  );
};

const SellerCampaigns: React.FC = () => <SellerLayout><Campaigns /></SellerLayout>;
export default SellerCampaigns;
