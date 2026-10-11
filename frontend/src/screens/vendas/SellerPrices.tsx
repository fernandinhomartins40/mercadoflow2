import React, { useState } from 'react';
import { Plus, Save, Tags, Trash2 } from 'lucide-react';
import SellerLayout from './SellerLayout';
import { Card, Chip, PageHero, PanelTitle } from '../../components/flow/Flow';
import { confirmDialog } from '../../components/common/Dialogs';
import { brlPrice, sellerService, type PriceList } from '../../services/commerce.service';
import { Drawer, dateOnly, field, grid, splitList, tableStyle, tdStyle, thStyle, useAction, useLoad } from './ui';

interface Draft {
  id: string | null;
  name: string;
  priority: string;
  audience: 'TODAS' | 'NOMINAL';
  scopeUfs: string;
  scopeCities: string;
  validFrom: string;
  validUntil: string;
  status: 'ATIVA' | 'PAUSADA';
  marketIds: string[];
  items: { gtin: string; unitPrice: string; tiers: string }[];
}

// Faixas separadas por ponto e vírgula, para o preço poder usar vírgula decimal: "10:5,20; 50:4,90".
const tiersText = (t: { minQty: number; unitPrice: number }[]) =>
  t.map((x) => `${x.minQty}:${String(x.unitPrice).replace('.', ',')}`).join('; ');
const parseTiers = (v: string) => v.split(/[;\n]+/).map((p) => p.replace(/\s+/g, '')).filter(Boolean).map((p) => {
  const [minQty, unitPrice] = p.split(':');
  return { minQty: minQty.replace(',', '.'), unitPrice: (unitPrice ?? '').replace(',', '.') };
});

