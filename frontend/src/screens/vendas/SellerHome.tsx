import React from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, Package, ShoppingBag, Tags, TrendingUp, Users } from 'lucide-react';
import SellerLayout, { useSeller } from './SellerLayout';
import { ActionHub, Card, Kpi, PageHero, PanelTitle } from '../../components/flow/Flow';
import { brlCents, sellerService } from '../../services/commerce.service';
import { OrderChip, dateTime, tableStyle, tdStyle, thStyle, useLoad } from './ui';

const Home: React.FC = () => {
  const { me } = useSeller();
  const dash = useLoad(() => sellerService.dashboard());
  const fresh = useLoad(() => sellerService.orders('ENVIADO'));
  const d = dash.data;
  const count = (s: string) => d?.orders.find((o) => o.status === s)?.n ?? 0;
  const pending = d?.products.find((p) => p.status === 'PENDENTE')?.n ?? 0;
  const active = d?.products.find((p) => p.status === 'ATIVO')?.n ?? 0;

  return (
    <>
      <PageHero
        title={count('ENVIADO') > 0
          ? <>Você tem <mark>{count('ENVIADO')} {count('ENVIADO') === 1 ? 'pedido novo' : 'pedidos novos'}</mark> para confirmar.</>
          : <>Nenhum pedido esperando por você agora.</>}
        subtitle={<>{brlCents(d?.last30Cents ?? 0)} em pedidos confirmados nos últimos 30 dias, de {d?.clients ?? 0} {d?.clients === 1 ? 'cliente' : 'clientes'}.</>}
        side={<ActionHub icon={TrendingUp} actions={[
          { label: 'Ver os pedidos', icon: ShoppingBag, to: '/vendas/pedidos' },
          { label: 'Nova campanha', icon: Megaphone, to: '/vendas/campanhas?nova=1' },
          { label: 'Cuidar do catálogo', icon: Package, to: '/vendas/catalogo' },
        ]} />} />

      {active === 0 && (
        <Card>
          <PanelTitle icon={Package} title="Comece pelo catálogo" sub={me?.kind === 'INDUSTRIA'
            ? 'Cadastre os produtos da sua empresa. Cada um fica disponível às lojas depois que conferimos que ele é seu.'
            : 'Cadastre os produtos que você vende, com embalagem, mínimo e preço base. As lojas da sua área já podem comprar.'} />
          <p style={{ marginTop: 14 }}><Link to="/vendas/catalogo" className="fx-btn primary"><Package aria-hidden="true" />Cadastrar produtos</Link></p>
        </Card>
      )}

      <div className="fx-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <Kpi label="A confirmar" value={count('ENVIADO')} icon={ShoppingBag} />
        <Kpi label="A faturar" value={count('CONFIRMADO')} icon={ShoppingBag} />
        <Kpi label="A entregar" value={count('FATURADO')} icon={ShoppingBag} />
        <Kpi label="Campanhas no ar" value={d?.activeCampaigns ?? 0} icon={Megaphone} />
        <Kpi label="Produtos à venda" value={active} hint={pending ? `${pending} aguardando conferência` : undefined} icon={Tags} />
        <Kpi label="Clientes" value={d?.clients ?? 0} icon={Users} />
      </div>

      <Card>
        <PanelTitle icon={ShoppingBag} title="Pedidos novos" sub="Confirme logo: a loja vê na hora quando você confirma." />
        {!fresh.data ? <p className="fx-muted">Carregando…</p> : fresh.data.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Nenhum pedido novo.</p> : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={tableStyle}>
              <thead><tr><th style={thStyle}>Pedido</th><th style={thStyle}>Loja</th><th style={thStyle}>Valor</th><th style={thStyle}>Situação</th></tr></thead>
              <tbody>
                {fresh.data.slice(0, 8).map((o) => (
                  <tr key={o.id}>
                    <td style={tdStyle}><Link to={`/vendas/pedidos?id=${o.id}`}><b>{o.number}</b></Link><br /><small className="fx-muted">{dateTime(o.created_at)}</small></td>
                    <td style={tdStyle}>{o.market_name}<br /><small className="fx-muted">{o.city ? `${o.city} (${o.uf})` : ''}</small></td>
                    <td style={tdStyle}><b className="fx-num">{brlCents(o.total_cents)}</b></td>
                    <td style={tdStyle}><OrderChip status={o.status} /></td>
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

const SellerHome: React.FC = () => <SellerLayout><Home /></SellerLayout>;
export default SellerHome;
