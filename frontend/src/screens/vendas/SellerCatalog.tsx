import React, { useMemo, useState } from 'react';
import { Package, Pause, Play, Plus, Save, Trash2 } from 'lucide-react';
import SellerLayout, { useSeller } from './SellerLayout';
import { Card, Chip, PageHero, PanelTitle } from '../../components/flow/Flow';
import { confirmDialog } from '../../components/common/Dialogs';
import { brlPrice, qtyLabel, sellerService, type SellerProduct } from '../../services/commerce.service';
import { Drawer, field, grid, tableStyle, tdStyle, thStyle, useAction, useLoad } from './ui';

const STATUS: Record<SellerProduct['status'], { label: string; tone: 'green' | 'amber' | 'red' | 'gray' }> = {
  ATIVO: { label: 'À venda', tone: 'green' },
  PENDENTE: { label: 'Em conferência', tone: 'amber' },
  PAUSADO: { label: 'Pausado', tone: 'gray' },
  NEGADO: { label: 'Não liberado', tone: 'red' },
};

const empty = { gtin: '', name: '', brand: '', unitType: 'CX', unitsPerPack: '', minQuantity: '1', multipleOf: '1', basePrice: '', inStock: true };

const Catalog: React.FC = () => {
  const { me } = useSeller();
  const list = useLoad(() => sellerService.products());
  const [edit, setEdit] = useState<typeof empty | null>(null);
  const [q, setQ] = useState('');
  const act = useAction();
  const rows = useMemo(() => (list.data ?? []).filter((p) => !q || `${p.name} ${p.gtin} ${p.brand ?? ''}`.toLowerCase().includes(q.toLowerCase())), [list.data, q]);

  const open = (p?: SellerProduct) => setEdit(p ? {
    gtin: p.gtin, name: p.name, brand: p.brand ?? '', unitType: p.unit_type, unitsPerPack: p.units_per_pack == null ? '' : String(p.units_per_pack),
    minQuantity: String(p.min_quantity), multipleOf: String(p.multiple_of), basePrice: String(p.base_price), inStock: p.in_stock,
  } : { ...empty });

  return (
    <>
      <PageHero title={<>Seu catálogo</>}
        subtitle={me?.kind === 'INDUSTRIA'
          ? 'Os produtos da sua empresa. Cada um fica à venda depois que conferimos que ele é seu; nas áreas de distribuidor exclusivo, a loja compra pelo distribuidor.'
          : 'Os produtos que você vende. As lojas da sua área de entrega compram pelo preço base ou pela tabela que alcança cada uma.'}
        side={<button type="button" className="fx-btn lime" onClick={() => open()}><Plus aria-hidden="true" />Novo produto</button>} />
      <Card>
        <PanelTitle icon={Package} title={`${list.data?.length ?? 0} produtos`} right={
          <input className="fx-input" placeholder="Procurar por nome, código ou marca" aria-label="Procurar no catálogo" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />} />
        {!list.data ? <p className="fx-muted">Carregando…</p> : rows.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Nenhum produto ainda.</p> : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={tableStyle}>
              <thead><tr><th style={thStyle}>Produto</th><th style={thStyle}>Embalagem</th><th style={thStyle}>Mínimo</th><th style={thStyle}>Preço base</th><th style={thStyle}>Situação</th><th style={thStyle} /></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td style={tdStyle}><b>{p.name}</b><br /><small className="fx-muted">{p.gtin}{p.brand ? ` · ${p.brand}` : ''}</small></td>
                    <td style={tdStyle}>{p.unit_type}{p.units_per_pack ? ` c/ ${qtyLabel(p.units_per_pack)}` : ''}</td>
                    <td style={tdStyle}>{qtyLabel(p.min_quantity)}{Number(p.multiple_of) > 1 ? <><br /><small className="fx-muted">múltiplos de {qtyLabel(p.multiple_of)}</small></> : null}</td>
                    <td style={tdStyle}><b className="fx-num">{brlPrice(p.base_price)}</b>{!p.in_stock && <><br /><small style={{ color: 'var(--fx-red)' }}>sem estoque</small></>}</td>
                    <td style={tdStyle}><Chip tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Chip>{p.status_note && <><br /><small className="fx-muted">{p.status_note}</small></>}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <button type="button" className="fx-btn ghost small" onClick={() => open(p)}>Editar</button>{' '}
                      {(p.status === 'ATIVO' || p.status === 'PAUSADO') && (
                        <button type="button" className="fx-btn ghost small" aria-label={p.status === 'ATIVO' ? `Pausar ${p.name}` : `Reativar ${p.name}`}
                          onClick={async () => { await act.run(() => sellerService.pauseProduct(p.gtin, p.status === 'ATIVO')); await list.reload(); }}>
                          {p.status === 'ATIVO' ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {act.msg}
      </Card>

      {edit && (
        <Drawer title={list.data?.some((p) => p.gtin === edit.gtin) ? 'Editar produto' : 'Novo produto'} onClose={() => setEdit(null)}>
          <form style={{ display: 'grid', gap: 12 }} onSubmit={async (e) => {
            e.preventDefault();
            const r = await act.run(() => sellerService.saveProduct({ ...edit, unitsPerPack: edit.unitsPerPack || null }), 'Produto salvo.');
            if (r) { setEdit(null); await list.reload(); }
          }}>
            {field('Código de barras (GTIN/EAN)', <input value={edit.gtin} onChange={(e) => setEdit({ ...edit, gtin: e.target.value })} inputMode="numeric" required
              readOnly={list.data?.some((p) => p.gtin === edit.gtin)} />)}
            {field('Nome', <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />)}
            {field('Marca', <input value={edit.brand} onChange={(e) => setEdit({ ...edit, brand: e.target.value })} />)}
            <div style={grid(140)}>
              {field('Vende em', <select value={edit.unitType} onChange={(e) => setEdit({ ...edit, unitType: e.target.value })}>
                <option value="UN">Unidade</option><option value="CX">Caixa</option><option value="FD">Fardo</option><option value="PCT">Pacote</option><option value="DP">Display</option>
              </select>)}
              {field('Unidades na embalagem', <input value={edit.unitsPerPack} onChange={(e) => setEdit({ ...edit, unitsPerPack: e.target.value })} inputMode="decimal" />)}
              {field('Pedido mínimo', <input value={edit.minQuantity} onChange={(e) => setEdit({ ...edit, minQuantity: e.target.value })} inputMode="decimal" required />)}
              {field('Em múltiplos de', <input value={edit.multipleOf} onChange={(e) => setEdit({ ...edit, multipleOf: e.target.value })} inputMode="decimal" required />)}
            </div>
            {field('Preço base (por embalagem de venda)', <input value={edit.basePrice} onChange={(e) => setEdit({ ...edit, basePrice: e.target.value })} inputMode="decimal" required />,
              'Vale onde nenhuma tabela de preço alcança a loja.')}
            <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="button" role="switch" className="fx-switch" aria-checked={edit.inStock} onClick={() => setEdit({ ...edit, inStock: !edit.inStock })} aria-label="Com estoque" />
              Com estoque
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="submit" className="fx-btn primary" disabled={act.busy}><Save aria-hidden="true" />Salvar</button>
              {list.data?.some((p) => p.gtin === edit.gtin) && (
                <button type="button" className="fx-btn ghost" disabled={act.busy} onClick={async () => {
                  if (!(await confirmDialog('Tirar este produto do catálogo? Ele sai também das tabelas de preço.', { danger: true, confirmLabel: 'Remover' }))) return;
                  await act.run(() => sellerService.removeProduct(edit.gtin));
                  setEdit(null);
                  await list.reload();
                }}><Trash2 aria-hidden="true" />Remover</button>
              )}
            </div>
            {act.msg}
          </form>
        </Drawer>
      )}
    </>
  );
};

const SellerCatalog: React.FC = () => <SellerLayout><Catalog /></SellerLayout>;
export default SellerCatalog;