const Prices: React.FC = () => {
  const lists = useLoad(() => sellerService.priceLists());
  const products = useLoad(() => sellerService.products());
  const clients = useLoad(() => sellerService.clients().catch(() => []));
  const [draft, setDraft] = useState<Draft | null>(null);
  const act = useAction();

  const open = (l?: PriceList) => setDraft(l ? {
    id: l.id, name: l.name, priority: String(l.priority), audience: l.audience, scopeUfs: l.scope_ufs.join(', '), scopeCities: l.scope_cities.join(', '),
    validFrom: l.valid_from?.slice(0, 10) ?? '', validUntil: l.valid_until?.slice(0, 10) ?? '', status: l.status, marketIds: l.markets.map((m) => m.id),
    items: l.items.map((i) => ({ gtin: i.gtin, unitPrice: String(i.unit_price).replace('.', ','), tiers: tiersText(i.tiers) })),
  } : { id: null, name: '', priority: '0', audience: 'TODAS', scopeUfs: '', scopeCities: '', validFrom: '', validUntil: '', status: 'ATIVA', marketIds: [], items: [] });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const body = {
      name: draft.name, priority: draft.priority, audience: draft.audience, scopeUfs: splitList(draft.scopeUfs), scopeCities: splitList(draft.scopeCities),
      validFrom: draft.validFrom || undefined, validUntil: draft.validUntil || undefined, status: draft.status, marketIds: draft.marketIds,
      items: draft.items.filter((i) => i.gtin && i.unitPrice).map((i) => ({ gtin: i.gtin, unitPrice: i.unitPrice.replace(',', '.'), tiers: parseTiers(i.tiers) })),
    };
    const r = await act.run(() => sellerService.savePriceList(draft.id, body), 'Tabela salva.');
    if (r) { lists.setData(r); setDraft(null); }
  };

  const authorized = (clients.data ?? []).filter((c) => c.authorized);

  return (
    <>
      <PageHero title={<>Tabelas de preço</>}
        subtitle="Preço por região e por quantidade. Vale a tabela de maior prioridade que alcança a loja; sem tabela, vale o preço base do catálogo."
        side={<button type="button" className="fx-btn lime" onClick={() => open()}><Plus aria-hidden="true" />Nova tabela</button>} />
      <Card>
        <PanelTitle icon={Tags} title="Suas tabelas" />
        {!lists.data ? <p className="fx-muted">Carregando…</p> : lists.data.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Nenhuma tabela ainda: as lojas veem o preço base.</p> : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={tableStyle}>
              <thead><tr><th style={thStyle}>Tabela</th><th style={thStyle}>Alcance</th><th style={thStyle}>Validade</th><th style={thStyle}>Produtos</th><th style={thStyle}>Prioridade</th><th style={thStyle} /></tr></thead>
              <tbody>
                {lists.data.map((l) => (
                  <tr key={l.id}>
                    <td style={tdStyle}><b>{l.name}</b> {l.status === 'PAUSADA' && <Chip tone="gray">pausada</Chip>}</td>
                    <td style={tdStyle}>{l.audience === 'NOMINAL' ? `${l.markets.length} loja(s) pelo nome`
                      : l.scope_ufs.length || l.scope_cities.length ? [l.scope_ufs.join(', '), l.scope_cities.length ? `${l.scope_cities.length} cidade(s)` : ''].filter(Boolean).join(' e ') : 'Toda a sua área'}</td>
                    <td style={tdStyle}>{dateOnly(l.valid_from)} a {l.valid_until ? dateOnly(l.valid_until) : 'sem fim'}</td>
                    <td style={tdStyle}>{l.items_count}</td>
                    <td style={tdStyle}>{l.priority}</td>
                    <td style={tdStyle}><button type="button" className="fx-btn ghost small" onClick={() => open(l)}>Editar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {draft && (
        <Drawer title={draft.id ? 'Editar tabela' : 'Nova tabela'} onClose={() => setDraft(null)} wide>
          <form style={{ display: 'grid', gap: 12 }} onSubmit={save}>
            <div style={grid(180)}>
              {field('Nome', <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />)}
              {field('Prioridade', <input value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} inputMode="numeric" />, 'A maior vence quando duas alcançam a loja.')}
              {field('Situação', <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft['status'] })}><option value="ATIVA">Ativa</option><option value="PAUSADA">Pausada</option></select>)}
            </div>
            <div style={grid(180)}>
              {field('Vale de', <input type="date" value={draft.validFrom} onChange={(e) => setDraft({ ...draft, validFrom: e.target.value })} />)}
              {field('Vale até', <input type="date" value={draft.validUntil} onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })} />, 'Em branco: sem fim.')}
              {field('Para quem', <select value={draft.audience} onChange={(e) => setDraft({ ...draft, audience: e.target.value as Draft['audience'] })}>
                <option value="TODAS">Todas as lojas da região</option><option value="NOMINAL">Lojas escolhidas (que autorizaram)</option>
              </select>)}
            </div>
            {draft.audience === 'TODAS' ? (
              <div style={grid(180)}>
                {field('UFs', <input value={draft.scopeUfs} onChange={(e) => setDraft({ ...draft, scopeUfs: e.target.value })} placeholder="SP, MG" />, 'Em branco: toda a sua área de entrega.')}
                {field('Cidades (código IBGE)', <input value={draft.scopeCities} onChange={(e) => setDraft({ ...draft, scopeCities: e.target.value })} placeholder="3509502" />)}
              </div>
            ) : (
              <fieldset style={{ border: '1px solid var(--fx-line)', borderRadius: 12, padding: 12 }}>
                <legend className="fx-muted" style={{ padding: '0 6px' }}>Lojas que autorizaram a sua empresa</legend>
                {authorized.length === 0 ? <p className="fx-muted" style={{ margin: 0 }}>Nenhuma loja autorizou ainda.</p> : authorized.map((c) => (
                  <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
                    <input type="checkbox" checked={draft.marketIds.includes(c.id)} onChange={(e) => setDraft({ ...draft, marketIds: e.target.checked ? [...draft.marketIds, c.id] : draft.marketIds.filter((m) => m !== c.id) })} />
                    {c.name} <span className="fx-muted">{c.city ? `· ${c.city} (${c.uf})` : ''}</span>
                  </label>
                ))}
              </fieldset>
            )}

            <PanelTitle title="Preços" sub="Faixas: quantidade mínima e preço, separadas por ponto e vírgula (ex.: 10:5,20; 50:4,90)." />
            {draft.items.map((it, i) => (
              <div key={i} style={{ ...grid(150), alignItems: 'end' }}>
                {field('Produto', <select value={it.gtin} onChange={(e) => { const items = [...draft.items]; items[i] = { ...it, gtin: e.target.value }; setDraft({ ...draft, items }); }} required>
                  <option value="">Escolha</option>
                  {(products.data ?? []).filter((p) => p.status !== 'NEGADO').map((p) => <option key={p.gtin} value={p.gtin}>{p.name} · base {brlPrice(p.base_price)}</option>)}
                </select>)}
                {field('Preço', <input value={it.unitPrice} onChange={(e) => { const items = [...draft.items]; items[i] = { ...it, unitPrice: e.target.value }; setDraft({ ...draft, items }); }} inputMode="decimal" required />)}
                {field('Faixas por quantidade', <input value={it.tiers} onChange={(e) => { const items = [...draft.items]; items[i] = { ...it, tiers: e.target.value }; setDraft({ ...draft, items }); }} placeholder="10:5,20; 50:4,90" />)}
                <button type="button" className="fx-btn ghost small" aria-label="Tirar o produto da tabela" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })}><Trash2 aria-hidden="true" /></button>
              </div>
            ))}
            <button type="button" className="fx-btn ghost small" style={{ justifySelf: 'start' }} onClick={() => setDraft({ ...draft, items: [...draft.items, { gtin: '', unitPrice: '', tiers: '' }] })}><Plus aria-hidden="true" />Adicionar produto</button>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="submit" className="fx-btn primary" disabled={act.busy}><Save aria-hidden="true" />Salvar tabela</button>
              {draft.id && (
                <button type="button" className="fx-btn ghost" disabled={act.busy} onClick={async () => {
                  if (!(await confirmDialog('Apagar esta tabela? As lojas passam a ver o preço base ou outra tabela.', { danger: true, confirmLabel: 'Apagar' }))) return;
                  const r = await act.run(() => sellerService.deletePriceList(draft.id!));
                  if (r) { lists.setData(r); setDraft(null); }
                }}><Trash2 aria-hidden="true" />Apagar</button>
              )}
            </div>
            {act.msg}
          </form>
        </Drawer>
      )}
    </>
  );
};

const SellerPrices: React.FC = () => <SellerLayout><Prices /></SellerLayout>;
export default SellerPrices;
