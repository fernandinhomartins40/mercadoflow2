import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, FileText, Network, ShoppingBag, Truck, XCircle } from 'lucide-react';
import SellerLayout, { useSeller } from './SellerLayout';
import { Card, PageHero, PanelTitle, PillTabs } from '../../components/flow/Flow';
import { brlCents, brlPrice, cnpjLabel, qtyLabel, sellerService, type Order } from '../../services/commerce.service';
import { promptDialog } from '../../components/common/Dialogs';
import { Drawer, OrderChip, dateTime, field, tableStyle, tdStyle, thStyle, useAction, useLoad } from './ui';

type Tab = 'ENVIADO' | 'CONFIRMADO' | 'FATURADO' | 'TODOS' | 'DISTRIBUIDORES';

const Orders: React.FC = () => {
  const { me } = useSeller();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('ENVIADO');
  const list = useLoad(() => (tab === 'DISTRIBUIDORES' ? Promise.resolve([]) : sellerService.orders(tab === 'TODOS' ? undefined : tab)), [tab]);
  const viaDistributors = useLoad(() => (me?.kind === 'INDUSTRIA' && tab === 'DISTRIBUIDORES' ? sellerService.ordersByDistributors() : Promise.resolve([])), [tab, me?.kind]);
  const openId = params.get('id');
  const close = () => { params.delete('id'); setParams(params, { replace: true }); void list.reload(); };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'ENVIADO', label: 'A confirmar' }, { key: 'CONFIRMADO', label: 'A faturar' }, { key: 'FATURADO', label: 'A entregar' }, { key: 'TODOS', label: 'Todos' },
    ...(me?.kind === 'INDUSTRIA' ? [{ key: 'DISTRIBUIDORES' as Tab, label: 'Pelos distribuidores' }] : []),
  ];

  return (
    <>
      <PageHero title={<>Pedidos das lojas</>} subtitle="Confirme o que vai atender, registre a nota fiscal e marque a entrega. A loja acompanha cada passo." />
      <Card>
        <PillTabs label="Situação dos pedidos" value={tab} onChange={setTab} tabs={tabs} />
        {tab === 'DISTRIBUIDORES' ? (
          <>
            <p className="fx-muted" style={{ marginTop: 12 }}>Pedidos das suas campanhas atendidos pelos seus distribuidores. Quem confirma e entrega é o distribuidor.</p>
            {!viaDistributors.data ? <p className="fx-muted">Carregando…</p> : viaDistributors.data.length === 0 ? <p className="fx-muted">Nenhum pedido ainda.</p> : (
              <div style={{ overflowX: 'auto', marginTop: 8 }}>
                <table style={tableStyle}>
                  <thead><tr><th style={thStyle}>Pedido</th><th style={thStyle}>Loja</th><th style={thStyle}>Distribuidor</th><th style={thStyle}>Campanha</th><th style={thStyle}>Valor</th><th style={thStyle}>Situação</th></tr></thead>
                  <tbody>
                    {viaDistributors.data.map((o) => (
                      <tr key={o.number}>
                        <td style={tdStyle}><b>{o.number}</b><br /><small className="fx-muted">{dateTime(o.created_at)}</small></td>
                        <td style={tdStyle}>{o.market_name}<br /><small className="fx-muted">{o.city ? `${o.city} (${o.uf})` : ''}</small></td>
                        <td style={tdStyle}><Network size={14} aria-hidden="true" /> {o.distributor_name}</td>
                        <td style={tdStyle}>{o.campaign_number ?? '—'}</td>
                        <td style={tdStyle}><b className="fx-num">{brlCents(o.total_cents)}</b></td>
                        <td style={tdStyle}><OrderChip status={o.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : !list.data ? <p className="fx-muted">Carregando…</p> : list.data.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Nenhum pedido aqui.</p> : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={tableStyle}>
              <thead><tr><th style={thStyle}>Pedido</th><th style={thStyle}>Loja</th><th style={thStyle}>Itens</th><th style={thStyle}>Valor</th><th style={thStyle}>Situação</th><th style={thStyle} /></tr></thead>
              <tbody>
                {list.data.map((o) => (
                  <tr key={o.id}>
                    <td style={tdStyle}><b>{o.number}</b><br /><small className="fx-muted">{dateTime(o.created_at)}{o.campaign_number ? ` · campanha ${o.campaign_number}` : ''}</small></td>
                    <td style={tdStyle}>{o.market_name}<br /><small className="fx-muted">{o.city ? `${o.city} (${o.uf})` : ''}</small></td>
                    <td style={tdStyle}>{o.items}</td>
                    <td style={tdStyle}><b className="fx-num">{brlCents(o.total_cents)}</b></td>
                    <td style={tdStyle}><OrderChip status={o.status} /></td>
                    <td style={tdStyle}><button type="button" className="fx-btn ghost small" onClick={() => setParams({ id: o.id })}>Abrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {openId && <OrderDrawer id={openId} onClose={close} />}
    </>
  );
};

const OrderDrawer: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const [o, setO] = useState<Order | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [nfe, setNfe] = useState({ number: '', key: '' });
  const act = useAction();

  useEffect(() => {
    sellerService.order(id).then((r) => {
      setO(r);
      setQty(Object.fromEntries(r.items.map((i) => [i.id, String(i.quantity)])));
    }).catch(() => onClose());
    // Só ao trocar de registro: onClose é recriado a cada render e recarregaria (apagando o que se digitou).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!o) return <Drawer title="Pedido" onClose={onClose}><p className="fx-muted">Carregando…</p></Drawer>;
  const set = (r?: Order) => { if (r) setO(r); };
  const address = [o.street, o.street_number, o.neighborhood, o.city && `${o.city} (${o.uf})`, o.postal_code].filter(Boolean).join(', ');

  return (
    <Drawer title={`Pedido ${o.number}`} onClose={onClose} wide>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <OrderChip status={o.status} />
        {o.campaign_number && <span className="fx-muted">Campanha {o.campaign_number}</span>}
      </div>
      <Card>
        <PanelTitle icon={ShoppingBag} title={o.market_name} sub={`CNPJ ${cnpjLabel(o.market_cnpj)}`} />
        <p style={{ margin: '10px 0 0' }}>{address || <span className="fx-muted">Endereço não cadastrado.</span>}</p>
        {o.notes && <p className="fx-muted" style={{ margin: '8px 0 0' }}>Observação: {o.notes}</p>}
        {o.status_reason && <p className="fx-muted" style={{ margin: '8px 0 0' }}>Último registro: {o.status_reason}</p>}
      </Card>

      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead><tr><th style={thStyle}>Produto</th><th style={thStyle}>Pedido</th><th style={thStyle}>{o.status === 'ENVIADO' ? 'Vou atender' : 'Confirmado'}</th><th style={thStyle}>Preço</th><th style={thStyle}>Subtotal</th></tr></thead>
            <tbody>
              {o.items.map((i) => (
                <tr key={i.id}>
                  <td style={tdStyle}><b>{i.name}</b><br /><small className="fx-muted">{i.gtin} · {i.unit_type}{i.units_per_pack ? ` c/ ${qtyLabel(i.units_per_pack)}` : ''} · {i.price_source === 'CAMPANHA' ? 'preço da campanha' : i.price_source === 'TABELA' ? 'tabela' : 'preço base'}</small></td>
                  <td style={tdStyle}>{qtyLabel(i.quantity)}</td>
                  <td style={tdStyle}>{o.status === 'ENVIADO'
                    ? <input className="fx-input" style={{ width: 90 }} inputMode="decimal" aria-label={`Quantidade a atender de ${i.name}`} value={qty[i.id] ?? ''} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} />
                    : qtyLabel(i.quantity_confirmed ?? i.quantity)}</td>
                  <td style={tdStyle}>{brlPrice(i.unit_price)}</td>
                  <td style={tdStyle}><b className="fx-num">{brlCents(i.subtotal_cents)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ margin: '12px 0 0', textAlign: 'right' }}>Total <b className="fx-num" style={{ fontSize: 20 }}>{brlCents(o.total_cents)}</b></p>
        {o.fee_cents != null && <p className="fx-muted" style={{ margin: '4px 0 0', textAlign: 'right' }}>Taxa MercadoFlow: {brlCents(o.fee_cents)}</p>}
      </Card>

      {o.status === 'ENVIADO' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="fx-btn primary" disabled={act.busy} onClick={async () => set(await act.run(() => sellerService.confirm(o.id,
            o.items.map((i) => ({ id: i.id, quantityConfirmed: Number(String(qty[i.id] ?? i.quantity).replace(',', '.')) }))), 'Pedido confirmado. A loja já foi avisada.'))}>
            <CheckCircle2 aria-hidden="true" />Confirmar pedido
          </button>
          <button type="button" className="fx-btn ghost" disabled={act.busy} onClick={async () => {
            const reason = await promptDialog('Por que não vai atender? A loja vai ler.', '', { confirmLabel: 'Recusar pedido' });
            if (reason) set(await act.run(() => sellerService.refuse(o.id, reason), 'Pedido recusado.'));
          }}><XCircle aria-hidden="true" />Recusar</button>
        </div>
      )}
      {o.status === 'CONFIRMADO' && (
        <Card>
          <PanelTitle icon={FileText} title="Registrar a nota fiscal" sub="Com a chave, conferimos a entrega pela nota que a loja recebe." />
          <form style={{ display: 'grid', gap: 12, marginTop: 12 }} onSubmit={async (e) => { e.preventDefault(); set(await act.run(() => sellerService.invoice(o.id, nfe.number, nfe.key), 'Nota registrada.')); }}>
            {field('Número da nota', <input value={nfe.number} onChange={(e) => setNfe({ ...nfe, number: e.target.value })} required />)}
            {field('Chave de acesso (44 dígitos)', <input value={nfe.key} onChange={(e) => setNfe({ ...nfe, key: e.target.value })} inputMode="numeric" />, 'Opcional.')}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="submit" className="fx-btn primary" disabled={act.busy}><FileText aria-hidden="true" />Registrar nota</button>
              <button type="button" className="fx-btn ghost" disabled={act.busy} onClick={async () => {
                const reason = await promptDialog('Por que vai cancelar? A loja vai ler.', '', { confirmLabel: 'Cancelar pedido' });
                if (reason) set(await act.run(() => sellerService.refuse(o.id, reason), 'Pedido cancelado.'));
              }}><XCircle aria-hidden="true" />Cancelar pedido</button>
            </div>
          </form>
        </Card>
      )}
      {o.status === 'FATURADO' && (
        <button type="button" className="fx-btn primary" disabled={act.busy} onClick={async () => set(await act.run(() => sellerService.delivered(o.id), 'Entrega registrada.'))}>
          <Truck aria-hidden="true" />Marcar como entregue
        </button>
      )}
      {act.msg}

      <Card>
        <PanelTitle title="Histórico" />
        <ol className="fx-stack" style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, gap: 8 }}>
          {o.events.map((e, i) => (
            <li key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span><OrderChip status={e.to_status} /> <small className="fx-muted">{e.actor_side === 'LOJA' ? 'pela loja' : e.actor_side === 'VENDEDOR' ? 'por você' : ''}{e.note ? ` · ${e.note}` : ''}</small></span>
              <small className="fx-muted">{dateTime(e.at)}</small>
            </li>
          ))}
        </ol>
      </Card>
    </Drawer>
  );
};

const SellerOrders: React.FC = () => <SellerLayout><Orders /></SellerLayout>;
export default SellerOrders;
