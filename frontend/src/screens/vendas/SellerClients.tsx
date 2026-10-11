import React from 'react';
import { ShieldCheck, Users } from 'lucide-react';
import SellerLayout from './SellerLayout';
import { Card, Chip, PageHero, PanelTitle } from '../../components/flow/Flow';
import { brlCents, sellerService } from '../../services/commerce.service';
import { dateTime, tableStyle, tdStyle, thStyle, useLoad } from './ui';

const Clients: React.FC = () => {
  const list = useLoad(() => sellerService.clients());
  return (
    <>
      <PageHero title={<>Seus clientes</>}
        subtitle="As lojas que já compraram de você ou que autorizaram a sua empresa a vê-las pelo nome. Nenhuma outra loja aparece aqui." />
      <Card>
        <PanelTitle icon={Users} title={`${list.data?.length ?? 0} lojas`} />
        {!list.data ? <p className="fx-muted">Carregando…</p> : list.data.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Ainda nenhuma loja. Os clientes aparecem com o primeiro pedido ou quando uma loja autoriza a sua empresa.</p> : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={tableStyle}>
              <thead><tr><th style={thStyle}>Loja</th><th style={thStyle}>Pedidos</th><th style={thStyle}>Total comprado</th><th style={thStyle}>Último pedido</th><th style={thStyle} /></tr></thead>
              <tbody>
                {list.data.map((c) => (
                  <tr key={c.id}>
                    <td style={tdStyle}><b>{c.name}</b><br /><small className="fx-muted">{c.city ? `${c.city} (${c.uf})` : ''}</small></td>
                    <td style={tdStyle}>{c.orders ?? 0}</td>
                    <td style={tdStyle}>{brlCents(c.total_cents ?? 0)}</td>
                    <td style={tdStyle}>{c.last_order_at ? dateTime(c.last_order_at) : '—'}</td>
                    <td style={tdStyle}>{c.authorized && <Chip tone="green" icon={ShieldCheck}>autorizou</Chip>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
};

const SellerClients: React.FC = () => <SellerLayout><Clients /></SellerLayout>;
export default SellerClients;
